import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Dev/preview-only endpoint: GET /api/elevenlabs/token?type=webrtc|websocket
 * Uses the server-side ELEVENLABS_API_KEY (never exposed to the browser) to mint a short-lived
 * session credential for the configured agent. The same logic for production hosting lives in
 * functions/api/elevenlabs/token.js (Cloudflare Pages). Without the key the endpoint answers 404 and
 * the app falls back to connecting with the public agent ID.
 */
function elevenLabsTokenPlugin(env: Record<string, string>): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/elevenlabs/token")) return next();
    const apiKey = env.ELEVENLABS_API_KEY;
    const agentId = env.VITE_ELEVENLABS_AGENT_ID;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (!apiKey || !agentId) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "token endpoint not configured" }));
      return;
    }
    const type = new URL(req.url, "http://localhost").searchParams.get("type") === "websocket" ? "websocket" : "webrtc";
    const endpoint =
      type === "websocket"
        ? `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`
        : `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
    try {
      const r = await fetch(endpoint, { headers: { "xi-api-key": apiKey } });
      const body = (await r.json()) as { signed_url?: string; token?: string };
      if (!r.ok) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: "ElevenLabs rejected the credential request", status: r.status }));
        return;
      }
      res.end(JSON.stringify(type === "websocket" ? { signedUrl: body.signed_url } : { conversationToken: body.token }));
    } catch {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: "credential request failed" }));
    }
  };
  return {
    name: "plexi-elevenlabs-token",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/**
 * Dev/preview-only chat proxy: POST /api/chat { messages } -> OpenAI-compatible chat completions.
 * Provider is chosen purely by env (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL): Kimi, Grok, OpenRouter, Groq ...
 * LLM_PROVIDER=mock answers locally without any API (for UI/lip-sync testing). The browser never sees the key.
 * Production equivalent: functions/api/chat.js (Cloudflare Pages).
 */
function chatProxyPlugin(env: Record<string, string>): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (c: Buffer) => (data += c.toString("utf8")));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/chat")) return next();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }
    let messages: { role: string; content: string }[] = [];
    try {
      messages = (JSON.parse(await readBody(req)) as { messages?: typeof messages }).messages ?? [];
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }
    if (env.LLM_PROVIDER === "mock") {
      const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const reply = /hindi|हिं|namaste|नमस्ते/i.test(last)
        ? "Namaste! Main Plexi hoon, Plexus Digitals ka AI guide. Aap kis tarah ka business chalate hain?"
        : "Plexus Digitals helps brands grow with AI, digital marketing, web and app development, and immersive experiences like ARTE and Divya Drishti. What kind of business are you running?";
      res.end(JSON.stringify({ reply, model: "mock" }));
      return;
    }
    const baseUrl = (env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
    const apiKey = env.LLM_API_KEY;
    const model = env.LLM_MODEL;
    if (!baseUrl || !apiKey || !model) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "LLM not configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env.local" }));
      return;
    }
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 220 }),
      });
      const body = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string };
      if (!r.ok) {
        res.statusCode = 502;
        const detail = typeof body.error === "string" ? body.error : body.error?.message;
        res.end(JSON.stringify({ error: `LLM provider answered ${r.status}${detail ? `: ${detail}` : ""}` }));
        return;
      }
      const reply = body.choices?.[0]?.message?.content ?? "";
      res.end(JSON.stringify({ reply, model }));
    } catch {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: "LLM request failed" }));
    }
  };
  return {
    name: "plexi-chat-proxy",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/**
 * Dev/preview-only TTS proxy: POST /api/tts { text } -> { format, audio(base64), sampleRate?, alignment? }
 * TTS_PROVIDER: gemini (Interactions API, free tier) | elevenlabs (with character timestamps) | openai
 * (any OpenAI-compatible /audio/speech, e.g. Groq Orpheus) | browser/unset (404 -> client uses speechSynthesis).
 * Keys stay server-side; TTS_API_KEY falls back to the matching provider key. Production: functions/api/tts.js.
 */
function ttsProxyPlugin(env: Record<string, string>): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (c: Buffer) => (data += c.toString("utf8")));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  type Audio = { data: string; mime?: string };
  const findAudio = (node: unknown): Audio | null => {
    if (!node || typeof node !== "object") return null;
    const o = node as Record<string, unknown>;
    if (typeof o.data === "string" && o.data.length > 100 && (/audio/i.test(String(o.type ?? "")) || /audio/i.test(String(o.mime_type ?? o.mimeType ?? "")))) {
      return { data: o.data, mime: String(o.mime_type ?? o.mimeType ?? "") };
    }
    for (const v of Object.values(o)) {
      const hit = Array.isArray(v) ? v.map(findAudio).find(Boolean) ?? null : findAudio(v);
      if (hit) return hit;
    }
    return null;
  };
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/tts")) return next();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const provider = (env.TTS_PROVIDER ?? "").toLowerCase();
    if (!provider || provider === "browser") {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "cloud TTS not configured (browser speechSynthesis is used)" }));
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }
    let text = "";
    try {
      text = String((JSON.parse(await readBody(req)) as { text?: string }).text ?? "").trim().slice(0, 600);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }
    if (!text) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "text required" }));
      return;
    }
    const key = env.TTS_API_KEY || (provider === "elevenlabs" ? env.ELEVENLABS_API_KEY : env.LLM_API_KEY) || "";
    if (!key) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: `TTS_PROVIDER=${provider} but no TTS_API_KEY` }));
      return;
    }
    const fail = (status: number, detail: string) => {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: `TTS provider answered ${status}: ${detail.slice(0, 300)}` }));
    };
    try {
      if (provider === "gemini") {
        const model = env.TTS_MODEL || "gemini-3.8-flash-tts";
        const voice = env.TTS_VOICE || "Puck";
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            model,
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
        res.end(JSON.stringify({ provider, format, sampleRate: 24000, audio: audio.data }));
        return;
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
        const body = JSON.parse(raw) as { audio_base64?: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
        if (!body.audio_base64) return fail(200, "no audio in response");
        const a = body.alignment;
        res.end(JSON.stringify({ provider, format: "mp3", audio: body.audio_base64, ...(a ? { alignment: { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds } } : {}) }));
        return;
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
        const bytes = Buffer.from(await r.arrayBuffer());
        res.end(JSON.stringify({ provider, format: "mp3", audio: bytes.toString("base64") }));
        return;
      }
      res.statusCode = 503;
      res.end(JSON.stringify({ error: `unknown TTS_PROVIDER ${provider}` }));
    } catch (e) {
      fail(0, e instanceof Error ? e.message : "request failed");
    }
  };
  return {
    name: "plexi-tts-proxy",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix also reads non-VITE_ keys (server-side secrets) from .env.local
  const env = loadEnv(mode, process.cwd(), "");
  // `npm run dev:https` (mode "https"): self-signed TLS + LAN host so phones can test the microphone,
  // which browsers only allow in a secure context.
  const https = mode === "https";
  return {
    plugins: [react(), tailwindcss(), elevenLabsTokenPlugin(env), chatProxyPlugin(env), ttsProxyPlugin(env), ...(https ? [basicSsl()] : [])],
    server: https ? { host: true } : undefined,
    // Relative base so the static build works on GitHub Pages / Cloudflare Pages sub-paths.
    base: "./",
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/three/") || id.includes("@react-three")) return "three";
            if (id.includes("@elevenlabs") || id.includes("livekit")) return "voice";
          },
        },
      },
    },
  };
});
