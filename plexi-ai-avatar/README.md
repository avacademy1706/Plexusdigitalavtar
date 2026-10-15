# Plexi - Plexus Digitals AI Virtual Avatar

A browser-based conversational AI avatar for **Plexus Digitals** (https://plexusdigitals.com/). Visitors click **Talk to Plexi**, speak or type, hear Plexi answer, and see Plexi's eyes, brows and lips move.

Voice and answers come from an **ElevenLabs Conversational AI agent** whose knowledge base is the Plexus Digitals website and your PDFs.

## Tech stack

React 19 · TypeScript · Vite · Three.js · React Three Fiber · drei · Tailwind CSS v4 · Lucide · `@elevenlabs/react`

## How it works

```
Browser ── WebRTC ──► ElevenLabs agent (voice, LLM, knowledge base)
   │
   ├─ React UI: chat panel, voice button, lead form
   ├─ R3F scene: studio + Plexi illustration (or GLB)
   └─ Lip sync: agent voice level/spectrum ─► mouth shape; idle eyes/brows/lips via shader
```

No backend. The browser only needs the public **Agent ID**.

## Quick start

```bash
npm install
cp .env.example .env.local      # add VITE_ELEVENLABS_AGENT_ID
npm run dev                     # http://localhost:5173
npm run build                   # type-check + production build -> dist/
```

Voice needs a secure context: `http://localhost` or HTTPS.

Without an Agent ID the site still loads; clicking *Talk to Plexi* shows a clear "not configured" message.

## Set up the agent and knowledge base

See **[docs/PLEXI_AGENT_SETUP.md](docs/PLEXI_AGENT_SETUP.md)**: create the agent, paste the Plexi prompt, add `plexusdigitals.com` pages and PDFs as knowledge, make it public, copy the Agent ID.

## Avatar

- Default: the **layered talking rig** in `public/avatar/rig/` (eyes, lids, brows, 13 mouth shapes, hair, body) played by `src/components/avatar/RigAvatar.tsx`; blinks, gaze, expressions and viseme lip-sync come from the rig animations. It is generated from the source folder `../Plexi_Spine4_Talking_Assets` (`npm run all` there re-exports it). See `docs/AVATAR_RIG.md`.
- Fallback: `public/avatar/plexi_front_view.png` (flat PNG with shader eyes/mouth) if the rig folder is missing.
- Optional 3D model: put a rigged `public/models/plexi.glb` and it is used instead. Morph-target names are mapped in `src/components/avatar/BlendshapeMapper.ts`; clips named idle / talk / listen / think / greet are detected automatically.
- Logo: `public/logo/plexus-logo.png`.

## Previews

- `?demo=speaking` - shows the talking mouth without connecting.
- `?blink=0..1` - freezes the eyelid at that closure (1 = closed).
- `?gaze=-1,0` - freezes the eyes looking left (x,y in -1..1).
- `?quality=low|medium|high` - force a quality preset.

## Free hosting

Static build (`dist/`) on Cloudflare Pages, GitHub Pages, Netlify or Vercel free tiers. Add the hosted domain to the agent's allowlist.

## Services & limits

| Item | Cost |
| --- | --- |
| React, Vite, TypeScript, Three.js, R3F, drei, Tailwind, Lucide | Free / open source |
| ElevenLabs agent | Free plan has limited conversation minutes and features - **verify current limits in your ElevenLabs account** |
| Lead form / analytics | Local only (localStorage / console), no external service |

## Troubleshooting

- **"voice agent isn't configured"** - set `VITE_ELEVENLABS_AGENT_ID` in `.env.local`, restart dev server.
- **"Plexi couldn't be reached"** - agent ID wrong, agent not public, or your domain isn't in the allowlist.
- **Microphone denied** - allow it in browser site settings; typing still works (text-only session).
- **No sound** - click the page first (autoplay policy) and check device volume.
- **Answers are wrong / generic** - add the relevant pages or PDFs to the agent's knowledge base.

## Project layout

```
src/components/avatar   ImageAvatar (shader idle motion), Avatar (source picker), GLB + placeholder, BlendshapeMapper
src/components/scene    Experience (Canvas), Environment (studio), CameraRig
src/components/chat     ChatPanel, MessageList, MessageInput, VoiceButton
src/hooks               useVoiceAgent, useLipSync, useAvatarAnimation, useSession, useDevice
src/services            voiceAgent (support checks, errors), analytics, leads
```

## Future extension points

Auth, persistent conversations, CRM (`setLeadSink`), analytics sinks (`analytics.addSink`), WhatsApp, DGCC integration, booking, Hindi/English voice, human handoff.
