# Plexi - Plexus Digitals AI Virtual Avatar

A browser-based conversational AI avatar for **Plexus Digitals** (https://plexusdigitals.com/). Visitors click **Talk to Plexi**, speak or type, hear Plexi answer, and see Plexi's eyes, brows and lips move.

Two interchangeable voice providers (`VITE_VOICE_PROVIDER`): **`llm`** (current default - browser speech recognition + an OpenAI-compatible LLM such as **Kimi** or Grok behind a server-side proxy + browser text-to-speech) and **`elevenlabs`** (ElevenLabs Conversational AI agent with its own voice and knowledge base). See `docs/LLM_PROVIDER.md`.

## Tech stack

React 19 · TypeScript · Vite · Three.js · React Three Fiber · drei · Tailwind CSS v4 · Lucide · Web Speech API · `@elevenlabs/react` (optional provider)

## How it works

```
llm provider (default):
  mic ─► Web Speech API ─► POST /api/chat (server-side key) ─► Kimi / Grok ─► speechSynthesis ─► visemes ─► rig
elevenlabs provider:
  Browser ── WebRTC ──► ElevenLabs agent (voice, LLM, knowledge base) ─► character alignment ─► visemes ─► rig
```

The only server code is two tiny proxies (`/api/chat`, `/api/elevenlabs/token`) that keep API keys out of the browser - Vite middleware in dev, Cloudflare Pages Functions in production.

## Quick start

```bash
npm install
cp .env.example .env.local      # pick the provider; add LLM_API_KEY (Kimi/Grok) or the ElevenLabs agent ID
npm run dev                     # http://localhost:5173
npm run build                   # type-check + production build -> dist/
```

Voice needs a secure context: `http://localhost` or HTTPS.

`LLM_PROVIDER=mock` runs the whole loop with canned answers and no key. Without any provider configured the site still loads; *Talk to Plexi* then shows a clear "not configured" message.

Optional `ELEVENLABS_API_KEY` (server-side only, never bundled) lets the dev server / a Cloudflare Pages Function mint session credentials so the agent can be private - see `docs/PLEXI_AGENT_SETUP.md` section 4. The key needs the *Conversational AI* permission.

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

## Testing on a phone

The microphone and WebRTC only work in a *secure context* (`https://` or `localhost`). A phone opening the PC's LAN address over plain `http://` gets no mic prompt and the app says so. Use the HTTPS dev server:

```bash
npm run dev:https          # https://<your-PC-IP>:5173  (self-signed cert: accept the browser warning once)
```

Hosted builds are HTTPS already, but the host must have `VITE_ELEVENLABS_AGENT_ID` set as a build-time environment variable (and `ELEVENLABS_API_KEY` for the token function) - without it the app stops at "voice agent isn't configured" before asking for the mic.

## Troubleshooting

- **"voice agent isn't configured"** - set `VITE_ELEVENLABS_AGENT_ID` in `.env.local`, restart dev server.
- **"Plexi couldn't be reached"** - agent ID wrong, agent not public, or your domain isn't in the allowlist.
- **No mic prompt at all (usually on a phone)** - you are not on HTTPS/localhost; see *Testing on a phone*.
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
