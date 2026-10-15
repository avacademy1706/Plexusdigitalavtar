import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { AvatarState, type AvatarKind, type AvatarTransform, type SpeechAudioSource } from "../../types/avatar";
import { createLipSyncPlayer } from "../../hooks/useLipSync";
import { MorphDriver } from "./BlendshapeMapper";

const HEIGHT = 1.75;

/**
 * Face landmarks of public/avatar/plexi_front_view.png, in source-image pixels (300 x 860).
 * Change these if you swap the illustration - blink and mouth are placed from them.
 */
export const IMAGE_FACE = {
  size: [300, 860] as const,
  eyeL: [148.3, 118] as const,
  eyeR: [190.8, 121.7] as const,
  mouth: [168, 156] as const,
  /** Radius of the iris (including its dark outline) in source pixels. */
  irisRadius: 7.6,
  /** Half-size of the eye region that the eyelid covers, in source pixels. */
  eyeRadius: [18.5, 14.5] as const,
  /** Width of the speaking-mouth overlay as a fraction of image width. */
  mouthWidth: 0.085,
  /** Maximum speaking-mouth opening as a fraction of image height. */
  maxOpen: 0.02,
} as const;

const toUv = ([x, y]: readonly [number, number]): string =>
  `vec2(${(x / IMAGE_FACE.size[0]).toFixed(4)}, ${(1 - y / IMAGE_FACE.size[1]).toFixed(4)})`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The only image manipulation is a real eyelid: a flat skin-coloured lid slides down over each eye
 * (clipped to the eye shape) with a dark lash line on its edge. No pixels are stretched or warped,
 * so the illustration keeps its exact look when the eyes are open.
 */
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uBlink;
  uniform vec2 uGaze;
  varying vec2 vUv;
  const float IRIS_R = ${IMAGE_FACE.irisRadius.toFixed(1)};

  const vec2 SIZE = vec2(${IMAGE_FACE.size[0]}.0, ${IMAGE_FACE.size[1]}.0);
  const vec2 EYE_L = ${toUv(IMAGE_FACE.eyeL)};
  const vec2 EYE_R = ${toUv(IMAGE_FACE.eyeR)};
  const vec2 EYE_RADIUS = vec2(${IMAGE_FACE.eyeRadius[0].toFixed(1)}, ${IMAGE_FACE.eyeRadius[1].toFixed(1)});

  vec4 lid(vec4 col, vec2 uv, vec2 c) {
    vec2 d = (uv - c) * SIZE;                       // pixels from eye centre, y up
    float inside = 1.0 - smoothstep(0.74, 1.0, length(d / EYE_RADIUS));
    float top = EYE_RADIUS.y;
    float travel = top + 9.5;                       // lid travels past the lower lash line
    float edge = top - uBlink * travel + d.x * d.x / 120.0;   // lid edge height, gently curved
    float covered = smoothstep(edge - 0.5, edge + 0.5, d.y) * inside;
    vec4 skin = texture2D(map, vec2(uv.x, c.y + 13.5 / SIZE.y));   // upper-lid skin just above the eye (same tone as a real lid)
    col.rgb = mix(col.rgb, skin.rgb, covered);
    float line = (1.0 - smoothstep(0.0, 1.9, abs(d.y - edge))) * inside * step(0.03, uBlink);
    col.rgb = mix(col.rgb, vec3(0.10, 0.045, 0.025), line * 0.95);
    return col;
  }

  // Eye movement: the iris is lifted out as a sprite and re-placed a few pixels away; the spot it
  // leaves is filled with sclera (white of the eye) taken from the outer corner of the same eye.
  vec4 look(vec4 col, vec2 uv, vec2 c, float outerSide) {
    vec2 p = (uv - c) * SIZE;
    vec2 g = uGaze * vec2(3.6, 2.0);
    float open = 1.0 - smoothstep(0.82, 1.0, length((p - vec2(0.0, 0.8)) / vec2(11.6, 7.2)));
    float oldIris = 1.0 - smoothstep(IRIS_R - 0.8, IRIS_R + 0.8, length(p));
    float newIris = 1.0 - smoothstep(IRIS_R - 0.8, IRIS_R + 0.8, length(p - g));
    vec3 sclera = texture2D(map, c + vec2(outerSide * 10.5 / SIZE.x, 0.5 / SIZE.y)).rgb;
    vec3 moved = texture2D(map, uv - g / SIZE).rgb;
    vec3 base = mix(col.rgb, sclera, oldIris * open);
    col.rgb = mix(base, moved, newIris * open);
    return col;
  }

  void main() {
    vec4 col = texture2D(map, vUv);
    if (abs(uGaze.x) + abs(uGaze.y) > 0.01) {
      col = look(col, vUv, EYE_L, -1.0);
      col = look(col, vUv, EYE_R, 1.0);
    }
    if (uBlink > 0.0) {
      col = lid(col, vUv, EYE_L);
      col = lid(col, vUv, EYE_R);
    }
    gl_FragColor = col;
    #include <colorspace_fragment>
  }
`;

interface Props {
  url: string;
  state: AvatarState;
  audio: SpeechAudioSource | null;
  reducedMotion: boolean;
  transform: AvatarTransform;
  onLoaded?: (kind: AvatarKind) => void;
}

/**
 * Mouth parts in unit space: x -1..1, y = 0 at the lip line, -1 at full opening depth.
 * The top edge sags like the smile line (corners higher than the centre) so the opening
 * sits naturally under the illustrated lips; teeth hug the top edge, a lower-lip band frames the bottom.
 */
function buildMouthGeometry() {
  const C = 0.22; // corner lift relative to the centre of the top edge

  const cavity = new THREE.Shape();
  cavity.moveTo(-1, C);
  cavity.quadraticCurveTo(0, -C, 1, C);
  cavity.bezierCurveTo(0.85, -1.05, -0.85, -1.05, -1, C);

  const teeth = new THREE.Shape();
  teeth.moveTo(-0.9, C * 0.85);
  teeth.quadraticCurveTo(0, -C * 1.05, 0.9, C * 0.85);
  teeth.lineTo(0.88, C * 0.85 - 0.17);
  teeth.quadraticCurveTo(0, -C * 1.05 - 0.17, -0.88, C * 0.85 - 0.17);
  teeth.closePath();

  const lip = new THREE.Shape();
  lip.moveTo(-1.08, C);
  lip.bezierCurveTo(-0.92, -1.32, 0.92, -1.32, 1.08, C);
  lip.bezierCurveTo(0.85, -1.05, -0.85, -1.05, -1.08, C);

  const tongue = new THREE.Shape();
  tongue.absellipse(0, -0.78, 0.4, 0.17, 0, Math.PI * 2, false, 0);

  return {
    cavity: new THREE.ShapeGeometry(cavity, 16),
    teeth: new THREE.ShapeGeometry(teeth, 16),
    lip: new THREE.ShapeGeometry(lip, 16),
    tongue: new THREE.ShapeGeometry(tongue, 24),
  };
}

/** `?blink=0.5` freezes the eyelid at that closure (0..1) - handy for tuning the lid art. */
const FORCED_BLINK = (() => {
  const v = new URLSearchParams(window.location.search).get("blink");
  return v === null ? null : Math.min(1, Math.max(0, Number(v) || 0));
})();

/** `?gaze=-1,0` freezes the eyes looking that way (x,y in -1..1) - for tuning. */
const FORCED_GAZE = (() => {
  const v = new URLSearchParams(window.location.search).get("gaze");
  if (!v) return null;
  const [x, y] = v.split(",").map((n) => Math.min(1, Math.max(-1, Number(n) || 0)));
  return new THREE.Vector2(x ?? 0, y ?? 0);
})();

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * The Plexi illustration in the 3D studio: breathing, sway, eyelid blinks, a speaking mouth driven by
 * the live voice level, and a small idle "lips parting" between phrases.
 */
export function ImageAvatar({ url, state, audio, reducedMotion, transform, onLoaded }: Props) {
  const texture = useTexture(url);
  const group = useRef<THREE.Group>(null);
  const mouthGroup = useRef<THREE.Group>(null);
  const mouth = useMemo(() => buildMouthGeometry(), []);
  useEffect(() => () => Object.values(mouth).forEach((g) => g.dispose()), [mouth]);
  const teeth = useRef<THREE.Mesh>(null);
  const tongue = useRef<THREE.Mesh>(null);

  const driver = useMemo(() => new MorphDriver(new THREE.Group()), []);
  const lipsync = useMemo(() => createLipSyncPlayer(audio), [audio]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: texture }, uBlink: { value: 0 }, uGaze: { value: new THREE.Vector2() } },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [texture],
  );
  useEffect(() => () => material.dispose(), [material]);

  const s = useRef({
    t: 0,
    open: 0,
    wide: 1,
    nextBlink: 1.6,
    blinkStart: -1,
    doubleBlink: false,
    nextPart: 2.5,
    partStart: -1,
    nextGaze: 1.2,
    gazeTarget: new THREE.Vector2(),
    gaze: new THREE.Vector2(),
  });

  const width = useMemo(() => {
    const img = texture.image as { width: number; height: number } | undefined;
    const aspect = img && img.height ? img.width / img.height : IMAGE_FACE.size[0] / IMAGE_FACE.size[1];
    return HEIGHT * aspect;
  }, [texture]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    onLoaded?.("image");
  }, [texture, onLoaded]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = s.current;
    k.t += dt;
    const t = k.t;
    const calm = reducedMotion ? 0 : 1;
    const speaking = state === AvatarState.SPEAKING;

    // --- voice-driven mouth ---
    lipsync.update(driver, dt, speaking);
    let openTarget = Math.min(1, driver.getLip("jawOpen") * 1.2 + driver.getLip("mouthFunnel") * 0.3);

    // idle: lips part very slightly now and then (never while talking)
    if (!speaking) {
      if (k.partStart < 0 && t >= k.nextPart) k.partStart = t;
      if (k.partStart >= 0) {
        const p = (t - k.partStart) / 0.9;
        if (p >= 1) {
          k.partStart = -1;
          k.nextPart = t + rand(3, 7);
        } else openTarget = Math.max(openTarget, Math.sin(p * Math.PI) * 0.1 * calm);
      }
    }

    const speakStretch = (driver.getLip("mouthSmileLeft") + driver.getLip("mouthSmileRight")) / 2;
    const pucker = Math.max(driver.getLip("mouthFunnel"), driver.getLip("mouthPucker"));
    const wideTarget = 1 + speakStretch * 0.25 - pucker * 0.4;
    const sm = 1 - Math.exp(-24 * dt);
    k.open += (openTarget - k.open) * sm;
    k.wide += (wideTarget - k.wide) * sm;

    const mg = mouthGroup.current;
    if (mg) {
      const rx = (IMAGE_FACE.mouthWidth * width * k.wide) / 2;
      const h = k.open * IMAGE_FACE.maxOpen * HEIGHT;
      mg.visible = k.open > 0.03;
      // all mouth parts live in a unit space (x: -1..1, y: 0 at the lip line down to -1) scaled here
      mg.scale.set(rx, Math.max(0.0001, h), 1);
      if (teeth.current) teeth.current.visible = h > 0.008;
      if (tongue.current) tongue.current.visible = h > 0.014;
    }

    // --- blink: quick close, short hold, slightly slower open ---
    if (k.blinkStart < 0 && t >= k.nextBlink) {
      k.blinkStart = t;
      k.doubleBlink = Math.random() < 0.15;
    }
    let blink = 0;
    if (k.blinkStart >= 0) {
      const el = t - k.blinkStart;
      const CLOSE = 0.07;
      const HOLD = 0.05;
      const OPEN = 0.12;
      if (el < CLOSE) blink = el / CLOSE;
      else if (el < CLOSE + HOLD) blink = 1;
      else if (el < CLOSE + HOLD + OPEN) blink = 1 - (el - CLOSE - HOLD) / OPEN;
      else {
        k.blinkStart = -1;
        k.nextBlink = k.doubleBlink ? t + 0.15 : t + rand(2.2, 5.5);
        k.doubleBlink = false;
      }
    }
    material.uniforms.uBlink!.value = FORCED_BLINK ?? blink;

    // --- eyes: look left/right (and a little up/down) in quick saccades, like real eyes ---
    if (t >= k.nextGaze) {
      const attentive = speaking || state === AvatarState.LISTENING;
      // while talking/listening mostly hold the viewer's eyes, with the odd glance away
      const glance = attentive && Math.random() < 0.6 ? 0.15 : 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      k.gazeTarget.set(side * rand(0.4, 1) * glance * calm, rand(-0.5, 0.5) * glance * calm);
      k.nextGaze = t + rand(attentive ? 1.2 : 1.6, attentive ? 3 : 4.2);
      // sometimes return to centre quickly after a glance
      if (Math.random() < 0.3) k.gazeTarget.multiplyScalar(0.3);
    }
    k.gaze.lerp(k.gazeTarget, 1 - Math.exp(-16 * dt));
    material.uniforms.uGaze!.value.copy(FORCED_GAZE ?? k.gaze);

    // --- body: breathing, sway, state-based lean ---
    if (group.current) {
      let lean = Math.sin(t * 0.35) * 0.012 * calm;
      let bob = 0;
      if (state === AvatarState.LISTENING) lean += 0.025 * calm;
      if (state === AvatarState.THINKING) lean -= 0.02 * calm;
      if (speaking) bob = lipsync.level * 0.012 * calm;
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, lean, 1 - Math.exp(-4 * dt));
      group.current.scale.y = 1 + Math.sin(t * 1.5) * 0.004 * calm;
      group.current.position.y = bob;
    }
    driver.apply(dt);
  });

  const m = IMAGE_FACE.mouth;
  const mouthPos: [number, number, number] = [
    (m[0] / IMAGE_FACE.size[0] - 0.5) * width,
    HEIGHT * (1 - m[1] / IMAGE_FACE.size[1]),
    0.003,
  ];

  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      <group ref={group}>
        <mesh position={[0, HEIGHT / 2, 0]} castShadow>
          <planeGeometry args={[width, HEIGHT]} />
          <primitive object={material} attach="material" />
        </mesh>

        <group ref={mouthGroup} position={mouthPos} visible={false}>
          <mesh geometry={mouth.lip} position={[0, 0, -0.0005]}>
            <meshBasicMaterial color="#d98458" toneMapped={false} />
          </mesh>
          <mesh geometry={mouth.cavity}>
            <meshBasicMaterial color="#3a0d0a" toneMapped={false} />
          </mesh>
          <mesh ref={tongue} geometry={mouth.tongue} position={[0, 0, 0.0005]}>
            <meshBasicMaterial color="#c9565a" toneMapped={false} />
          </mesh>
          <mesh ref={teeth} geometry={mouth.teeth} position={[0, 0, 0.001]}>
            <meshBasicMaterial color="#efe6dc" toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
