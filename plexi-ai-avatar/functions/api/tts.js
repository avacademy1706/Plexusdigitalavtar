/**
 * Cloudflare Pages Function (free tier): POST /api/tts { text } -> { format, audio(base64), sampleRate?, alignment? }
 * Same behaviour as the Vite dev middleware in vite.config.ts. Env:
 *   TTS_PROVIDER  gemini | elevenlabs | openai | browser (404 -> browser speechSynthesis)
 *   TTS_API_KEY   falls back to LLM_API_KEY (gemini/openai) or ELEVENLABS_API_KEY (elevenlabs)
 *   TTS_MODEL, TTS_VOICE, TTS_BASE_URL (openai-compatible /audio/speech only)
 */
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

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

export async function onRequestPost({ request, env }) {
  const provider = (env.TTS_PROVIDER ?? "").toLowerCase();
  if (!provider || provider === "browser") return json(404, { error: "cloud TTS not configured" });
  let text = "";
  try {
    text = String((await request.json()).text ?? "").trim().slice(0, 600);
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  if (!text) return json(400, { error: "text required" });
  const key = env.TTS_API_KEY || (provider === "elevenlabs" ? env.ELEVENLABS_API_KEY : env.LLM_API_KEY) || "";
  if (!key) return json(503, { error: `TTS_PROVIDER=${provider} but no TTS_API_KEY` });
  const fail = (status, detail) => json(502, { error: `TTS provider answered ${status}: ${String(detail).slice(0, 300)}` });
  try {
    if (provider === "gemini") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: env.TTS_MODEL || "gemini-3.8-flash-tts",
          input: [{ type: "user_input", content: [{ type: "text", text }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: env.TTS_VOICE || "Puck" }] },
        }),
      });
      const raw = await r.text();
      if (!r.ok) return fail(r.status, raw);
      const audio = findAudio(JSON.parse(raw));
      if (!audio) return fail(200, "no audio in response");
      const mime = (audio.mime ?? "").toLowerCase();
      const format = /l16|pcm/.test(mime) ? "pcm16" : /mp3|mpeg/.test(mime) ? "mp3" : /ogg|opus/.test(mime) ? "ogg" : "wav";
      return json(200, { provider, voice: `gemini:${env.TTS_VOICE || "Puck"}`, format, sampleRate: 24000, audio: audio.data });
    }
    if (provider === "elevenlabs") {
      const voice = env.TTS_VOICE || "SXuKWBhKoIoAHKlf6Gt3";
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key },
        body: JSON.stringify({ text, model_id: env.TTS_MODEL || "eleven_multilingual_v2" }),
      });
      const raw = await r.text();
      if (!r.ok) return fail(r.status, raw);
      const body = JSON.parse(raw);
      if (!body.audio_base64) return fail(200, "no audio in response");
      const a = body.alignment;
      return json(200, { provider, voice: `elevenlabs:${voice}`, format: "mp3", audio: body.audio_base64, ...(a ? { alignment: { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds } } : {}) });
    }
    if (provider === "openai") {
      const base = (env.TTS_BASE_URL || env.LLM_BASE_URL || "").replace(/\/+$/, "");
      if (!base) return fail(0, "TTS_BASE_URL missing");
      const r = await fetch(`${base}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: env.TTS_MODEL || "tts-1", voice: env.TTS_VOICE || "alloy", input: text, response_format: "mp3" }),
      });
      if (!r.ok) return fail(r.status, await r.text());
      return json(200, { provider, voice: `openai:${env.TTS_VOICE || "alloy"}`, format: "mp3", audio: bytesToBase64(new Uint8Array(await r.arrayBuffer())) });
    }
    return json(503, { error: `unknown TTS_PROVIDER ${provider}` });
  } catch (e) {
    return fail(0, e instanceof Error ? e.message : "request failed");
  }
}
