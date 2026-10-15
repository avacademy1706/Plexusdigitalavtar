import { isAgentConfigured } from "../config/environment";
import type { MicState, PlexiError } from "../types/conversation";

export function checkSupport(): PlexiError | null {
  if (!isAgentConfigured()) {
    return {
      code: "config-missing",
      message: "The voice agent isn't configured. Add VITE_ELEVENLABS_AGENT_ID to .env.local and restart the dev server.",
    };
  }
  if (typeof RTCPeerConnection === "undefined" || !window.isSecureContext) {
    return {
      code: "unsupported-browser",
      message: "This browser can't run live conversations. Use a current Chrome, Edge, Safari or Firefox over HTTPS.",
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
