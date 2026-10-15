/**
 * Cloudflare Pages Function (free tier): GET /api/elevenlabs/token?type=webrtc|websocket
 * Mints a short-lived ElevenLabs session credential with the server-side ELEVENLABS_API_KEY so the
 * key never reaches the browser and the agent can be private.
 *
 * Deploy: Cloudflare Pages -> Settings -> Environment variables:
 *   ELEVENLABS_API_KEY        (secret)
 *   VITE_ELEVENLABS_AGENT_ID  (same value as the build-time env)
 * Netlify/Vercel users: port this handler to their function format; the logic is identical.
 */
export async function onRequestGet({ request, env }) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.VITE_ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return new Response(JSON.stringify({ error: "token endpoint not configured" }), { status: 404, headers });

  const type = new URL(request.url).searchParams.get("type") === "websocket" ? "websocket" : "webrtc";
  const endpoint =
    type === "websocket"
      ? `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`
      : `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  try {
    const r = await fetch(endpoint, { headers: { "xi-api-key": apiKey } });
    const body = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ error: "ElevenLabs rejected the credential request", status: r.status }), { status: 502, headers });
    return new Response(JSON.stringify(type === "websocket" ? { signedUrl: body.signed_url } : { conversationToken: body.token }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "credential request failed" }), { status: 502, headers });
  }
}
