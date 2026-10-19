import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { AvatarState, type AvatarKind, type AvatarTransform, type SpeechAudioSource } from "../../types/avatar";
import { createLipSyncPlayer } from "../../hooks/useLipSync";
import { MorphDriver } from "./BlendshapeMapper";
import {
  accumulate,
  animationDuration,
  slotAttachments,
  visemeTable,
  zeroOffset,
  type BoneOffset,
  type Pose,
  type RigManifest,
  type SpineClipping,
  type SpineRegion,
  type SpineSkeleton,
} from "./rigRuntime";

/** Full figure height in scene metres (same as the other avatar sources). */
const HEIGHT = 1.75;
const DEG = Math.PI / 180;
const FADE = 0.35;
const MOUTH_HOLD = 0.08;

interface Props {
  skeleton: SpineSkeleton;
  manifest: RigManifest;
  /** URL prefix of the rig folder, e.g. "/avatar/rig/" */
  baseUrl: string;
  state: AvatarState;
  audio: SpeechAudioSource | null;
  reducedMotion: boolean;
  transform: AvatarTransform;
  onLoaded?: (kind: AvatarKind) => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Audio level -> viseme group, used only when the voice source has no character timing. */
function levelToViseme(level: number, t: number): string {
  if (level > 0.55) return "AI";
  if (level > 0.3) return Math.sin(t * 7) > 0 ? "E" : "O";
  if (level > 0.12) return "CH_SH";
  return "MBP";
}

/** Which animations each avatar state plays: a looping base plus an optional additive expression pose. */
function planFor(state: AvatarState): { base: string; expression: string | null } {
  switch (state) {
    case AvatarState.LISTENING:
      return { base: "listening", expression: null };
    case AvatarState.THINKING:
      return { base: "idle", expression: "thinking" };
    case AvatarState.ERROR:
      return { base: "idle", expression: "concerned" };
    default:
      return { base: "idle", expression: null };
  }
}

/**
 * Plays the layered Plexi rig (Spine-format JSON + PNG layers) inside the 3D studio.
 * Bones are three.js groups, every attachment is a textured plane, eye clipping uses the stencil buffer.
 * Animation layers (all additive, as in Spine): base loop, cross-faded previous base, expression pose,
 * blinks, gaze saccades, speech head emphasis; the mouth attachment follows live viseme cues.
 */
export function RigAvatar({ skeleton, manifest, baseUrl, state, audio, reducedMotion, transform, onLoaded }: Props) {
  const skin = skeleton.skins[0]!.attachments;
  const regions = useMemo(() => {
    const list: { slot: string; name: string; att: SpineRegion }[] = [];
    for (const s of skeleton.slots)
      for (const [name, att] of Object.entries(skin[s.name] ?? {})) if ((att.type ?? "region") === "region") list.push({ slot: s.name, name, att: att as SpineRegion });
    return list;
  }, [skeleton, skin]);
  const textures = useTexture(regions.map((r) => `${baseUrl}${skeleton.skeleton.images.replace(/^\.\//, "")}${r.att.path ?? r.name}.png`));

  useEffect(() => {
    for (const t of textures) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
    onLoaded?.("rig");
  }, [textures, onLoaded]);

  // scene placement: canvas px -> metres, Spine origin (bust bottom-centre) lifted so the feet are at y=0
  const unit = HEIGHT / (manifest.source.height * manifest.canvas.scale);
  const rootY = (manifest.source.height - manifest.canvas.crop.y - manifest.canvas.crop.h) * manifest.canvas.scale * unit;

  const rig = useMemo(() => {
    const root = new THREE.Group();
    const bones = new Map<string, THREE.Group>();
    const setup = new Map<string, BoneOffset>();
    for (const b of skeleton.bones) {
      const g = new THREE.Group();
      g.name = b.name;
      setup.set(b.name, { x: b.x ?? 0, y: b.y ?? 0, rotation: b.rotation ?? 0, scaleX: b.scaleX ?? 1, scaleY: b.scaleY ?? 1 });
      (b.parent ? bones.get(b.parent)! : root).add(g);
      bones.set(b.name, g);
    }
    const slotMeshes = new Map<string, Map<string, THREE.Mesh>>();
    const disposables: (THREE.Material | THREE.BufferGeometry)[] = [];
    let clipRef = 0;
    let activeClip: { ref: number; end: string } | null = null;
    const keep = THREE.KeepStencilOp;
    skeleton.slots.forEach((slot, order) => {
      const parent = bones.get(slot.bone)!;
      for (const [name, att] of Object.entries(skin[slot.name] ?? {})) {
        if (att.type === "clipping") {
          const clip = att as SpineClipping;
          clipRef++;
          const shape = new THREE.Shape();
          for (let i = 0; i < clip.vertices.length; i += 2) {
            if (i === 0) shape.moveTo(clip.vertices[0]!, clip.vertices[1]!);
            else shape.lineTo(clip.vertices[i]!, clip.vertices[i + 1]!);
          }
          const geo = new THREE.ShapeGeometry(shape);
          const mat = new THREE.MeshBasicMaterial({
            colorWrite: false, depthWrite: false, depthTest: false, transparent: true, opacity: 0,
            stencilWrite: true, stencilRef: clipRef, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: keep, stencilZFail: keep,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = order;
          mesh.frustumCulled = false;
          parent.add(mesh);
          disposables.push(geo, mat);
          activeClip = { ref: clipRef, end: clip.end };
          continue;
        }
        const region = att as SpineRegion;
        const idx = regions.findIndex((r) => r.slot === slot.name && r.name === name);
        const sx = region.scaleX ?? 1, sy = region.scaleY ?? 1;
        const geo = new THREE.PlaneGeometry(region.width * sx, region.height * sy);
        const mat = new THREE.MeshBasicMaterial({
          map: textures[idx], transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
          ...(activeClip ? { stencilWrite: true, stencilRef: activeClip.ref, stencilFunc: THREE.EqualStencilFunc, stencilZPass: keep, stencilFail: keep, stencilZFail: keep } : {}),
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(region.x, region.y, 0);
        mesh.rotation.z = (region.rotation ?? 0) * DEG;
        mesh.renderOrder = order;
        mesh.frustumCulled = false;
        mesh.visible = slot.attachment === name;
        parent.add(mesh);
        disposables.push(geo, mat);
        let m = slotMeshes.get(slot.name);
        if (!m) slotMeshes.set(slot.name, (m = new Map()));
        m.set(name, mesh);
      }
      if (activeClip && slot.name === activeClip.end) activeClip = null;
    });
    const defaults = new Map(skeleton.slots.map((s) => [s.name, s.attachment ?? null]));
    return { root, bones, setup, slotMeshes, defaults, disposables, visemes: visemeTable(skeleton) };
  }, [skeleton, skin, regions, textures]);

  useEffect(() => () => rig.disposables.forEach((d) => d.dispose()), [rig]);

  const driver = useMemo(() => new MorphDriver(new THREE.Group()), []);
  const lipsync = useMemo(() => createLipSyncPlayer(audio), [audio]);
  const outer = useRef<THREE.Group>(null);

  const st = useRef({
    t: 0,
    base: "idle",
    baseTime: 0,
    prevBase: null as string | null,
    prevTime: 0,
    fade: 1,
    expression: null as string | null,
    exprWeight: 0,
    exprTarget: null as string | null,
    blinkStart: -1,
    nextBlink: 1.8,
    nextGaze: 1.2,
    gazeTarget: new THREE.Vector2(),
    gaze: new THREE.Vector2(),
    mouth: null as string | null,
    mouthChangedAt: 0,
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = st.current;
    k.t += dt;
    const t = k.t;
    const calm = reducedMotion ? 0 : 1;
    const speaking = state === AvatarState.SPEAKING;
    const anims = skeleton.animations;

    // --- animation plan + cross-fades ---
    const plan = planFor(state);
    if (plan.base !== k.base) {
      k.prevBase = k.base;
      k.prevTime = k.baseTime;
      k.base = plan.base;
      k.baseTime = 0;
      k.fade = 0;
    }
    k.fade = Math.min(1, k.fade + dt / FADE);
    k.baseTime += dt;
    k.prevTime += dt;
    if (plan.expression !== k.exprTarget) k.exprTarget = plan.expression;
    if (k.exprTarget && k.exprTarget !== k.expression && k.exprWeight <= 0.01) k.expression = k.exprTarget;
    const wantWeight = k.exprTarget && k.exprTarget === k.expression ? 1 : 0;
    k.exprWeight += Math.sign(wantWeight - k.exprWeight) * Math.min(Math.abs(wantWeight - k.exprWeight), dt / 0.3);

    const pose: Pose = new Map();
    const baseAnim = anims[k.base];
    const baseDur = animationDuration(baseAnim) || 1;
    accumulate(baseAnim, k.baseTime % baseDur, pose, k.fade * calm);
    if (k.prevBase && k.fade < 1) {
      const prev = anims[k.prevBase];
      accumulate(prev, k.prevTime % (animationDuration(prev) || 1), pose, (1 - k.fade) * calm);
    }
    const exprAnim = k.expression ? anims[k.expression] : undefined;
    if (exprAnim && k.exprWeight > 0) accumulate(exprAnim, 0, pose, k.exprWeight);

    // --- blinks (skipped while the listening loop plays its own) ---
    const baseHasBlinks = k.base === "listening" && k.fade > 0.5;
    if (k.blinkStart < 0 && t >= k.nextBlink && !baseHasBlinks) k.blinkStart = t;
    if (k.blinkStart >= 0) {
      const blink = anims.blink;
      const el = t - k.blinkStart;
      if (el >= animationDuration(blink)) {
        k.blinkStart = -1;
        k.nextBlink = t + rand(2.2, 5.5);
      } else accumulate(blink, el, pose, 1);
    }

    // --- gaze saccades (additive on the eye bones, canvas px; the clip keeps the iris inside the white) ---
    if (t >= k.nextGaze) {
      const attentive = speaking || state === AvatarState.LISTENING;
      const amp = (attentive && Math.random() < 0.6 ? 0.25 : 1) * calm;
      k.gazeTarget.set((Math.random() < 0.5 ? -1 : 1) * rand(3, 11) * amp, rand(-2, 2) * amp);
      k.nextGaze = t + rand(attentive ? 1.2 : 1.6, attentive ? 3 : 4.2);
      if (Math.random() < 0.3) k.gazeTarget.multiplyScalar(0.3);
    }
    k.gaze.lerp(k.gazeTarget, 1 - Math.exp(-16 * dt));
    for (const eye of ["eye_L", "eye_R"]) {
      let o = pose.get(eye);
      if (!o) pose.set(eye, (o = zeroOffset()));
      o.x += k.gaze.x;
      o.y += k.gaze.y;
    }

    // --- speech: viseme swaps + small head emphasis ---
    lipsync.update(driver, dt, speaking);
    let mouthName: string | null = null;
    if (speaking) {
      const group = audio?.getViseme?.() ?? levelToViseme(lipsync.level, t);
      mouthName = rig.visemes[group] ?? rig.visemes.REST ?? null;
      const head = pose.get("head") ?? zeroOffset();
      head.y -= lipsync.level * 5 * calm;
      head.rotation += Math.sin(t * 1.7) * lipsync.level * 1.2 * calm;
      pose.set("head", head);
    } else {
      const fromExpr = exprAnim && k.exprWeight > 0.5 ? slotAttachments(exprAnim, 0).get("mouth") : undefined;
      const fromBase = slotAttachments(baseAnim, k.baseTime % baseDur).get("mouth");
      mouthName = fromExpr ?? fromBase ?? rig.defaults.get("mouth") ?? null;
    }
    if (mouthName !== k.mouth && t - k.mouthChangedAt >= MOUTH_HOLD) {
      k.mouth = mouthName;
      k.mouthChangedAt = t;
      const meshes = rig.slotMeshes.get("mouth");
      if (meshes) for (const [name, mesh] of meshes) mesh.visible = name === mouthName;
    }

    // --- apply pose ---
    for (const [name, g] of rig.bones) {
      const s = rig.setup.get(name)!;
      const o = pose.get(name);
      g.position.set(s.x + (o?.x ?? 0), s.y + (o?.y ?? 0), 0);
      g.rotation.z = (s.rotation + (o?.rotation ?? 0)) * DEG;
      g.scale.set(s.scaleX * (o?.scaleX ?? 1), s.scaleY * (o?.scaleY ?? 1), 1);
    }

    // --- whole-figure lean by state (kept from the image avatar so the staging feels the same) ---
    if (outer.current) {
      let lean = 0;
      if (state === AvatarState.LISTENING) lean = 0.02 * calm;
      if (state === AvatarState.THINKING) lean = -0.015 * calm;
      outer.current.rotation.z = THREE.MathUtils.lerp(outer.current.rotation.z, lean, 1 - Math.exp(-4 * dt));
    }
    driver.apply(dt);
  });

  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      <group ref={outer}>
        <primitive object={rig.root} position={[0, rootY, 0]} scale={[unit, unit, 1]} />
      </group>
    </group>
  );
}
