import { env } from "../config/environment";
import { useVoiceAgent, type VoiceAgent } from "./useVoiceAgent";
import { useLocalVoiceAgent } from "./useLocalVoiceAgent";

/**
 * Voice provider switch (VITE_VOICE_PROVIDER in .env.local):
 *   "llm"        - browser speech recognition + OpenAI-compatible LLM via /api/chat (Kimi, Grok ...) + browser TTS
 *   "elevenlabs" - ElevenLabs Conversational AI agent (kept intact; flip the env var to re-enable)
 * Both hooks are always mounted (hooks cannot be conditional); only the selected one is driven by the UI.
 */
export function useAgent(): VoiceAgent {
  const elevenLabs = useVoiceAgent();
  const local = useLocalVoiceAgent();
  return env.voiceProvider === "elevenlabs" ? elevenLabs : local;
}
