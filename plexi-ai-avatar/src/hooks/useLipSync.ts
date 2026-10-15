import { useMemo } from "react";
import type { SpeechAudioSource } from "../types/avatar";
import type { MorphDriver } from "../components/avatar/BlendshapeMapper";

export interface LipSyncPlayer {
  /** Call every frame. Writes ARKit-named lip values into the driver. */
  update(driver: MorphDriver, dt: number, speaking: boolean): void;
  /** Smoothed voice loudness 0..1, handy for expressive extras (brows, nods). */
  readonly level: number;
}

const VOLUME_GATE = 0.02;

/**
 * Audio-driven lip sync: ElevenLabs does not stream visemes, so mouth shapes are derived
 * from the live output level and spectrum (loudness -> jaw, low band -> rounding, high band -> stretch).
 * Falls back to a gentle procedural rhythm if the audio source reports silence while speaking.
 */
export function createLipSyncPlayer(source: SpeechAudioSource | null): LipSyncPlayer {
  let clock = 0;
  let jaw = 0;
  let level = 0;
  let round = 0;
  let stretch = 0;

  const player: LipSyncPlayer = {
    update(driver, dt, speaking) {
      clock += dt;
      let targetJaw = 0;
      let targetRound = 0;
      let targetStretch = 0;

      const shape = speaking ? (source?.getMouth?.() ?? null) : null;
      if (shape) {
        // Text-timed mouth shape; the live voice level gates it so pauses and silence close the mouth.
        let vol = 0;
        try {
          vol = source?.getVolume() ?? 0;
        } catch {
          vol = 0;
        }
        const gate = vol > VOLUME_GATE ? 1 : 0.35;
        targetJaw = shape.open * gate;
        targetRound = shape.round * gate;
        targetStretch = shape.wide * gate;
      } else if (speaking && !source) {
        // no audio source (demo preview): syllable-like rhythm
        const syl = Math.abs(Math.sin(clock * 7.2)) * (0.6 + 0.4 * Math.sin(clock * 2.3));
        targetJaw = 0.15 + 0.7 * syl;
        const v = 0.5 + 0.5 * Math.sin(clock * 3.7);
        targetRound = v * 0.5 * targetJaw;
        targetStretch = (1 - v) * 0.5 * targetJaw;
      } else if (speaking) {
        let vol = 0;
        try {
          vol = source?.getVolume() ?? 0;
        } catch {
          vol = 0;
        }
        if (vol > VOLUME_GATE) {
          targetJaw = Math.min(1, Math.pow(vol, 0.75) * 2.2);
          const bins = source?.getFrequencyData();
          if (bins && bins.length > 6) {
            const third = Math.floor(bins.length / 3);
            let lo = 0;
            let hi = 0;
            for (let i = 0; i < third; i++) lo += bins[i] ?? 0;
            for (let i = third * 2; i < bins.length; i++) hi += bins[i] ?? 0;
            lo /= third * 255;
            hi /= Math.max(1, bins.length - third * 2) * 255;
            targetRound = Math.min(1, lo * 1.1) * targetJaw * 0.6;
            targetStretch = Math.min(1, hi * 2.2) * targetJaw;
            // gentle vowel-like alternation so the mouth never just pulses open/shut
            const v = 0.5 + 0.5 * Math.sin(clock * 6.2);
            targetRound = Math.min(1, targetRound + v * 0.25 * targetJaw);
            targetStretch = Math.min(1, targetStretch + (1 - v) * 0.2 * targetJaw);
          }
        } else {
          // between words: tiny movement so the face never freezes mid-sentence
          targetJaw = 0.06 + 0.04 * Math.sin(clock * 6);
        }
      }

      const k = 1 - Math.exp(-(targetJaw > jaw ? 45 : 32) * dt);
      jaw += (targetJaw - jaw) * k;
      round += (targetRound - round) * k;
      stretch += (targetStretch - stretch) * k;
      level = jaw;

      driver.setLip("jawOpen", jaw);
      driver.setLip("mouthFunnel", round);
      driver.setLip("mouthPucker", round * 0.5);
      driver.setLip("mouthSmileLeft", stretch * 0.5);
      driver.setLip("mouthSmileRight", stretch * 0.5);
      driver.setLip("mouthClose", Math.max(0, 0.3 - jaw) * (speaking ? 0.5 : 0));
    },
    get level() {
      return level;
    },
  };
  return player;
}

export function useLipSync(source: SpeechAudioSource | null): LipSyncPlayer {
  return useMemo(() => createLipSyncPlayer(source), [source]);
}
