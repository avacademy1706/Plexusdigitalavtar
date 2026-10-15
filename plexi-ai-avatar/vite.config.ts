import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix also reads non-VITE_ keys (server-side secrets) from .env.local
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), elevenLabsTokenPlugin(env)],
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
