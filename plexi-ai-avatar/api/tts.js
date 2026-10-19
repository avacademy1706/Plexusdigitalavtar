// Vercel serverless function: POST /api/tts
import { tts } from "../server/providers.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const out = await tts(process.env, body.text);
  res.status(out.status).json(out.body);
}
