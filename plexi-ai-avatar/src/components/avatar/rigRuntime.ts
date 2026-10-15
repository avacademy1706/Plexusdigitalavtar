/**
 * Minimal reader for the Spine-format skeleton JSON produced by the Plexi rig pipeline
 * (Plexi_Spine4_Talking_Assets/spine/Plexi_skeleton.json). Pure TypeScript, no three.js here.
 *
 * Supports exactly what that file uses: bones with translate/rotate/scale, region + clipping
 * attachments, slot attachment timelines, linear/stepped/bezier(approximated) curves.
 * It is NOT a Spine runtime and makes no attempt to be one.
 */
export interface SpineKey {
  time: number;
  curve?: "stepped" | number[];
  value?: number;
  x?: number;
  y?: number;
  name?: string | null;
}
export interface SpineBoneTimelines {
  rotate?: SpineKey[];
  translate?: SpineKey[];
  scale?: SpineKey[];
}
export interface SpineAnimation {
  bones?: Record<string, SpineBoneTimelines>;
  slots?: Record<string, { attachment?: SpineKey[] }>;
}
export interface SpineBone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}
export interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
}
export interface SpineRegion {
  type?: "region";
  path?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}
export interface SpineClipping {
  type: "clipping";
  end: string;
  vertexCount: number;
  vertices: number[];
}
export type SpineAttachment = SpineRegion | SpineClipping;
export interface SpineSkeleton {
  skeleton: { width: number; height: number; images: string };
  bones: SpineBone[];
  slots: SpineSlot[];
  skins: { name: string; attachments: Record<string, Record<string, SpineAttachment>> }[];
  animations: Record<string, SpineAnimation>;
}

/** Subset of artwork/manifest.json used for placement. */
export interface RigManifest {
  canvas: { width: number; height: number; scale: number; crop: { x: number; y: number; w: number; h: number } };
  source: { width: number; height: number };
}

/** Additive pose offset for one bone (scale is multiplicative). */
export interface BoneOffset {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}
export const zeroOffset = (): BoneOffset => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

export type Pose = Map<string, BoneOffset>;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function sample(keys: SpineKey[] | undefined, t: number, fields: ("value" | "x" | "y")[]): Record<string, number> | null {
  if (!keys || keys.length === 0) return null;
  const pick = (k: SpineKey) => Object.fromEntries(fields.map((f) => [f, k[f] ?? 0]));
  const first = keys[0]!;
  if (t <= first.time) return pick(first);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t <= b.time) {
      const a = keys[i - 1]!;
      if (a.curve === "stepped") return pick(a);
      let u = (t - a.time) / Math.max(1e-6, b.time - a.time);
      if (Array.isArray(a.curve)) u = smoothstep(u); // bezier approximated by a smooth ease
      const out: Record<string, number> = {};
      for (const f of fields) out[f] = (a[f] ?? 0) + ((b[f] ?? 0) - (a[f] ?? 0)) * u;
      return out;
    }
  }
  return pick(keys[keys.length - 1]!);
}

export function animationDuration(anim: SpineAnimation | undefined): number {
  if (!anim) return 0;
  let d = 0;
  for (const tls of Object.values(anim.bones ?? {})) for (const keys of Object.values(tls)) for (const k of keys ?? []) d = Math.max(d, k.time);
  for (const tls of Object.values(anim.slots ?? {})) for (const k of tls.attachment ?? []) d = Math.max(d, k.time);
  return d;
}

/** Accumulate the animation's bone offsets at time t into `pose`, scaled by `weight` (0..1). */
export function accumulate(anim: SpineAnimation | undefined, t: number, pose: Pose, weight = 1): void {
  if (!anim?.bones || weight <= 0) return;
  for (const [bone, tls] of Object.entries(anim.bones)) {
    let o = pose.get(bone);
    if (!o) {
      o = zeroOffset();
      pose.set(bone, o);
    }
    const r = sample(tls.rotate, t, ["value"]);
    if (r) o.rotation += r.value! * weight;
    const tr = sample(tls.translate, t, ["x", "y"]);
    if (tr) {
      o.x += tr.x! * weight;
      o.y += tr.y! * weight;
    }
    const s = sample(tls.scale, t, ["x", "y"]);
    if (s) {
      o.scaleX *= 1 + ((s.x || 1) - 1) * weight;
      o.scaleY *= 1 + ((s.y || 1) - 1) * weight;
    }
  }
}

/** Attachment name keyed by slot at time t (last key at or before t), for slots the animation keys. */
export function slotAttachments(anim: SpineAnimation | undefined, t: number): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (!anim?.slots) return out;
  for (const [slot, tls] of Object.entries(anim.slots)) {
    let name: string | null | undefined;
    for (const k of tls.attachment ?? []) if (k.time <= t + 1e-6) name = k.name ?? null;
    if (name !== undefined) out.set(slot, name);
  }
  return out;
}

/** viseme group -> mouth attachment, read from the one-frame `visemes/<GROUP>` animations. */
export function visemeTable(sk: SpineSkeleton, slot = "mouth"): Record<string, string> {
  const table: Record<string, string> = {};
  for (const [name, anim] of Object.entries(sk.animations)) {
    if (!name.startsWith("visemes/")) continue;
    const key = anim.slots?.[slot]?.attachment?.[0]?.name;
    if (key) table[name.slice("visemes/".length)] = key;
  }
  return table;
}
