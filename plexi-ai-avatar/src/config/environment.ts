/**
 * Central place for runtime configuration.
 *
 * The browser only needs the public ElevenLabs *Agent ID* - there is no API key in the frontend.
 * (The agent must be set to "public" / authentication off in the ElevenLabs dashboard.)
 */
const read = (key: string) => ((import.meta.env[key] as string | undefined) ?? "").trim();

export const env = {
  /** "llm" (default: browser STT/TTS + Kimi/Grok via /api/chat) or "elevenlabs". */
  voiceProvider: (read("VITE_VOICE_PROVIDER") || "llm") as "llm" | "elevenlabs",
  elevenLabsAgentId: read("VITE_ELEVENLABS_AGENT_ID"),
  /** Speech-recognition language for the llm provider (BCP-47), e.g. en-IN, hi-IN. */
  sttLang: read("VITE_STT_LANG") || "en-IN",
  /** Optional exact speechSynthesis voice name to force for Plexi (see your browser's voice list). */
  ttsVoice: read("VITE_TTS_VOICE"),
  isDev: import.meta.env.DEV,
} as const;

export const isAgentConfigured = (): boolean => env.elevenLabsAgentId.length > 0;

export const APP_CONFIG = {
  companyName: "Plexus Digitals",
  companyUrl: "https://plexusdigitals.com/",
  avatarName: "Plexi",
  /** Drop a rigged avatar here (optional). Replace the file, no code change needed. */
  modelUrl: `${import.meta.env.BASE_URL}models/plexi.glb`,
  /** Layered talking rig exported from Plexi_Spine4_Talking_Assets (`npm run export` there). */
  rigUrl: `${import.meta.env.BASE_URL}avatar/rig/`,
  /** Used when neither a GLB nor the rig exists: the flat Plexi illustration (transparent PNG). */
  imageUrl: `${import.meta.env.BASE_URL}avatar/plexi_front_view.png`,
} as const;
