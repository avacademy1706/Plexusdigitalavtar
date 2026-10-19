/**
 * Plays cloud TTS audio returned by the /api/tts proxy through Web Audio, exposing a live analyser for
 * lip-sync and a VisemeScheduler fed either from exact character alignment (ElevenLabs) or from an
 * estimate that spreads the characters evenly across the clip (Gemini / OpenAI-style speech).
 */
import { VisemeScheduler } from "./visemes";

export interface TtsPayload {
  /** "pcm16" = raw little-endian 16-bit mono samples; "mp3" / "wav" / "ogg" are decoded by the browser */
  format: "pcm16" | "mp3" | "wav" | "ogg";
  sampleRate?: number;
  /** base64 audio */
  audio: string;
  /** optional exact timing (seconds) per character of `text` */
  alignment?: { characters: string[]; starts: number[]; ends: number[] };
  provider?: string;
}

const endpoint = `${import.meta.env.BASE_URL}api/tts`.replace(/^\.\//, "/");

export async function fetchTts(text: string, signal?: AbortSignal): Promise<TtsPayload | null> {
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal });
    if (!res.ok) return null; // 404/503 = not configured, 502 = provider failed -> caller falls back to browser TTS
    const body = (await res.json()) as TtsPayload;
    return typeof body.audio === "string" && body.audio.length > 0 ? body : null;
  } catch {
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class TtsPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  readonly visemes = new VisemeScheduler();
  private _speaking = false;

  get speaking(): boolean {
    return this._speaking;
  }

  /** Create/resume the AudioContext - call from a user gesture (the Talk button) so playback is allowed. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.connect(this.ctx.destination);
      this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get available(): boolean {
    return !!this.ctx;
  }

  /** RMS level 0..1 of what is playing right now. */
  getVolume(): number {
    if (!this.analyser || !this.timeData || !this._speaking) return 0;
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.timeData.length) * 2.2);
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyser || !this.freqData || !this._speaking) return new Uint8Array(0);
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  private async decode(p: TtsPayload): Promise<AudioBuffer> {
    const ctx = this.ctx!;
    const bytes = base64ToBytes(p.audio);
    if (p.format === "pcm16") {
      const rate = p.sampleRate ?? 24000;
      const n = Math.floor(bytes.length / 2);
      const buf = ctx.createBuffer(1, n, rate);
      const ch = buf.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
      for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
      return buf;
    }
    const copy = new ArrayBuffer(bytes.byteLength); // decodeAudioData needs a plain, detachable ArrayBuffer
    new Uint8Array(copy).set(bytes);
    return ctx.decodeAudioData(copy);
  }

  /** Decode and play; resolves when playback ends (or is stopped). */
  async play(text: string, p: TtsPayload): Promise<void> {
    if (!this.ctx || !this.analyser) throw new Error("audio not unlocked");
    this.stop();
    const buffer = await this.decode(p);
    const durationMs = buffer.duration * 1000;
    const now = performance.now();
    this.visemes.clear();
    if (p.alignment && p.alignment.characters.length) {
      const a = p.alignment;
      this.visemes.push(a.characters, a.starts.map((s) => s * 1000), a.ends.map((e, i) => Math.max(20, (e - (a.starts[i] ?? 0)) * 1000)), now);
    } else {
      // no timing data: spread the characters over the clip, shortening pauses at punctuation a little
      const chars = [...text];
      const weights = chars.map((c) => (/\s/.test(c) ? 0.6 : /[.,!?;:]/.test(c) ? 1.6 : 1));
      const total = weights.reduce((s, w) => s + w, 0) || 1;
      const perUnit = durationMs / total;
      let t = 0;
      const starts: number[] = [], durs: number[] = [];
      for (const w of weights) {
        starts.push(t);
        durs.push(w * perUnit);
        t += w * perUnit;
      }
      this.visemes.push(chars, starts, durs, now);
    }
    await new Promise<void>((resolve) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser!);
      this.source = src;
      this._speaking = true;
      const finish = () => {
        if (this.source === src) {
          this.source = null;
          this._speaking = false;
          this.visemes.clear();
        }
        resolve();
      };
      src.onended = finish;
      src.start();
      window.setTimeout(finish, durationMs + 1500); // watchdog
    });
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source = null;
    }
    this._speaking = false;
    this.visemes.clear();
  }
}
