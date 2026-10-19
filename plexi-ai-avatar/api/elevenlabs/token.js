// Vercel serverless function: GET /api/elevenlabs/token?type=webrtc|websocket
import { elevenLabsCredential } from "../../server/providers.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const type = new URL(req.url ?? "/", "http://localhost").searchParams.get("type");
  const out = await elevenLabsCredential(process.env, type);
  res.status(out.status).json(out.body);
}
