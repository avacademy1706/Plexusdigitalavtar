import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AvatarState, type AvatarKind, type AvatarTransform, type SpeechAudioSource } from "../../types/avatar";
import { createLipSyncPlayer } from "../../hooks/useLipSync";
import { MorphDriver } from "./BlendshapeMapper";

interface Props {
  state: AvatarState;
  audio: SpeechAudioSource | null;
  reducedMotion: boolean;
  transform: AvatarTransform;
  onLoaded?: (kind: AvatarKind) => void;
}

const WHITE = "#f4f4f2";
const ORANGE = "#ff6a1a";
const CHARCOAL = "#26272b";
const SKIN = "#b98563";

/**
 * Stylised stand-in shown until /public/models/plexi.glb exists (or if it fails to load).
 * It still breathes, blinks, listens and "talks" using the same lip-sync pipeline.
 */
export function PlaceholderAvatar({ state, audio, reducedMotion, transform, onLoaded }: Props) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  const driver = useMemo(() => new MorphDriver(new THREE.Group()), []);
  const lipsync = useMemo(() => createLipSyncPlayer(audio), [audio]);
  const clock = useRef({ t: 0, nextBlink: 2, blinkStart: -1, jaw: 0 });

  useEffect(() => onLoaded?.("placeholder"), [onLoaded]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const c = clock.current;
    c.t += dt;
    const calm = reducedMotion ? 0 : 1;
    const speaking = state === AvatarState.SPEAKING;

    lipsync.update(driver, dt, speaking);
    const jawTarget = Math.min(1, driver.getLip("jawOpen") + driver.getLip("mouthFunnel") * 0.4);
    c.jaw += (jawTarget - c.jaw) * (1 - Math.exp(-20 * dt));
    if (mouth.current) {
      mouth.current.scale.set(1 - c.jaw * 0.25, 0.25 + c.jaw * 1.6, 1);
    }

    if (c.blinkStart < 0 && c.t >= c.nextBlink) c.blinkStart = c.t;
    let blink = 0;
    if (c.blinkStart >= 0) {
      const p = (c.t - c.blinkStart) / 0.16;
      if (p >= 1) {
        c.blinkStart = -1;
        c.nextBlink = c.t + 2.2 + Math.random() * 4;
      } else blink = Math.sin(p * Math.PI);
    }
    const eyeScale = 1 - blink * 0.9;
    if (eyeL.current) eyeL.current.scale.y = eyeScale;
    if (eyeR.current) eyeR.current.scale.y = eyeScale;

    if (body.current) body.current.scale.y = 1 + Math.sin(c.t * 1.5) * 0.006 * calm;
    if (head.current) {
      let roll = Math.sin(c.t * 0.29) * 0.02 * calm;
      let yaw = Math.sin(c.t * 0.37) * 0.06 * calm;
      let pitch = Math.sin(c.t * 0.53) * 0.03 * calm;
      if (state === AvatarState.LISTENING) roll += 0.07 * calm;
      if (state === AvatarState.THINKING) {
        yaw += 0.15 * calm;
        pitch -= 0.08 * calm;
      }
      if (speaking) pitch += Math.sin(c.t * 2.6) * 0.03 * calm;
      head.current.rotation.set(pitch, yaw, roll);
    }
    if (halo.current) {
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      const active = state === AvatarState.SPEAKING || state === AvatarState.LISTENING || state === AvatarState.THINKING;
      mat.opacity += ((active ? 0.55 + Math.sin(c.t * 3) * 0.15 * calm : 0.22) - mat.opacity) * (1 - Math.exp(-6 * dt));
    }
    driver.apply(dt);
  });

  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      <group ref={body}>
        {/* torso: white jacket with orange trim */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <capsuleGeometry args={[0.3, 0.55, 8, 20]} />
          <meshStandardMaterial color={WHITE} roughness={0.55} metalness={0.05} />
        </mesh>
        <mesh position={[0, 1.2, 0.27]}>
          <boxGeometry args={[0.04, 0.55, 0.04]} />
          <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.6, 8, 16]} />
          <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.09, 0.1, 0.14, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
      </group>

      <group ref={head} position={[0, 1.66, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.16, 32, 24]} />
          <meshStandardMaterial color={SKIN} roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.05, -0.015]} scale={[1.04, 1, 1.02]}>
          <sphereGeometry args={[0.165, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
          <meshStandardMaterial color="#17171a" roughness={0.8} />
        </mesh>
        <mesh ref={eyeL} position={[-0.055, 0.025, 0.14]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshBasicMaterial color="#141416" />
        </mesh>
        <mesh ref={eyeR} position={[0.055, 0.025, 0.14]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshBasicMaterial color="#141416" />
        </mesh>
        <mesh ref={mouth} position={[0, -0.065, 0.145]}>
          <boxGeometry args={[0.07, 0.02, 0.01]} />
          <meshBasicMaterial color="#3a1710" />
        </mesh>
      </group>

      {/* soft orange ring: status halo on the floor */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.55, 0.58, 64]} />
        <meshBasicMaterial color={ORANGE} transparent opacity={0.22} />
      </mesh>
    </group>
  );
}
