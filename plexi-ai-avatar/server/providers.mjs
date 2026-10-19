/**
 * Provider logic shared by every server entry point (Vite dev middleware, Vercel functions, Cloudflare Pages
 * functions). Pure functions: (env, input) -> { status, body }. Runs on Node and on Workers (only fetch/btoa).
 *
 * env keys:
 *   LLM_PROVIDER (mock | anything), LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
 *   TTS_PROVIDER (gemini | elevenlabs | openai | browser), TTS_API_KEY, TTS_MODEL, TTS_VOICE, TTS_BASE_URL
 *   ELEVENLABS_API_KEY, VITE_ELEVENLABS_AGENT_ID
 */

const MOCK_REPLY_EN = "Plexus Digitals helps brands grow with AI, digital marketing, web and app development, and immersive experiences like ARTE and Divya Drishti. What kind of business are you running?";
const MOCK_REPLY_HI = "Namaste! Main Plexi hoon, Plexus Digitals ka AI guide. Aap kis tarah ka business chalate hain?";

/** POST /api/chat { messages } -> { reply, model } */
export async function chat(env, messages) {
  if (!Array.isArray(messages)) return { status: 400, body: { error: "messages[] required" } };
  if ((env.LLM_PROVIDER ?? "").toLowerCase() === "mock") {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    return { status: 200, body: { reply: /hindi|हिं|namaste|नमस्ते/i.test(last) ? MOCK_REPLY_HI : MOCK_REPLY_EN, model: "mock" } };
  }
  const baseUrl = (env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = env.LLM_API_KEY;
  const model = env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) return { status: 503, body: { error: "LLM not configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL" } };
  // Thinking models (Gemini 3.x) spend tokens on reasoning first; keep the budget high and reasoning low.
  const gemini = /generativelanguage\.googleapis\.com/.test(baseUrl);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 400, ...(gemini ? { reasoning_effort: "low" } : {}) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = typeof body.error === "string" ? body.error : body.error?.message;
      return { status: 502, body: { error: `LLM provider answered ${r.status}${detail ? `: ${detail}` : ""}` } };
    }
    return { status: 200, body: { reply: body.choices?.[0]?.message?.content ?? "", model } };
  } catch (e) {
    return { status: 502, body: { error: `LLM request failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

function findAudio(node) {
  if (!node || typeof node !== "object") return null;
  if (typeof node.data === "string" && node.data.length > 100 && (/audio/i.test(String(node.type ?? "")) || /audio/i.test(String(node.mime_type ?? node.mimeType ?? "")))) {
    return { data: node.data, mime: String(node.mime_type ?? node.mimeType ?? "") };
  }
  for (const v of Object.values(node)) {
    const hit = Array.isArray(v) ? v.map(findAudio).find(Boolean) ?? null : findAudio(v);
    if (hit) return hit;
  }
  return null;
}

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** POST /api/tts { text } -> { provider, voice, format, audio(base64), sampleRate?, alignment? } */
export async function tts(env, textIn) {
  const provider = (env.TTS_PROVIDER ?? "").toLowerCase();
  if (!provider || provider === "browser") return { status: 404, body: { error: "cloud TTS not configured (browser speechSynthesis is used)" } };
  const text = String(textIn ?? "").trim().slice(0, 600);
  if (!text) return { status: 400, body: { error: "text required" } };
  const key = env.TTS_API_KEY || (provider === "elevenlabs" ? env.ELEVENLABS_API_KEY : env.LLM_API_KEY) || "";
  if (!key) return { status: 503, body: { error: `TTS_PROVIDER=${provider} but no TTS_API_KEY` } };
  const fail = (status, detail) => ({ status: 502, body: { error: `TTS provider answered ${status}: ${String(detail).slice(0, 300)}` } });
  try {
    if (provider === "gemini") {
      const voice = env.TTS_VOICE || "Achird";
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: env.TTS_MODEL || "gemini-3.8-flash-tts",
          input: [{ type: "user_input", content: [{ type: "text", text }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        }),
      });
      const raw = await r.text();
      if (!r.ok) return fail(r.status, raw);
      const audio = findAudio(JSON.parse(raw));
      if (!audio) return fail(200, "no audio in response");
      const mime = (audio.mime ?? "").toLowerCase();
      const format = /l16|pcm/.test(mime) ? "pcm16" : /mp3|mpeg/.test(mime) ? "mp3" : /ogg|opus/.test(mime) ? "ogg" : "wav";
      return { status: 200, body: { provider, voice: `gemini:${voice}`, format, sampleRate: 24000, audio: audio.data } };
    }
    if (provider === "elevenlabs") {
      const voice = env.TTS_VOICE || "cjVigY5qzO86Huf0OWal"; // premade "Eric": library voices need a paid plan
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key },
        body: JSON.stringify({ text, model_id: env.TTS_MODEL || "eleven_flash_v2_5" }),
      });
      const raw = await r.text();
      if (!r.ok) return fail(r.status, raw);
      const body = JSON.parse(raw);
      if (!body.audio_base64) return fail(200, "no audio in response");
      const a = body.alignment;
      return {
        status: 200,
        body: { provider, voice: `elevenlabs:${voice}`, format: "mp3", audio: body.audio_base64, ...(a ? { alignment: { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds } } : {}) },
      };
    }
    if (provider === "openai") {
      const base = (env.TTS_BASE_URL || env.LLM_BASE_URL || "").replace(/\/+$/, "");
      if (!base) return fail(0, "TTS_BASE_URL missing");
      const voice = env.TTS_VOICE || "alloy";
      const r = await fetch(`${base}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: env.TTS_MODEL || "tts-1", voice, input: text, response_format: "mp3" }),
      });
      if (!r.ok) return fail(r.status, await r.text());
      return { status: 200, body: { provider, voice: `openai:${voice}`, format: "mp3", audio: bytesToBase64(new Uint8Array(await r.arrayBuffer())) } };
    }
    return { status: 503, body: { error: `unknown TTS_PROVIDER ${provider}` } };
  } catch (e) {
    return fail(0, e instanceof Error ? e.message : "request failed");
  }
}

/** GET /api/elevenlabs/token?type=webrtc|websocket -> { conversationToken } | { signedUrl } */
export async function elevenLabsCredential(env, typeIn) {
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.VITE_ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return { status: 404, body: { error: "token endpoint not configured" } };
  const type = typeIn === "websocket" ? "websocket" : "webrtc";
  const endpoint =
    type === "websocket"
      ? `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`
      : `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  try {
    const r = await fetch(endpoint, { headers: { "xi-api-key": apiKey } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { status: 502, body: { error: "ElevenLabs rejected the credential request", status: r.status } };
    return { status: 200, body: type === "websocket" ? { signedUrl: body.signed_url } : { conversationToken: body.token } };
  } catch {
    return { status: 502, body: { error: "credential request failed" } };
  }
}
