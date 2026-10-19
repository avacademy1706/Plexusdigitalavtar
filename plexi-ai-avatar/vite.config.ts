import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chat, tts, elevenLabsCredential } from "./server/providers.mjs";

/**
 * Dev/preview-only API routes, backed by the same provider module the deployed functions use
 * (api/*.js on Vercel, functions/api/*.js on Cloudflare Pages). API keys stay server-side.
 *   POST /api/chat            { messages } -> { reply, model }
 *   POST /api/tts             { text }     -> { format, audio, ... }
 *   GET  /api/elevenlabs/token?type=webrtc|websocket
 */
function apiPlugin(env: Record<string, string>): Plugin {
  const readJson = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let data = "";
      req.on("data", (c: Buffer) => (data += c.toString("utf8")));
      req.on("end", () => {
        try {
          resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();
    try {
      if (url.pathname === "/api/chat" || url.pathname === "/api/tts") {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        const body = await readJson(req);
        const out = url.pathname === "/api/chat" ? await chat(env, body.messages as unknown[]) : await tts(env, body.text as string);
        return send(res, out.status, out.body);
      }
      if (url.pathname === "/api/elevenlabs/token") {
        const out = await elevenLabsCredential(env, url.searchParams.get("type"));
        return send(res, out.status, out.body);
      }
      return send(res, 404, { error: "unknown api route" });
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : "bad request" });
    }
  };
  return {
    name: "plexi-api",
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
    plugins: [react(), tailwindcss(), apiPlugin(env), ...(https ? [basicSsl()] : [])],
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
