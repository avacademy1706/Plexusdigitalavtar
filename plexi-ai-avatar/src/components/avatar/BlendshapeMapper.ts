import * as THREE from "three";

/**
 * >>> THE ONE FILE TO EDIT when your GLB uses different morph-target names. <<<
 *
 * Keys   = ARKit blendshape names used by the lip-sync driver (case-insensitive).
 * Values = candidate morph-target names on YOUR model, tried in order (case-insensitive).
 *
 * Any key can be omitted or left unmatched: missing morph targets are skipped safely.
 * A name that matches nothing is simply ignored - the app never crashes on a rig mismatch.
 */
export const avatarBlendshapeMap: Record<string, string[]> = {
  jawOpen: ["jawOpen", "Jaw_Open", "mouthOpen", "viseme_aa"],
  mouthClose: ["mouthClose", "Mouth_Close"],
  mouthFunnel: ["mouthFunnel", "Mouth_Funnel", "viseme_O"],
  mouthPucker: ["mouthPucker", "Mouth_Pucker", "viseme_U"],
  mouthSmileLeft: ["mouthSmileLeft", "Mouth_Smile_L"],
  mouthSmileRight: ["mouthSmileRight", "Mouth_Smile_R"],
  mouthFrownLeft: ["mouthFrownLeft"],
  mouthFrownRight: ["mouthFrownRight"],
  mouthStretchLeft: ["mouthStretchLeft"],
  mouthStretchRight: ["mouthStretchRight"],
  mouthRollLower: ["mouthRollLower"],
  mouthRollUpper: ["mouthRollUpper"],
  mouthPressLeft: ["mouthPressLeft"],
  mouthPressRight: ["mouthPressRight"],
  mouthLowerDownLeft: ["mouthLowerDownLeft"],
  mouthLowerDownRight: ["mouthLowerDownRight"],
  mouthUpperUpLeft: ["mouthUpperUpLeft"],
  mouthUpperUpRight: ["mouthUpperUpRight"],
  mouthDimpleLeft: ["mouthDimpleLeft"],
  mouthDimpleRight: ["mouthDimpleRight"],
  mouthShrugLower: ["mouthShrugLower"],
  mouthShrugUpper: ["mouthShrugUpper"],
  jawForward: ["jawForward"],
  jawLeft: ["jawLeft"],
  jawRight: ["jawRight"],
  cheekPuff: ["cheekPuff"],
  cheekSquintLeft: ["cheekSquintLeft"],
  cheekSquintRight: ["cheekSquintRight"],
  noseSneerLeft: ["noseSneerLeft"],
  noseSneerRight: ["noseSneerRight"],
  tongueOut: ["tongueOut"],
  browDownLeft: ["browDownLeft"],
  browDownRight: ["browDownRight"],
  browInnerUp: ["browInnerUp"],
  browOuterUpLeft: ["browOuterUpLeft"],
  browOuterUpRight: ["browOuterUpRight"],
  eyeBlinkLeft: ["eyeBlinkLeft", "Eye_Blink_L"],
  eyeBlinkRight: ["eyeBlinkRight", "Eye_Blink_R"],
  eyeSquintLeft: ["eyeSquintLeft"],
  eyeSquintRight: ["eyeSquintRight"],
  eyeWideLeft: ["eyeWideLeft"],
  eyeWideRight: ["eyeWideRight"],
  eyeLookUpLeft: ["eyeLookUpLeft"],
  eyeLookUpRight: ["eyeLookUpRight"],
  eyeLookDownLeft: ["eyeLookDownLeft"],
  eyeLookDownRight: ["eyeLookDownRight"],
  eyeLookInLeft: ["eyeLookInLeft"],
  eyeLookInRight: ["eyeLookInRight"],
  eyeLookOutLeft: ["eyeLookOutLeft"],
  eyeLookOutRight: ["eyeLookOutRight"],
};

/** Smoothing speed (higher = snappier). Lip sync wants fast response, ambient motion slower. */
export const MORPH_SMOOTHING = 22;

interface Binding {
  mesh: THREE.Mesh;
  index: number;
}

const lower = (s: string) => s.toLowerCase();

/**
 * Collects morph-target bindings from a model and writes smoothed weights each frame.
 * Two input channels (`lip`, `ambient`) are merged with max() so blinks and speech don't fight.
 */
export class MorphDriver {
  private bindings = new Map<string, Binding[]>();
  private current = new Map<string, number>();
  private lip = new Map<string, number>();
  private ambient = new Map<string, number>();

  constructor(root: THREE.Object3D, map: Record<string, string[]> = avatarBlendshapeMap) {
    // Index every morph target on the model by lowercase name.
    const byName = new Map<string, Binding[]>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const dict = mesh.morphTargetDictionary;
      if (!mesh.isMesh || !dict || !mesh.morphTargetInfluences) return;
      for (const [name, index] of Object.entries(dict)) {
        const key = lower(name);
        const list = byName.get(key) ?? [];
        list.push({ mesh, index });
        byName.set(key, list);
      }
    });
    for (const [arkit, candidates] of Object.entries(map)) {
      for (const candidate of candidates) {
        const found = byName.get(lower(candidate));
        if (found?.length) {
          this.bindings.set(lower(arkit), found);
          break;
        }
      }
    }
  }

  /** True when the rig exposes at least a jaw/mouth target - otherwise use the procedural fallback. */
  get hasMouth(): boolean {
    return this.bindings.has("jawopen") || this.bindings.has("mouthfunnel") || this.bindings.has("mouthsmileleft");
  }

  has(arkitName: string): boolean {
    return this.bindings.has(lower(arkitName));
  }

  get boundCount(): number {
    return this.bindings.size;
  }

  setLip(arkitName: string, value: number): void {
    this.lip.set(lower(arkitName), value);
  }

  setAmbient(arkitName: string, value: number): void {
    this.ambient.set(lower(arkitName), value);
  }

  getLip(arkitName: string): number {
    return this.lip.get(lower(arkitName)) ?? 0;
  }

  clearLip(): void {
    this.lip.clear();
  }

  /** Smooth toward targets and write to meshes. Safe when nothing is bound. */
  apply(dt: number): void {
    if (this.bindings.size === 0) return;
    const k = 1 - Math.exp(-MORPH_SMOOTHING * dt);
    for (const [name, list] of this.bindings) {
      const target = Math.min(1, Math.max(0, Math.max(this.lip.get(name) ?? 0, this.ambient.get(name) ?? 0)));
      const prev = this.current.get(name) ?? 0;
      let next = prev + (target - prev) * k;
      if (next < 0.001 && target === 0) next = 0;
      this.current.set(name, next);
      for (const { mesh, index } of list) {
        const inf = mesh.morphTargetInfluences;
        if (inf) inf[index] = next;
      }
    }
  }

  reset(): void {
    this.lip.clear();
    this.ambient.clear();
    this.current.clear();
    for (const list of this.bindings.values()) {
      for (const { mesh, index } of list) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = 0;
      }
    }
  }
}
