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

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix also reads non-VITE_ keys (server-side secrets) from .env.local
  const env = loadEnv(mode, process.cwd(), "");
  // `npm run dev:https` (mode "https"): self-signed TLS + LAN host so phones can test the microphone,
  // which browsers only allow in a secure context.
  const https = mode === "https";
  return {
    plugins: [react(), tailwindcss(), elevenLabsTokenPlugin(env), chatProxyPlugin(env), ...(https ? [basicSsl()] : [])],
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
