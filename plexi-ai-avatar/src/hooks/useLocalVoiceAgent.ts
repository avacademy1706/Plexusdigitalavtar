import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarState, type SpeechAudioSource } from "../types/avatar";
import type { ChatLine, ConnectionPhase, MicState, PlexiError } from "../types/conversation";
import { env } from "../config/environment";
import { analytics } from "../services/analytics";
import { requestMicrophone } from "../services/voiceAgent";
import { chatCompletion, trimHistory, type ChatTurn } from "../services/llmChat";
import { VisemeScheduler } from "../services/visemes";
import { TtsPlayer, fetchTts } from "../services/ttsPlayer";
import { PLEXI_GREETING, PLEXI_SYSTEM_PROMPT } from "../content/plexiPersona";
import type { VoiceAgent } from "./useVoiceAgent";

/**
 * Self-hosted voice loop built only from free browser APIs plus an OpenAI-compatible LLM behind /api/chat:
 *   microphone -> Web Speech API (SpeechRecognition) -> LLM via /api/chat -> cloud TTS via /api/tts (Gemini,
 *   ElevenLabs, OpenAI-style) played through Web Audio, or browser speechSynthesis when no cloud TTS is set -> visemes.
 * Same `VoiceAgent` interface as the ElevenLabs hook, so the UI and the avatar do not care which one runs.
 *
 * Limits: SpeechRecognition exists in Chrome, Edge and Safari (not Firefox) and streams audio to the
 * browser vendor; speechSynthesis voices depend on the OS. Lip-sync timing comes from the utterance's
 * word-boundary events (no per-character timing like ElevenLabs), so it is a little coarser.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

/** Pick a voice: Hindi voice for Devanagari replies, else an Indian-English male voice, else any English voice. */
function pickVoice(text: string, preferred: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferred) {
    const v = voices.find((x) => x.name === preferred);
    if (v) return v;
  }
  const by = (pred: (v: SpeechSynthesisVoice) => boolean) => voices.find(pred) ?? null;
  if (hasDevanagari(text)) return by((v) => v.lang.toLowerCase().startsWith("hi")) ?? by((v) => v.lang.toLowerCase() === "en-in");
  return (
    by((v) => v.lang.toLowerCase() === "en-in" && /ravi|prabhat|male|neerja/i.test(v.name) && !/neerja/i.test(v.name)) ??
    by((v) => v.lang.toLowerCase() === "en-in") ??
    by((v) => v.lang.toLowerCase().startsWith("en") && /male|david|guy|ryan|daniel/i.test(v.name)) ??
    by((v) => v.lang.toLowerCase().startsWith("en"))
  );
}

/** Rough per-character speech timing used to schedule visemes between word-boundary events. */
const MS_PER_CHAR = 70;

export function useLocalVoiceAgent(): VoiceAgent {
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [error, setError] = useState<PlexiError | null>(null);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [micMuted, setMicMuted] = useState(true);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [activity, setActivity] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");

  const phaseRef = useRef<ConnectionPhase>("idle");
  phaseRef.current = phase;
  const micMutedRef = useRef(true);
  micMutedRef.current = micMuted;
  const history = useRef<ChatTurn[]>([{ role: "system", content: PLEXI_SYSTEM_PROMPT }]);
  const recognition = useRef<Recognition | null>(null);
  const visemes = useRef(new VisemeScheduler());
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const speakingRef = useRef(false);
  const player = useRef(new TtsPlayer());

  const addLine = useCallback((role: ChatLine["role"], text: string) => {
    const t = text.trim();
    if (!t) return;
    seq.current += 1;
    setLines((prev) => [...prev, { id: `l${seq.current}`, role, text: t, streaming: false }]);
  }, []);

  // ---- text to speech + viseme scheduling ----------------------------------------------------
  const speakBrowser = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice(text, env.ttsVoice);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? (hasDevanagari(text) ? "hi-IN" : "en-IN");
        u.rate = 1.02;
        u.pitch = 1.0;
        const scheduler = visemes.current;
        scheduler.clear();
        let lastIndex = 0;
        const pushWord = (from: number, to: number) => {
          const chunk = text.slice(from, to);
          if (!chunk.trim()) return;
          const chars = [...chunk];
          scheduler.push(chars, chars.map((_, i) => i * MS_PER_CHAR), chars.map(() => MS_PER_CHAR), performance.now());
        };
        u.onboundary = (e) => {
          if (e.name !== "word") return;
          const start = e.charIndex;
          const len = (e as SpeechSynthesisEvent & { charLength?: number }).charLength ?? text.slice(start).search(/\s|$/);
          pushWord(start, start + Math.max(1, len) + 1);
          lastIndex = start + len;
        };
        u.onstart = () => {
          speakingRef.current = true;
          setActivity("speaking");
          // browsers without boundary events: schedule the whole text once
          window.setTimeout(() => {
            if (lastIndex === 0 && speakingRef.current) pushWord(0, text.length);
          }, 250);
        };
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(watchdog);
          speakingRef.current = false;
          scheduler.clear();
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        // Some environments (headless, missing voices, muted tabs) never fire onend: give up after the
        // expected speaking time plus a margin so the conversation always continues.
        const watchdog = window.setTimeout(done, Math.min(60_000, text.length * 90 + 2500));
        speechSynthesis.speak(u);
      }),
    [],
  );

  /** Cloud voice first (/api/tts: Gemini / ElevenLabs / OpenAI-style), browser voice as the fallback. */
  const speak = useCallback(
    async (text: string) => {
      const p = player.current;
      if (p.available) {
        const payload = await fetchTts(text, abort.current?.signal);
        if (payload) {
          try {
            speakingRef.current = true;
            setActivity("speaking");
            await p.play(text, payload);
            return;
          } catch (e) {
            if (env.isDev) console.warn("[tts] cloud playback failed, falling back to browser voice", e);
          } finally {
            speakingRef.current = p.speaking;
          }
        }
      }
      await speakBrowser(text);
    },
    [speakBrowser],
  );

  // ---- one conversational turn ----------------------------------------------------------------
  const ask = useCallback(
    async (userText: string) => {
      const text = userText.trim();
      if (!text || phaseRef.current !== "connected") return;
      recognition.current?.abort();
      addLine("user", text);
      analytics.track("user_message");
      history.current.push({ role: "user", content: text });
      setActivity("thinking");
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        const { reply } = await chatCompletion(trimHistory(history.current), abort.current.signal);
        if (phaseRef.current !== "connected") return;
        history.current.push({ role: "assistant", content: reply });
        addLine("plexi", reply);
        analytics.track("plexi_response");
        await speak(reply);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (env.isDev) console.warn("[llm] chat failed", e);
        setError({ code: "network", message: "Plexi couldn't answer right now. Try again or reconnect." });
        setActivity("idle");
        return;
      }
      setActivity("idle");
      if (phaseRef.current === "connected" && !micMutedRef.current) startListening();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLine, speak],
  );

  // ---- speech recognition ---------------------------------------------------------------------
  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || phaseRef.current !== "connected" || micMutedRef.current) return;
    recognition.current?.abort();
    const r = new Ctor();
    r.lang = env.sttLang;
    r.continuous = false;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setLiveTranscript(finalText || interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicState("denied");
        setMicMuted(true);
      }
    };
    r.onend = () => {
      setLiveTranscript("");
      setActivity((a) => (a === "listening" ? "idle" : a));
      if (finalText.trim()) void ask(finalText);
      else if (phaseRef.current === "connected" && !micMutedRef.current && !speakingRef.current) {
        window.setTimeout(startListening, 250); // silence: keep listening
      }
    };
    recognition.current = r;
    setActivity("listening");
    try {
      r.start();
    } catch {
      /* already started */
    }
  }, [ask]);

  // ---- session control ------------------------------------------------------------------------
  const start = useCallback(async () => {
    player.current.unlock(); // inside the click gesture so Web Audio may play
    setError(null);
    setPhase("requesting-mic");
    const mic = await requestMicrophone();
    const stt = getRecognitionCtor();
    setMicState(mic === "granted" && !stt ? "unsupported" : mic);
    if (mic === "granted") analytics.track("microphone_permission_granted");
    history.current = [{ role: "system", content: PLEXI_SYSTEM_PROMPT }];
    setLines([]);
    setPhase("connecting");
    // nothing to connect to up front - the proxy is called per turn
    setPhase("connected");
    analytics.track("conversation_started", { voice: mic === "granted" && !!stt, provider: "llm" });
    const useMic = mic === "granted" && !!stt;
    setMicMuted(!useMic);
    micMutedRef.current = !useMic;
    addLine("plexi", PLEXI_GREETING);
    history.current.push({ role: "assistant", content: PLEXI_GREETING });
    await speak(PLEXI_GREETING);
    setActivity("idle");
    if (useMic) startListening();
  }, [addLine, speak, startListening]);

  const end = useCallback(async () => {
    abort.current?.abort();
    recognition.current?.abort();
    player.current.stop();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    speakingRef.current = false;
    visemes.current.clear();
    setActivity("idle");
    setLiveTranscript("");
    setLines([]);
    setError(null);
    setPhase("ended");
    analytics.track("conversation_ended");
  }, []);

  const reconnect = useCallback(async () => {
    await end();
    await start();
  }, [end, start]);

  const toggleMic = useCallback(async () => {
    if (micState !== "granted") {
      const next = await requestMicrophone();
      setMicState(getRecognitionCtor() ? next : "unsupported");
      if (next !== "granted" || !getRecognitionCtor()) return;
    }
    const nowMuted = !micMutedRef.current;
    setMicMuted(nowMuted);
    micMutedRef.current = nowMuted;
    if (nowMuted) recognition.current?.abort();
    else if (!speakingRef.current) startListening();
  }, [micState, startListening]);

  useEffect(() => () => void end(), [end]);

  const audio = useMemo<SpeechAudioSource>(
    () => ({
      getVolume: () => (player.current.speaking ? Math.max(0.12, player.current.getVolume()) : speakingRef.current ? 0.45 : 0),
      getFrequencyData: () => (player.current.speaking ? player.current.getFrequencyData() : new Uint8Array(0)),
      getMouth: () => (player.current.speaking ? player.current.visemes.sample() : visemes.current.sample()),
      getViseme: () => (player.current.speaking ? player.current.visemes.sampleViseme() : visemes.current.sampleViseme()),
    }),
    [],
  );

  const avatarState: AvatarState = useMemo(() => {
    if (phase === "error") return AvatarState.ERROR;
    if (phase === "requesting-mic" || phase === "connecting") return AvatarState.CONNECTING;
    if (phase !== "connected") return AvatarState.IDLE;
    if (activity === "speaking") return AvatarState.SPEAKING;
    if (activity === "thinking") return AvatarState.THINKING;
    if (activity === "listening") return AvatarState.LISTENING;
    return AvatarState.IDLE;
  }, [phase, activity]);

  const statusLabel = useMemo(() => {
    switch (avatarState) {
      case AvatarState.CONNECTING:
        return "Connecting...";
      case AvatarState.SPEAKING:
        return "Plexi is speaking...";
      case AvatarState.THINKING:
        return "Thinking...";
      case AvatarState.LISTENING:
        return "I'm listening...";
      case AvatarState.ERROR:
        return "Something went wrong. Try reconnecting.";
      default:
        return phase === "connected" ? (micMuted ? "Ready - type a message" : "Ready") : "Ready to chat";
    }
  }, [avatarState, phase, micMuted]);

  return {
    phase,
    error,
    micState,
    micMuted,
    avatarState,
    statusLabel,
    lines,
    liveTranscript,
    isReady: phase === "connected",
    audio,
    start,
    end,
    reconnect,
    sendText: (text: string) => void ask(text),
    toggleMic,
  };
}
