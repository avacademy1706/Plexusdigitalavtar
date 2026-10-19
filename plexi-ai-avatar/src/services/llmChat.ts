/**
 * Client for the server-side chat proxy (POST /api/chat). The proxy holds the LLM API key and talks to any
 * OpenAI-compatible chat-completions endpoint (Kimi, Grok, OpenRouter, Groq ...). Nothing provider-specific
 * lives in the browser.
 */
export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatReply {
  reply: string;
  model?: string;
}

export class ChatError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const endpoint = `${import.meta.env.BASE_URL}api/chat`.replace(/^\.\//, "/");

export async function chatCompletion(messages: ChatTurn[], signal?: AbortSignal): Promise<ChatReply> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as { reply?: string; model?: string; error?: string };
  if (!res.ok || typeof body.reply !== "string") throw new ChatError(body.error ?? `chat proxy answered ${res.status}`, res.status);
  return { reply: body.reply.trim(), model: body.model };
}

/** Keep the conversation window small: system prompt + the last N turns. */
export function trimHistory(history: ChatTurn[], maxTurns = 12): ChatTurn[] {
  const system = history.filter((t) => t.role === "system");
  const rest = history.filter((t) => t.role !== "system");
  return [...system, ...rest.slice(-maxTurns)];
}
