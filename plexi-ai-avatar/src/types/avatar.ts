export const AvatarState = {
  IDLE: "IDLE",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  SPEAKING: "SPEAKING",
  ERROR: "ERROR",
  CONNECTING: "CONNECTING",
} as const;
export type AvatarState = (typeof AvatarState)[keyof typeof AvatarState];

/** Which avatar source ended up on screen. */
export type AvatarKind = "glb" | "rig" | "image" | "placeholder";

export type AnimationSlot = "idle" | "talking" | "listening" | "thinking" | "greeting";

export interface AvatarTransform {
  position: [number, number, number];
  /** Euler radians */
  rotation: [number, number, number];
  /** Multiplier applied on top of auto-fit (model is auto-normalised to ~1.75m tall). */
  scale: number;
}

export type QualityPreset = "HIGH" | "MEDIUM" | "LOW";

export interface QualitySettings {
  dpr: [number, number];
  shadows: boolean;
  reflections: boolean;
  antialias: boolean;
}

/** Live level of the agent's voice output, used to drive mouth movement. Values are 0..1 / 0..255. */
export interface SpeechAudioSource {
  getVolume(): number;
  getFrequencyData(): Uint8Array;
  /** Text-driven mouth shape for the current instant, or null when no timing data is available. */
  getMouth?(): { open: number; round: number; wide: number } | null;
  /** Viseme group (REST, MBP, FV, AI, E, O, U, L, TH, CH_SH, SMILE, OPEN) for the current instant, or null. */
  getViseme?(): string | null;
}
