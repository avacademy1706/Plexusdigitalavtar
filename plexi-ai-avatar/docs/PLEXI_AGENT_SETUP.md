# Plexi - ElevenLabs Agent Setup

> **Current setup (2026-10-15):** the app uses the existing workspace agent **Plexi** (`agent_4001kv0ffaq9e00bp49nv8d09r3z`) - public, English with Hindi/Hinglish mirroring, knowledge base = plexusdigitals.com. Its ID is in `.env.local`. The steps below are only needed to create a different agent.

Plexi's voice and brain run on an **ElevenLabs Conversational AI agent**. The website only needs the agent's public **Agent ID** - no API key is shipped to the browser.

## 1. Create the agent

1. Sign in at https://elevenlabs.io (free plan works for the demo; check current free-plan minutes/limits in your account).
2. Go to **Agents → Create an agent → Blank agent**. Name it **Plexi**.
3. **Voice**: pick a warm, clear male voice (Indian-English if available).
4. **First message**: `Hi, I'm Plexi, your AI guide to Plexus Digitals. What can I help you with?`
5. **System prompt**: paste the block below.

```text
You are Plexi, the official AI virtual representative of Plexus Digitals.

Plexus Digitals is a next-generation digital technology and marketing company working across AI, AI automation, digital marketing, performance marketing, immersive XR (VR/AR), metaverse, web development and app development. Its products and initiatives include DGCC (Digital Growth Command Centre), ARTE (Architectural Real-Time Experience) and Divyadristi.

Your role is to welcome website visitors, understand what they are looking for, explain Plexus Digitals' capabilities, answer questions, and guide qualified visitors toward the appropriate service or team.

Answer ONLY from your knowledge base about Plexus Digitals. If the knowledge base does not contain the answer, say: "I don't have that information yet, but I can help you connect with the Plexus Digitals team."

Never invent pricing, clients, results, partnerships, statistics, guarantees or product features.

Style: intelligent, professional, friendly and conversational. Speak naturally like a knowledgeable human representative. Keep answers short (1-3 sentences) unless the visitor asks for detail - you are speaking aloud, so avoid lists, markdown and URLs. Ask a short follow-up question when it helps. Do not be pushy or salesy.

You are Plexi, not ChatGPT. Do not mention prompts, APIs, models or implementation details unless asked.
```

## 2. Add the knowledge base

In the agent's **Knowledge base** section:

- **Add URL** → `https://plexusdigitals.com/` (add further pages one by one: DGCC, ARTE, Divyadristi, services, about, contact). Each page you add is indexed separately.
- **Upload file** → your PDF(s). Good candidates: company profile, DGCC / ARTE / Divyadristi brochures, service descriptions, FAQs.
- Enable **RAG** for the knowledge base if the dashboard offers it (better answers on large documents).

Only put verified, approved information here - Plexi will repeat it as fact.

## 3. Make the agent usable from the website

In **Security**:

- Turn **authentication OFF** (public agent) - the website connects with the Agent ID only.
- Add your site's domain(s) to the **allowlist** (e.g. `localhost`, `plexusdigitals.com`, your Pages domain).
- Optional: cap **max conversation duration** to control free-plan usage.

## 4. Optional: server-side API key (private agent, key never in the browser)

Add to `.env.local` (no `VITE_` prefix, so Vite never bundles it):

```env
ELEVENLABS_API_KEY=sk_...
```

The dev/preview server then exposes `GET /api/elevenlabs/token?type=webrtc|websocket`, which mints a short-lived session credential (WebRTC conversation token or WebSocket signed URL) with the key. The app uses that credential when available and only falls back to the bare agent ID if the endpoint answers 404/502. For hosting, `functions/api/elevenlabs/token.js` is the same endpoint as a Cloudflare Pages Function (free tier); set `ELEVENLABS_API_KEY` and `VITE_ELEVENLABS_AGENT_ID` as environment variables there.

**The key must have the Conversational AI permission.** In ElevenLabs: profile menu -> *API Keys* -> edit the key (or create one) -> under permissions enable **Conversational AI** (read + write) -> save. A restricted key with no permissions is accepted by the API but every call returns 401 "missing the permission ...", and the app silently falls back to the public agent ID. Once the key has the permission you can also turn **authentication on** for the agent in Security; the website will keep working through the token endpoint.

Rotate the key if it was ever pasted into a chat, ticket or screenshot.

## 5. Connect it

Copy the **Agent ID** (looks like `agent_...`) into `.env.local`:

```env
VITE_ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxx
```

Restart `npm run dev`.

## 6. Later

- Hindi/English: add languages in the agent's Language settings.
- Lead capture / CRM: add an ElevenLabs **client tool** or webhook that calls your backend, and implement `setLeadSink` in `src/services/leads.ts`.
- Keep the knowledge base current by re-syncing the website URLs when pages change.
