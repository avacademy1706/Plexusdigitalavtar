/**
 * Cloudflare Pages Function (free tier): POST /api/chat { messages } -> { reply, model }
 * Forwards to any OpenAI-compatible chat-completions API using server-side env:
 *   LLM_BASE_URL  e.g. https://api.moonshot.ai/v1 (Kimi) or https://api.x.ai/v1 (Grok)
 *   LLM_API_KEY   provider key (secret - never shipped to the browser)
 *   LLM_MODEL     model id
 *   LLM_PROVIDER  optional "mock" for a canned local answer (no API call)
 */
export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  let messages = [];
  try {
    messages = (await request.json()).messages ?? [];
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers });
  }
  if (env.LLM_PROVIDER === "mock") {
    return new Response(JSON.stringify({ reply: "Plexus Digitals helps brands grow with AI, digital marketing, web and app development, and immersive experiences. What kind of business are you running?", model: "mock" }), { headers });
  }
  const baseUrl = (env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl || !env.LLM_API_KEY || !env.LLM_MODEL) {
    return new Response(JSON.stringify({ error: "LLM not configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL" }), { status: 503, headers });
  }
  try {
    // Thinking models (Gemini 3.x) spend tokens on reasoning first; keep the budget high and reasoning low.
    const gemini = /generativelanguage\.googleapis\.com/.test(baseUrl);
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL, messages, temperature: 0.6, max_tokens: 400, ...(gemini ? { reasoning_effort: "low" } : {}) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = typeof body.error === "string" ? body.error : body.error?.message;
      return new Response(JSON.stringify({ error: `LLM provider answered ${r.status}${detail ? `: ${detail}` : ""}` }), { status: 502, headers });
    }
    return new Response(JSON.stringify({ reply: body.choices?.[0]?.message?.content ?? "", model: env.LLM_MODEL }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "LLM request failed" }), { status: 502, headers });
  }
}
