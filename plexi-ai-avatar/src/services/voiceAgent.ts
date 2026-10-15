import { isAgentConfigured } from "../config/environment";
import type { MicState, PlexiError } from "../types/conversation";

export function checkSupport(): PlexiError | null {
  if (!isAgentConfigured()) {
    return {
      code: "config-missing",
      message: "The voice agent isn't configured. Add VITE_ELEVENLABS_AGENT_ID to .env.local and restart the dev server.",
    };
  }
  // Microphone and WebRTC only exist in a secure context (https:// or localhost). A phone opening the
  // dev server through the PC's LAN address over plain http lands here.
  if (!window.isSecureContext) {
    return {
      code: "unsupported-browser",
      message: `Voice needs a secure connection. You opened ${window.location.origin} - use https:// (for the dev server: npm run dev:https) or open it on localhost.`,
    };
  }
  if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices) {
    return {
      code: "unsupported-browser",
      message: "This browser can't run live conversations. Use a current Chrome, Edge, Safari or Firefox.",
    };
  }
  return null;
}

/** Ask for the microphone up front so a denial can fall back to text chat. */
export async function requestMicrophone(): Promise<MicState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported";
  }
}

/** Session credential minted server-side (see vite.config.ts / functions/api/elevenlabs/token.js). */
export type SessionCredential = { kind: "webrtc"; conversationToken: string } | { kind: "websocket"; signedUrl: string };

/**
 * Ask the token endpoint for a credential. Returns null when the endpoint is absent or not configured,
 * in which case the caller connects with the public agent ID instead.
 */
export async function fetchSessionCredential(kind: "webrtc" | "websocket"): Promise<SessionCredential | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/elevenlabs/token?type=${kind}`.replace(/^\.\//, "/"), { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { conversationToken?: string; signedUrl?: string };
    if (kind === "webrtc" && body.conversationToken) return { kind, conversationToken: body.conversationToken };
    if (kind === "websocket" && body.signedUrl) return { kind, signedUrl: body.signedUrl };
    return null;
  } catch {
    return null;
  }
}

export function classifyError(e: unknown): PlexiError {
  const lower = (typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e ?? "")).toLowerCase();
  if (/(timeout|timed out|network|fetch|offline)/.test(lower) || !navigator.onLine) {
    return { code: "network", message: "Network problem. Check your connection and try reconnecting." };
  }
  if (/(agent|404|not found|invalid|unauthor|401|403|private|auth)/.test(lower)) {
    return { code: "invalid-agent", message: "Plexi couldn't be reached. Check the agent ID and that the agent is public." };
  }
  return { code: "connect-failed", message: "Something went wrong. Try reconnecting." };
}
