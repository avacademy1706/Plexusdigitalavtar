import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AvatarState, type SpeechAudioSource } from "../../types/avatar";
import { createLipSyncPlayer } from "../../hooks/useLipSync";
import { MorphDriver } from "./BlendshapeMapper";

interface BoneRig {
  bone: THREE.Object3D;
  base: THREE.Quaternion;
  drivenByClip: boolean;
}

const BONE_PATTERNS = {
  head: /^(mixamorig[:_]?)?head$/i,
  neck: /^(mixamorig[:_]?)?neck$/i,
  spine: /^(mixamorig[:_]?)?(spine2|chest|upperchest|spine1)$/i,
};

function findBone(root: THREE.Object3D, pattern: RegExp, clips: THREE.AnimationClip[]): BoneRig | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && pattern.test(o.name)) found = o;
  });
  if (!found) return null;
  const bone: THREE.Object3D = found;
  const drivenByClip = clips.some((c) => c.tracks.some((t) => t.name.startsWith(`${bone.name}.`)));
  return { bone, base: bone.quaternion.clone(), drivenByClip };
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

function offsetBone(rig: BoneRig, x: number, y: number, z: number): void {
  _e.set(x, y, z);
  _q.setFromEuler(_e);
  if (rig.drivenByClip) rig.bone.quaternion.multiply(_q);
  else rig.bone.quaternion.copy(rig.base).multiply(_q);
}

export interface AvatarMotionOptions {
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  state: AvatarState;
  audio: SpeechAudioSource | null;
  reducedMotion: boolean;
  /** Wrapper that receives a tiny breathing scale when the rig has no spine bone. */
  breathTarget: React.RefObject<THREE.Object3D | null>;
}

/**
 * Procedural life for the avatar: lip sync, blinking, eye drift, breathing, head motion.
 * Must be called AFTER useAnimations in the same component so it runs after the mixer each frame.
 */
export function useAvatarController({ root, clips, state, audio, reducedMotion, breathTarget }: AvatarMotionOptions): MorphDriver {
  const driver = useMemo(() => new MorphDriver(root), [root]);
  const lipsync = useMemo(() => createLipSyncPlayer(audio), [audio]);
  const rig = useMemo(
    () => ({
      head: findBone(root, BONE_PATTERNS.head, clips),
      neck: findBone(root, BONE_PATTERNS.neck, clips),
      spine: findBone(root, BONE_PATTERNS.spine, clips),
    }),
    [root, clips],
  );

  const s = useRef({
    t: 0,
    nextBlink: 2,
    blinkStart: -1,
    nextGaze: 1.5,
    gazeX: 0,
    gazeY: 0,
    gazeCurX: 0,
    gazeCurY: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
  });

  useEffect(() => () => driver.reset(), [driver]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = s.current;
    k.t += dt;
    const t = k.t;
    const speaking = state === AvatarState.SPEAKING;

    // --- lip sync (voice-level driven, with a procedural fallback) ---
    lipsync.update(driver, dt, speaking);

    // --- blinking ---
    if (k.blinkStart < 0 && t >= k.nextBlink) k.blinkStart = t;
    let blink = 0;
    if (k.blinkStart >= 0) {
      const p = (t - k.blinkStart) / 0.16;
      if (p >= 1) {
        k.blinkStart = -1;
        k.nextBlink = t + 2.2 + Math.random() * 4;
      } else {
        blink = Math.sin(p * Math.PI);
      }
    }
    driver.setAmbient("eyeBlinkLeft", blink);
    driver.setAmbient("eyeBlinkRight", blink);

    const calm = reducedMotion ? 0 : 1;

    // --- eye drift (saccades) ---
    if (t >= k.nextGaze) {
      k.nextGaze = t + 1.4 + Math.random() * 2.8;
      k.gazeX = (Math.random() - 0.5) * 0.5 * calm;
      k.gazeY = (Math.random() - 0.5) * 0.3 * calm;
    }
    k.gazeCurX += (k.gazeX - k.gazeCurX) * (1 - Math.exp(-8 * dt));
    k.gazeCurY += (k.gazeY - k.gazeCurY) * (1 - Math.exp(-8 * dt));
    const gx = k.gazeCurX;
    const gy = k.gazeCurY;
    driver.setAmbient("eyeLookOutLeft", Math.max(0, -gx));
    driver.setAmbient("eyeLookInRight", Math.max(0, -gx));
    driver.setAmbient("eyeLookInLeft", Math.max(0, gx));
    driver.setAmbient("eyeLookOutRight", Math.max(0, gx));
    driver.setAmbient("eyeLookUpLeft", Math.max(0, gy));
    driver.setAmbient("eyeLookUpRight", Math.max(0, gy));
    driver.setAmbient("eyeLookDownLeft", Math.max(0, -gy));
    driver.setAmbient("eyeLookDownRight", Math.max(0, -gy));

    // --- head / posture target by state ---
    let tYaw = Math.sin(t * 0.37) * 0.04 * calm;
    let tPitch = Math.sin(t * 0.53 + 1) * 0.02 * calm;
    let tRoll = Math.sin(t * 0.29 + 2) * 0.015 * calm;
    if (state === AvatarState.LISTENING) tRoll += 0.05 * calm;
    if (state === AvatarState.THINKING) {
      tYaw += 0.1 * calm;
      tPitch -= 0.06 * calm;
    }
    if (speaking) {
      tPitch += Math.sin(t * 2.6) * 0.025 * calm;
      tYaw += Math.sin(t * 1.3) * 0.03 * calm;
    }
    const hk = 1 - Math.exp(-3 * dt);
    k.headYaw += (tYaw - k.headYaw) * hk;
    k.headPitch += (tPitch - k.headPitch) * hk;
    k.headRoll += (tRoll - k.headRoll) * hk;

    if (rig.head) offsetBone(rig.head, k.headPitch, k.headYaw, k.headRoll);
    else if (rig.neck) offsetBone(rig.neck, k.headPitch, k.headYaw, k.headRoll);

    // --- breathing ---
    const breath = Math.sin(t * 1.5) * calm;
    if (rig.spine) offsetBone(rig.spine, breath * 0.012, 0, 0);
    else if (breathTarget.current) {
      const base = breathTarget.current.userData.baseScaleY as number | undefined;
      if (base) breathTarget.current.scale.y = base * (1 + breath * 0.004);
    }

    driver.apply(dt);
  });

  return driver;
}
