// Cloudflare Pages Function: GET /api/elevenlabs/token?type=webrtc|websocket (logic in server/providers.mjs)
import { elevenLabsCredential } from "../../../server/providers.mjs";

export async function onRequestGet({ request, env }) {
  const type = new URL(request.url).searchParams.get("type");
  const out = await elevenLabsCredential(env, type);
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
