// Cloudflare Pages Function: POST /api/chat (logic in server/providers.mjs)
import { chat } from "../../server/providers.mjs";

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const out = await chat(env, body.messages);
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
