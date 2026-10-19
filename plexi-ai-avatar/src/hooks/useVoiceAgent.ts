import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation, type MessagePayload } from "@elevenlabs/react";
import { AvatarState, type SpeechAudioSource } from "../types/avatar";
import type { ChatLine, ConnectionPhase, MicState, PlexiError } from "../types/conversation";
import { env } from "../config/environment";
import { analytics } from "../services/analytics";
import { checkSupport, classifyError, fetchSessionCredential, requestMicrophone } from "../services/voiceAgent";
import { VisemeScheduler } from "../services/visemes";

const CONNECT_TIMEOUT_MS = 20_000;

export interface VoiceAgent {
  phase: ConnectionPhase;
  error: PlexiError | null;
  micState: MicState;
  micMuted: boolean;
  avatarState: AvatarState;
  /** Human readable status line, e.g. "Connecting...", "I'm listening..." */
  statusLabel: string;
  lines: ChatLine[];
  liveTranscript: string;
  isReady: boolean;
  /** Live output level of the agent's voice, for lip sync. */
  audio: SpeechAudioSource;
  start: () => Promise<void>;
  end: () => Promise<void>;
  reconnect: () => Promise<void>;
  sendText: (text: string) => void;
  toggleMic: () => Promise<void>;
}

/**
 * Voice + text conversation with Plexi via an ElevenLabs Agent.
 * Must be rendered inside <ConversationProvider>.
 */
/** ElevenLabs Conversational AI provider. Selected with VITE_VOICE_PROVIDER=elevenlabs (see useAgent.ts). */
export function useVoiceAgent(): VoiceAgent {
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [error, setError] = useState<PlexiError | null>(null);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [thinking, setThinking] = useState(false);
  const phaseRef = useRef<ConnectionPhase>("idle");
  phaseRef.current = phase;
  const userEndedRef = useRef(false);
  const lineSeq = useRef(0);
  const seen = useRef({ user: 0, plexi: 0 });
  const visemes = useRef(new VisemeScheduler());

  const addLine = useCallback((role: ChatLine["role"], text: string) => {
    const t = text.trim();
    if (!t) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.text === t) return prev; // de-dupe echoes
      lineSeq.current += 1;
      return [...prev, { id: `l${lineSeq.current}`, role, text: t, streaming: false }];
    });
  }, []);

  const conversation = useConversation({
    onMessage: (m: MessagePayload) => {
      const isUser = m.role === "user";
      addLine(isUser ? "user" : "plexi", m.message);
      setThinking(isUser);
      if (isUser) {
        seen.current.user += 1;
        analytics.track("user_message");
      } else {
        seen.current.plexi += 1;
        analytics.track("plexi_response");
      }
    },
    onError: (message: string, context?: unknown) => {
      if (env.isDev) console.warn("[voice] error", message, context);
      const e = classifyError(message);
      setError(e);
      setPhase("error");
    },
    onAudioAlignment: (a) => {
      visemes.current.push(a.chars, a.char_start_times_ms, a.char_durations_ms);
    },
    onInterruption: () => {
      visemes.current.clear();
    },
    onDisconnect: (details: unknown) => {
      if (env.isDev) console.warn("[voice] disconnect", details);
      visemes.current.clear();
      if (userEndedRef.current || phaseRef.current === "idle" || phaseRef.current === "ended") return;
      setError({ code: "disconnected", message: "Connection lost. Try reconnecting." });
      setPhase("error");
    },
  });

  // Keep the latest controls in a ref so callbacks stay stable.
  const convRef = useRef(conversation);
  convRef.current = conversation;

  // Sync phase with SDK status.
  const status = conversation.status;
  useEffect(() => {
    if (status === "connected" && phaseRef.current === "connecting") {
      setPhase("connected");
      analytics.track("conversation_started");
    }
  }, [status]);

  // Don't hang on "Connecting..." forever.
  useEffect(() => {
    if (phase !== "connecting") return;
    const t = window.setTimeout(() => {
      if (phaseRef.current === "connecting") {
        setError({ code: "network", message: "Something went wrong. Try reconnecting." });
        setPhase("error");
      }
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const audio = useMemo<SpeechAudioSource>(
    () => ({
      getVolume: () => convRef.current.getOutputVolume(),
      getFrequencyData: () => convRef.current.getOutputByteFrequencyData(),
      getMouth: () => visemes.current.sample(),
      getViseme: () => visemes.current.sampleViseme(),
    }),
    [],
  );

  const connect = useCallback(async (): Promise<void> => {
    const unsupported = checkSupport();
    if (unsupported) {
      setError(unsupported);
      setPhase("error");
      return;
    }
    userEndedRef.current = false;
    setError(null);
    setThinking(false);
    setPhase("requesting-mic");
    const mic = await requestMicrophone();
    setMicState(mic);
    if (mic === "granted") analytics.track("microphone_permission_granted");

    setPhase("connecting");
    try {
      // Voice sessions use WebRTC; text-only sessions use the WebSocket transport, which needs no media stack.
      const kind = mic === "granted" ? "webrtc" : "websocket";
      const overrides = mic === "granted" ? {} : { overrides: { conversation: { textOnly: true } } };
      // Prefer a server-minted credential (API key stays server-side, agent may be private); else the public agent ID.
      const cred = await fetchSessionCredential(kind);
      if (cred?.kind === "webrtc") convRef.current.startSession({ conversationToken: cred.conversationToken, connectionType: "webrtc", ...overrides });
      else if (cred?.kind === "websocket") convRef.current.startSession({ signedUrl: cred.signedUrl, connectionType: "websocket", ...overrides });
      else convRef.current.startSession({ agentId: env.elevenLabsAgentId, connectionType: kind, ...overrides });
      if (env.isDev) console.info(`[voice] session via ${cred ? "server credential" : "public agent id"} (${kind})`);
    } catch (e) {
      setError(classifyError(e));
      setPhase("error");
    }
  }, []);

  const end = useCallback(async () => {
    userEndedRef.current = true;
    try {
      convRef.current.endSession();
    } catch {
      /* already closed */
    }
    setError(null);
    setThinking(false);
    setLines([]);
    setPhase("ended");
    analytics.track("conversation_ended");
  }, []);

  const reconnect = useCallback(async () => {
    userEndedRef.current = true;
    try {
      convRef.current.endSession();
    } catch {
      /* ignore */
    }
    await connect();
  }, [connect]);

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || phaseRef.current !== "connected") return;
      addLine("user", t);
      setThinking(true);
      convRef.current.sendUserActivity();
      convRef.current.sendUserMessage(t);
    },
    [addLine],
  );

  const toggleMic = useCallback(async () => {
    if (micState !== "granted") {
      // A text-only session cannot gain a microphone: ask again and restart with voice if allowed.
      const next = await requestMicrophone();
      setMicState(next);
      if (next === "granted") await reconnect();
      return;
    }
    convRef.current.setMuted(!convRef.current.isMuted);
  }, [micState, reconnect]);

  const isSpeaking = conversation.isSpeaking;
  useEffect(() => {
    if (!isSpeaking) visemes.current.clear();
  }, [isSpeaking]);
  const micLive = micState === "granted" && !conversation.isMuted;

  const avatarState: AvatarState = useMemo(() => {
    if (phase === "error") return AvatarState.ERROR;
    if (phase === "requesting-mic" || phase === "connecting") return AvatarState.CONNECTING;
    if (phase !== "connected") return AvatarState.IDLE;
    if (isSpeaking) return AvatarState.SPEAKING;
    if (thinking) return AvatarState.THINKING;
    if (micLive) return AvatarState.LISTENING;
    return AvatarState.IDLE;
  }, [phase, isSpeaking, thinking, micLive]);

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
        return phase === "connected" ? "Ready - type a message" : "Ready to chat";
    }
  }, [avatarState, phase]);

  return {
    phase,
    error,
    micState,
    micMuted: !micLive,
    avatarState,
    statusLabel,
    lines,
    liveTranscript: "",
    isReady: phase === "connected",
    audio,
    start: connect,
    end,
    reconnect,
    sendText,
    toggleMic,
  };
}
