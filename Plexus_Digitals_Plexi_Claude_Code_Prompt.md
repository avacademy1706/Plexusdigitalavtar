# Plexus Digitals - Plexi Virtual AI Avatar
## Claude Code Full-Stack Development Prompt

You are a senior full-stack engineer, 3D web developer, UI/UX engineer, and AI integration specialist.

Build a premium browser-based 3D conversational AI virtual avatar for:

**Company:** Plexus Digitals  
**Website:** https://plexusdigitals.com/  
**Avatar:** Plexi

Plexus Digitals is a next-generation digital agency working across AI, AI automation, digital marketing, metaverse, VR, AR, web/app development, and immersive digital experiences.

---

## 1. Critical Requirement: Demo Must Use Free Services

This project is for a **working demo/prototype first**.

### HARD RULE

For the demo, every external service used by the application must have a genuinely usable **free tier/free plan or require no paid service**.

Do not introduce paid-only services.

Do not require a credit card just to run the demo if a free alternative exists.

Do not recommend paid hosting, paid databases, paid analytics, paid asset libraries, paid APIs, or paid middleware for the initial demo.

### Demo service policy

Use:

- **Convai:** Free plan/free demo capabilities available to the account, within its current free-tier limits.
- **React:** Free/open source.
- **Vite:** Free/open source.
- **TypeScript:** Free/open source.
- **Three.js:** Free/open source.
- **React Three Fiber:** Free/open source.
- **@react-three/drei:** Free/open source.
- **Tailwind CSS:** Free/open source.
- **Lucide React:** Free/open source.
- **Browser Web APIs:** Free.
- **Web Audio API:** Free.
- **localStorage/sessionStorage:** Free.
- **Static hosting:** Use a free-tier provider only if needed, such as GitHub Pages, Cloudflare Pages, or another currently available free static hosting option.

Do NOT add:

- OpenAI API
- ElevenLabs
- paid TTS services
- paid speech-to-text services
- paid databases
- paid vector databases
- paid CMS
- paid analytics
- paid authentication
- paid image-generation APIs
- paid 3D asset services

unless I explicitly request them later.

The initial demo should rely primarily on **Convai + browser APIs + open-source frontend libraries**.

If any dependency or external service becomes paid-only, stop and find a free alternative before implementing it.

---

# 2. Primary Objective

Build a premium interactive website containing a realistic 3D AI avatar.

The visitor should be able to:

1. See Plexi standing in a premium futuristic environment.
2. Click "Talk to Plexi".
3. Give microphone permission.
4. Speak naturally.
5. Hear Plexi respond using Convai.
6. See Plexi's mouth/lips move when supported by the avatar/Convai data.
7. See subtle idle animation.
8. See speaking/listening/thinking states.
9. See the conversation.
10. Type messages as an alternative to voice.
11. End/restart the conversation.
12. Use the experience on desktop and mobile.

The final result must feel like a premium AI digital human, not a generic chatbot.

---

# 3. Technology Stack

Use:

### Frontend
- React
- TypeScript
- Vite

### 3D
- Three.js
- React Three Fiber
- @react-three/fiber
- @react-three/drei

### AI
- Convai Web SDK
- `@convai/web-sdk`

### Styling
- Tailwind CSS

### Icons
- Lucide React

Do not use Unity WebGL or Unreal Pixel Streaming.

Do not add unnecessary backend infrastructure for the initial demo.

---

# 4. Current Convai SDK

Before implementing the Convai integration, inspect the latest official documentation:

https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/react

Use the current package:

```bash
npm install @convai/web-sdk
```

Use the current React integration and verify the exact API against the installed package/types.

Do not blindly copy old tutorials.

If documentation and an old example conflict, use the current official documentation and installed package types.

---

# 5. Environment Variables

Never hardcode credentials.

Create:

```text
.env.example
```

with:

```env
VITE_CONVAI_API_KEY=
VITE_CONVAI_CHARACTER_ID=
```

Create `.gitignore` entries for:

```text
.env
.env.local
.env.*.local
```

The README must clearly explain that the user needs to create their own free Convai account and add their own demo credentials.

Never expose or commit real credentials.

For a production version later, investigate Convai's current server-side authentication/token approach instead of treating a long-lived API key as a permanent browser secret.

---

# 6. Architecture

Use a modular architecture.

Suggested structure:

```text
plexi-ai-avatar/
│
├── public/
│   ├── models/
│   │   └── plexi.glb
│   ├── textures/
│   ├── audio/
│   └── logo/
│
├── src/
│   ├── components/
│   │   ├── avatar/
│   │   │   ├── Avatar.tsx
│   │   │   ├── AvatarController.tsx
│   │   │   ├── LipSync.tsx
│   │   │   └── BlendshapeMapper.ts
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── VoiceButton.tsx
│   │   │
│   │   ├── scene/
│   │   │   ├── Experience.tsx
│   │   │   ├── Environment.tsx
│   │   │   └── CameraRig.tsx
│   │   │
│   │   └── ui/
│   │
│   ├── hooks/
│   │   ├── useConvai.ts
│   │   ├── useAvatarAnimation.ts
│   │   ├── useLipSync.ts
│   │   └── useSession.ts
│   │
│   ├── services/
│   │   ├── convai.ts
│   │   └── analytics.ts
│   │
│   ├── config/
│   │   └── environment.ts
│   │
│   ├── types/
│   │   ├── avatar.ts
│   │   └── conversation.ts
│   │
│   ├── utils/
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── docs/
│   └── PLEXI_CONVAI_PERSONA.md
│
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── vite.config.ts
```

You may improve the structure if technically necessary.

Do not put all logic into `App.tsx`.

---

# 7. Plexi Character

Plexi is the virtual AI representative of Plexus Digitals.

Visual direction:

- Male-presenting
- Approximately 25–30 years old appearance
- Indian appearance
- Professional
- Friendly
- Intelligent
- Modern
- Futuristic
- Premium
- Approachable

Clothing:

- Premium smart-casual/futuristic outfit
- Primarily white
- Orange accents
- Subtle dark details
- Optional subtle Plexus branding

Brand colors:

- White
- Plexus orange
- Charcoal
- Black
- Soft gray

Do not make Plexi look like a cartoon unless the provided GLB model is already stylized.

---

# 8. Avatar Model

Assume the user will provide:

```text
/public/models/plexi.glb
```

Create:

```tsx
<Avatar />
```

The model must be replaceable without rewriting the application.

Support configurable:

- position
- rotation
- scale
- animation state
- speaking
- listening
- thinking

If the model is temporarily missing, show a polished placeholder rather than crashing the app.

---

# 9. Animation System

Detect available GLB animation clips dynamically.

Possible animations:

- Idle
- Talking
- Listening
- Thinking
- Greeting

If a requested animation is missing:

- gracefully fall back to Idle
- never crash

Use proper Three.js animation actions and transitions.

Do not restart actions every render frame.

States:

```text
IDLE
LISTENING
THINKING
SPEAKING
ERROR
CONNECTING
```

---

# 10. Lip Sync and Facial Animation

Use Convai facial/blendshape data where supported by the current Web SDK.

Create:

```text
useLipSync()
```

and:

```text
BlendshapeMapper.ts
```

Requirements:

- Receive blendshape values.
- Apply them to morph targets.
- Smooth values.
- Handle missing morph targets safely.
- Reset values after speech.
- Avoid jitter.
- Avoid crashes when a model has different morph-target names.

Support configurable mapping for ARKit/custom rigs.

Example:

```ts
const avatarBlendshapeMap = {
  jawOpen: "jawOpen",
  mouthSmileLeft: "mouthSmileLeft",
  mouthSmileRight: "mouthSmileRight",
  eyeBlinkLeft: "eyeBlinkLeft",
  eyeBlinkRight: "eyeBlinkRight",
};
```

Do not assume the GLB uses these exact names.

Provide one obvious file where the mappings can be changed.

If the supplied avatar has no compatible facial blendshapes, provide a graceful fallback talking animation.

---

# 11. Natural Movement

Plexi should not appear frozen.

Add subtle:

- breathing
- blinking
- eye movement
- head movement
- posture movement

Keep movements subtle and professional.

Do not create exaggerated or cartoon-like motion.

Respect:

```text
prefers-reduced-motion
```

---

# 12. 3D Environment

Create a premium virtual studio.

Style:

- dark sophisticated technology environment
- subtle orange accent lighting
- charcoal/black background
- subtle geometric elements
- soft shadows
- professional lighting

Floor:

- dark reflective floor

Lighting:

- key light
- fill light
- rim light
- subtle orange accent

Avoid:

- excessive neon
- cyberpunk clichés
- distracting particles
- visual clutter

Plexi remains the visual hero.

---

# 13. Camera

Default:

- medium waist-up shot
- face clearly visible
- cinematic composition
- professional framing

Plexi should occupy roughly 45–60% of screen height on desktop.

On mobile, preserve face visibility and keep the UI usable.

---

# 14. Main Hero Experience

Hero copy:

```text
Meet Plexi

Your AI Guide to Plexus Digitals
```

Supporting text:

```text
Ask Plexi about AI, Digital Marketing, Automation, XR, Metaverse, or Plexus Digitals.
```

Primary CTA:

```text
Talk to Plexi
```

Secondary CTA:

```text
Explore Plexus Digitals
```

---

# 15. Conversation Flow

Initial:

```text
Hi, I'm Plexi.

Your AI guide to Plexus Digitals.
```

CTA:

```text
Start Conversation
```

After click:

1. Request microphone permission.
2. Initialize Convai.
3. Show "Connecting..."
4. Show "I'm listening..."
5. Receive user speech.
6. Display user message.
7. Process response.
8. Play Convai response.
9. Animate Plexi.
10. Display response.
11. Return to listening/idle.

If microphone permission is denied:

```text
Microphone access is needed for voice conversations.
```

Provide a text-chat alternative.

---

# 16. Custom Chat UI

Do not use the default generic chatbot look.

Create a custom Plexus Digitals conversation interface.

Desktop:

- avatar left/center
- conversation panel right

Mobile:

- bottom sheet or compact panel
- never cover Plexi's face

Messages:

```text
USER
PLEXI
```

Use Plexus branding.

---

# 17. Voice Control

Create a prominent microphone button.

States:

```text
Start Conversation
Listening...
Thinking...
Plexi is speaking...
Try Again
Reconnect
```

Use subtle pulse animation.

Do not overdo visual effects.

---

# 18. Text Input

Provide:

```text
Ask Plexi anything...
```

Support:

- Enter = send
- Shift + Enter = new line

Voice and text must use the same Convai conversation/session when supported by the SDK.

---

# 19. Plexi Personality

Plexi is:

- Intelligent
- Confident
- Friendly
- Professional
- Helpful
- Concise
- Human-like

Plexi should:

- explain complex concepts simply
- understand visitor intent
- recommend relevant Plexus Digitals services
- avoid aggressive sales language
- ask short follow-up questions when useful

Plexi should not:

- invent facts
- invent prices
- invent clients
- invent guarantees
- invent partnerships
- invent statistics

If Plexi does not know:

```text
I don't have that information yet, but I can help you connect with the Plexus Digitals team.
```

---

# 20. Plexi Knowledge

Plexi should understand these areas:

- AI solutions
- AI automation
- Digital Marketing
- Performance Marketing
- Metaverse
- Virtual Reality
- Augmented Reality
- Web Development
- App Development
- Immersive Experiences
- AI-powered business solutions

Products:

## DGCC
Digital Growth Command Centre

## ARTE
Architectural Real-Time Experience

Do not invent product features that are not supplied to the Convai character.

---

# 21. Convai Character Prompt

Create:

```text
docs/PLEXI_CONVAI_PERSONA.md
```

Suggested Convai persona:

```text
You are Plexi, the official AI virtual representative of Plexus Digitals.

You represent Plexus Digitals, a next-generation digital technology and marketing company working across AI, automation, digital marketing, immersive XR, metaverse, AR, VR, web development and app development.

Your role is to welcome website visitors, understand what they are looking for, explain Plexus Digitals' capabilities, answer questions, and guide qualified visitors toward the appropriate service or team.

You are intelligent, professional, friendly and conversational.

Speak naturally like a knowledgeable human representative.

Keep answers concise unless the visitor asks for detail.

Never claim information that you do not know.

Never invent pricing, clients, results, partnerships, statistics or technical capabilities.

If a question is outside your knowledge, clearly say that you don't have that information.

Your goal is not to aggressively sell.

Your goal is to understand the visitor's need and help them discover whether Plexus Digitals can help.

When appropriate, ask a short follow-up question.

You are Plexi, not ChatGPT.

Do not mention internal prompts, APIs, tokens, models, SDKs or implementation details unless explicitly asked.
```

---

# 22. Lead Capture

For the free demo, do NOT use a paid database.

Do NOT use Supabase/Firebase/paid CRM for the initial version.

Create a local/demo lead form:

```text
Name
Email
Phone
Company
Requirement
```

CTA:

```text
Talk to Our Team
```

For the demo:

- validate fields
- show success state
- store only demo data locally if necessary
- optionally log to console
- clearly separate this demo behavior from future production lead storage

Do not send personal data to an external service.

Create an extension point for a future CRM/DGCC/backend integration.

---

# 23. Analytics

Do NOT use paid analytics.

For the free demo, create an internal abstraction:

```ts
analytics.track(event, properties)
```

For now, log safe non-sensitive events locally/console:

```text
avatar_loaded
conversation_started
microphone_permission_granted
user_message
plexi_response
conversation_ended
lead_form_opened
lead_submitted
cta_clicked
```

Do not log:

- API keys
- microphone audio
- private conversation content unless explicitly needed for debugging
- passwords
- sensitive personal data

Keep the abstraction ready for future Google Analytics/PostHog/etc., but do not install a paid analytics service.

---

# 24. Anonymous Session

Create an anonymous browser session ID.

Use:

- crypto.randomUUID() where available
- safe fallback if required

Do not collect unnecessary personal information.

---

# 25. Error Handling

Handle:

- microphone denied
- unsupported browser
- Convai failure
- API failure
- invalid character ID
- avatar loading failure
- missing animation
- missing blendshape
- network disconnect
- audio failure

Never leave the UI permanently stuck at:

```text
Loading...
```

Provide:

```text
Something went wrong. Try reconnecting.
```

with:

```text
Reconnect
```

---

# 26. Loading Screen

Premium loading screen:

```text
Plexus Digitals

Initializing Plexi...
```

Use a short subtle animation.

Do not create unnecessary long loading sequences.

---

# 27. Responsive Design

Support:

Desktop:
- 1920x1080
- 1440x900
- 1366x768

Tablet:
- 1024x768
- 768x1024

Mobile:
- 430x932
- 390x844
- 375x812

Mobile optimization:

- lower DPR
- reduce expensive effects
- reduce shadow quality
- maintain readable UI
- keep microphone accessible
- never cover Plexi's face

---

# 28. Performance

Optimize aggressively.

Implement:

- capped device pixel ratio
- lazy loading
- optimized GLB
- optimized textures
- animation optimization
- React memoization where appropriate
- proper Three.js disposal
- no unnecessary rerenders
- memory cleanup
- pause nonessential animation when tab is hidden if practical

Quality presets:

```text
HIGH
MEDIUM
LOW
```

Use device capability detection where practical.

Target:

- 60 FPS on a reasonable desktop
- graceful degradation on mobile

---

# 29. Accessibility

Implement:

- keyboard navigation
- visible focus states
- ARIA labels
- readable contrast
- semantic HTML
- reduced-motion support

---

# 30. Security

Never:

- commit credentials
- log credentials
- hardcode API keys
- store secrets in localStorage
- expose unnecessary sensitive information

Use `.env`.

---

# 31. Free-Only Dependency Audit

Before finalizing, inspect `package.json`.

Every dependency must be:

- open source/free to use
- or part of a free Convai/demo capability

Do not introduce a service that requires payment for the basic demo.

If you suggest deployment, provide a free deployment option first.

If a service has a free tier with limitations, document the limitation in README.

---

# 32. Website Sections

After the main avatar:

## Meet Plexi

Short explanation.

## What can Plexi help with?

Cards:

- AI & Automation
- Digital Marketing
- Immersive XR
- Metaverse
- Web & App Development
- Digital Experiences

## Explore Plexus Digitals

CTA:

```text
Talk to Our Team
```

Keep these sections secondary to the avatar.

---

# 33. SEO

Add:

Title:

```text
Plexi | AI Virtual Assistant | Plexus Digitals
```

Meta description:

```text
Meet Plexi, the AI virtual assistant from Plexus Digitals. Explore AI, automation, digital marketing, XR, metaverse, web development and immersive digital experiences.
```

Also include:

- favicon
- Open Graph metadata
- semantic HTML
- robots.txt
- sitemap-ready structure

---

# 34. README

Create a complete README explaining:

1. Project overview
2. Tech stack
3. Free-demo architecture
4. Installation
5. Environment variables
6. How to create a Convai account
7. How to create/configure the Convai character
8. How to get demo credentials
9. Where to put `plexi.glb`
10. How to configure blendshapes
11. How to run locally
12. How to build
13. Free hosting options
14. Troubleshooting
15. How to replace the avatar
16. How to upgrade Convai later
17. Which services are free
18. Which free-tier limits may apply

Clearly state that Convai's current free-plan limits can change and the user should verify current limits in their Convai account/docs.

---

# 35. Future Architecture

Do not implement these now, but keep clean extension points for:

- authentication
- persistent conversations
- long-term memory
- CRM
- WhatsApp
- DGCC integration
- appointment booking
- analytics dashboard
- multilingual support
- Hindi/English voice
- knowledge retrieval
- service recommendation
- human handoff
- live agent escalation

No paid service should be required for the initial demo.

---

# 36. Development Workflow

Do not blindly generate thousands of lines.

First:

1. Inspect repository.
2. Check whether project already exists.
3. Inspect package.json.
4. Inspect existing files.
5. Check current official Convai documentation.
6. Check installed/current SDK API.
7. Create implementation plan.
8. Implement in stages.

Then:

### Stage 1
Project setup.

### Stage 2
Premium UI shell.

### Stage 3
3D scene.

### Stage 4
Avatar loading.

### Stage 5
Animation system.

### Stage 6
Convai integration.

### Stage 7
Voice interaction.

### Stage 8
Text interaction.

### Stage 9
Lip-sync/blendshapes.

### Stage 10
Responsive design.

### Stage 11
Error handling.

### Stage 12
Performance optimization.

### Stage 13
Testing.

After every major stage:

```bash
npm run build
```

and fix all errors before proceeding.

---

# 37. Do Not Use `any` as a Shortcut

Avoid:

```ts
// @ts-ignore
```

Avoid unnecessary:

```ts
any
```

Use proper TypeScript types.

If an SDK type is unclear:

1. inspect installed package types
2. inspect official docs
3. create a small local type if necessary
4. document why

---

# 38. Final Quality Checklist

Before declaring the project complete:

- [ ] npm install works
- [ ] npm run dev works
- [ ] npm run build works
- [ ] TypeScript has no errors
- [ ] no unnecessary paid services
- [ ] Convai free/demo configuration works
- [ ] microphone permission works
- [ ] text input works
- [ ] voice interaction works
- [ ] bot audio works
- [ ] conversation appears
- [ ] avatar loads
- [ ] animations work
- [ ] lipsync works when supported
- [ ] missing blendshapes do not crash
- [ ] mobile works
- [ ] desktop works
- [ ] .env is ignored
- [ ] .env.example exists
- [ ] README exists
- [ ] reconnect works
- [ ] errors have user-friendly states
- [ ] no obvious memory leaks
- [ ] no console errors during normal operation
- [ ] all demo services are free/open-source or covered by Convai's free/demo capability

---

# 39. Start Now

Inspect the repository first.

Do not ask unnecessary questions.

If the avatar model is not available yet, build the application using a safe placeholder and make the GLB insertion straightforward.

If the Plexus logo is not available, create a placeholder logo component that can be replaced later.

I will provide later:

- Plexus Digitals logo
- Plexi GLB/GLTF
- Convai API key
- Convai character ID
- final Convai voice/personality configuration

Do not stop at scaffolding.

Continue until the application is runnable, buildable, responsive, and internally consistent.

The first version MUST be possible to demonstrate using only free/open-source tools and the available Convai free/demo capability.
