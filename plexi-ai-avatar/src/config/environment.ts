/**
 * Central place for runtime configuration.
 *
 * The browser only needs the public ElevenLabs *Agent ID* - there is no API key in the frontend.
 * (The agent must be set to "public" / authentication off in the ElevenLabs dashboard.)
 */
export const env = {
  elevenLabsAgentId: (import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined)?.trim() ?? "",
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
