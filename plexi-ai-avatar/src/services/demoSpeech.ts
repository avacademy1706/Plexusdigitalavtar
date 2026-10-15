import type { SpeechAudioSource } from "../types/avatar";
import { VisemeScheduler } from "./visemes";

const SENTENCE = "Hi, I'm Plexi, your AI guide to Plexus Digitals. How can I help you today?";
const MS_PER_CHAR = 68;

/**
 * Fake speech source for `?demo=speaking`: replays a sentence on the same text-timed viseme path
 * the real ElevenLabs alignment data uses, so lip sync can be previewed without a connection.
 */
export function createDemoSpeech(): SpeechAudioSource {
  const scheduler = new VisemeScheduler();
  const chars = [...SENTENCE];
  const starts = chars.map((_, i) => i * MS_PER_CHAR);
  const durs = chars.map(() => MS_PER_CHAR);
  const loopMs = chars.length * MS_PER_CHAR + 1200;
  let nextLoop = 0;
  const tick = () => {
    const now = performance.now();
    if (now >= nextLoop) {
      scheduler.push(chars, starts, durs, now);
      nextLoop = now + loopMs;
    }
  };

  return {
    getVolume: () => 0.4,
    getFrequencyData: () => new Uint8Array(0),
    getMouth: () => {
      tick();
      return scheduler.sample();
    },
    getViseme: () => {
      tick();
      return scheduler.sampleViseme();
    },
  };
}
