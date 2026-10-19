/** Types for server/providers.mjs (shared by Vite middleware, Vercel and Cloudflare adapters). */
export type Env = Record<string, string | undefined>;
export interface ProviderResult<T = unknown> {
  status: number;
  body: T;
}
export interface ChatBody {
  reply?: string;
  model?: string;
  error?: string;
}
export interface TtsBody {
  provider?: string;
  voice?: string;
  format?: "pcm16" | "mp3" | "wav" | "ogg";
  sampleRate?: number;
  audio?: string;
  alignment?: { characters: string[]; starts: number[]; ends: number[] };
  error?: string;
}
export interface CredentialBody {
  conversationToken?: string;
  signedUrl?: string;
  error?: string;
  status?: number;
}
export function chat(env: Env, messages: unknown): Promise<ProviderResult<ChatBody>>;
export function tts(env: Env, text: unknown): Promise<ProviderResult<TtsBody>>;
export function elevenLabsCredential(env: Env, type: string | null | undefined): Promise<ProviderResult<CredentialBody>>;
