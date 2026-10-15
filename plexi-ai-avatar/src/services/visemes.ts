/**
 * Text-driven mouth shapes.
 * ElevenLabs sends character-level timing alongside the speech audio (`onAudioAlignment`).
 * Each character becomes (a) a viseme group for the layered rig and (b) an approximate mouth
 * target for the flat-image fallback, both played back on the speech clock.
 */
export interface MouthTarget {
  /** Jaw opening 0..1 */
  open: number;
  /** Lip rounding / protrusion 0..1 (o, u, w) */
  round: number;
  /** Lip stretch / smile 0..1 (e, i, s) */
  wide: number;
}

/** Viseme groups of the Plexi rig (see Plexi_Spine4_Talking_Assets/docs/LIP_SYNC_GUIDE.md). */
export type VisemeGroup = "REST" | "MBP" | "FV" | "AI" | "E" | "O" | "U" | "L" | "TH" | "CH_SH" | "SMILE" | "OPEN";

const CLOSED: MouthTarget = { open: 0.03, round: 0, wide: 0 };
const m = (open: number, round: number, wide: number): MouthTarget => ({ open, round, wide });

const GROUP_TARGET: Record<VisemeGroup, MouthTarget> = {
  REST: CLOSED,
  MBP: m(0.02, 0, 0),
  FV: m(0.14, 0, 0.35),
  AI: m(0.95, 0.05, 0.15),
  E: m(0.5, 0, 0.7),
  O: m(0.7, 0.85, 0),
  U: m(0.4, 1, 0),
  L: m(0.38, 0, 0.3),
  TH: m(0.2, 0, 0.3),
  CH_SH: m(0.18, 0.2, 0.55),
  SMILE: m(0.08, 0, 0.6),
  OPEN: m(1, 0.1, 0.1),
};

const LETTERS: Record<string, VisemeGroup> = {
  a: "AI", e: "E", i: "E", y: "E", o: "O", u: "U", w: "U",
  m: "MBP", b: "MBP", p: "MBP", f: "FV", v: "FV", l: "L", h: "AI", r: "AI",
  s: "CH_SH", z: "CH_SH", c: "CH_SH", x: "CH_SH", j: "CH_SH", t: "CH_SH", d: "CH_SH", n: "CH_SH", k: "CH_SH", g: "CH_SH", q: "CH_SH",
};

/** Viseme group for one character; `next` lets "th" be detected. */
export function charToViseme(ch: string, next?: string, index = 0): VisemeGroup {
  const c = ch.toLowerCase();
  if (c === "t" && next?.toLowerCase() === "h") return "TH";
  const known = LETTERS[c];
  if (known) return known;
  if (/\s|[.,!?;:\-–—"'()]/.test(c)) return "REST";
  // other scripts (e.g. Devanagari) and digits: alternate open shapes so the mouth keeps moving
  return index % 2 ? "E" : "AI";
}

export const charToMouth = (ch: string): MouthTarget => GROUP_TARGET[charToViseme(ch)];

interface Event {
  t0: number;
  t1: number;
  viseme: VisemeGroup;
  shape: MouthTarget;
}

const MIN_CHAR_MS = 45;
const KEEP_PAST_MS = 150;

export class VisemeScheduler {
  private events: Event[] = [];
  /** Time (performance.now ms) at which everything queued so far finishes. */
  private cursor = 0;

  /** Queue one alignment chunk. Times are relative to the chunk; they are re-based so chunks play back-to-back. */
  push(chars: string[], startsMs: number[], durationsMs: number[], now = performance.now()): void {
    if (!chars.length) return;
    const first = startsMs[0] ?? 0;
    const base = Math.max(now, this.cursor);
    let end = base;
    let prevViseme: VisemeGroup | null = null;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === undefined) continue;
      const start = (startsMs[i] ?? first) - first;
      const dur = Math.max(MIN_CHAR_MS, durationsMs[i] ?? MIN_CHAR_MS);
      const t0 = base + start;
      const t1 = t0 + dur;
      let viseme = charToViseme(ch, chars[i + 1], i);
      if (prevViseme === "TH" && ch.toLowerCase() === "h") viseme = "TH";
      this.events.push({ t0, t1, viseme, shape: GROUP_TARGET[viseme] });
      prevViseme = viseme;
      if (t1 > end) end = t1;
    }
    this.cursor = end;
  }

  clear(): void {
    this.events = [];
    this.cursor = 0;
  }

  private current(now: number): { cur: Event; next?: Event; frac: number } | null {
    if (this.events.length === 0) return null;
    while (this.events.length > 0 && (this.events[0]?.t1 ?? 0) < now - KEEP_PAST_MS) this.events.shift();
    if (this.events.length === 0) {
      this.cursor = 0;
      return null;
    }
    const cur = this.events[0]!;
    return { cur, next: this.events[1], frac: (now - cur.t0) / Math.max(1, cur.t1 - cur.t0) };
  }

  /** Viseme group at `now`, or null if nothing is queued. */
  sampleViseme(now = performance.now()): VisemeGroup | null {
    const c = this.current(now);
    if (!c) return null;
    return now < c.cur.t0 ? "REST" : c.cur.viseme;
  }

  /** Mouth shape at `now` (for the flat-image fallback), or null if nothing is queued. */
  sample(now = performance.now()): MouthTarget | null {
    const c = this.current(now);
    if (!c) return null;
    const { cur, next, frac } = c;
    if (now < cur.t0) return CLOSED;
    if (next && frac > 0.55) {
      // co-articulation: ease toward the next shape over the last part of this character
      const w = Math.min(1, (frac - 0.55) / 0.45) * 0.6;
      return {
        open: cur.shape.open + (next.shape.open - cur.shape.open) * w,
        round: cur.shape.round + (next.shape.round - cur.shape.round) * w,
        wide: cur.shape.wide + (next.shape.wide - cur.shape.wide) * w,
      };
    }
    return cur.shape;
  }
}
