export type MessageRole = "user" | "plexi";

export interface ChatLine {
  id: string;
  role: MessageRole;
  text: string;
  streaming: boolean;
}

export type ConnectionPhase = "idle" | "requesting-mic" | "connecting" | "connected" | "error" | "ended";

export type MicState = "unknown" | "granted" | "denied" | "unsupported";

export type PlexiErrorCode =
  | "config-missing"
  | "unsupported-browser"
  | "connect-failed"
  | "invalid-agent"
  | "network"
  | "audio"
  | "disconnected";

export interface PlexiError {
  code: PlexiErrorCode;
  message: string;
}
