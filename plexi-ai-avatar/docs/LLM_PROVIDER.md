# Voice provider: self-hosted LLM path (Kimi / Grok) vs ElevenLabs

`VITE_VOICE_PROVIDER` in `.env.local` selects how Plexi listens, thinks and speaks:

| Provider | Listening (STT) | Brain (LLM) | Speaking (TTS) | Lip-sync timing | Knowledge |
| --- | --- | --- | --- | --- | --- |
| `llm` (default now) | browser Web Speech API (Chrome, Edge, Safari; not Firefox) | any OpenAI-compatible chat API via `/api/chat` - **Kimi**, Grok, OpenRouter, Groq ... | browser `speechSynthesis` (OS voices) | word-boundary events -> visemes (coarser) | `src/content/plexiPersona.ts` system prompt |
| `elevenlabs` | ElevenLabs agent | ElevenLabs agent | ElevenLabs voice | per-character alignment (best) | agent knowledge base in the ElevenLabs dashboard |

The ElevenLabs code is untouched (`src/hooks/useVoiceAgent.ts`, token endpoint); flip the variable to `elevenlabs` to go back. Both hooks are mounted by `src/hooks/useAgent.ts`; only the selected one is driven.

## Setting up Kimi (Moonshot)

```env
VITE_VOICE_PROVIDER=llm
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_API_KEY=sk-...            # from platform.kimi.ai -> API keys (server-side only, never VITE_)
LLM_MODEL=kimi-k2.6           # general-purpose; kimi-k3 = flagship (1M context), pricier
```

## Setting up Grok (xAI)

```env
VITE_VOICE_PROVIDER=llm
LLM_BASE_URL=https://api.x.ai/v1
LLM_API_KEY=xai-...
LLM_MODEL=grok-4.3            # cheapest general chat model at the time of writing
```

Nothing else changes - the proxy (`vite.config.ts` in dev/preview, `functions/api/chat.js` on Cloudflare Pages) just forwards `POST {base}/chat/completions` with the key. Any other OpenAI-compatible host works the same way (e.g. a free Kimi-K2 listing on OpenRouter or Groq: set its base URL, key and model id).

## Free-tier reality (checked 2026-10-19; both change often - verify in the provider console)

* **Kimi / Moonshot:** no standing free tier on the official API; accounts activate with a small minimum top-up (reported ~$1) and promotions give vouchers after spending. Kimi K2 is open-weight, so rate-limited free listings exist on third-party hosts.
* **Grok / xAI:** no permanent free tier; new accounts have received a one-time promotional credit (amount reported between ~$25 and a monthly data-sharing program - confirm in console.x.ai). Pay-as-you-go afterwards.
* Either way a demo costs cents: each turn is ~1k input tokens and ~60 output tokens.

**Recommendation:** keep the code provider-agnostic (done). Start with Kimi as decided; if its top-up is a blocker, point `LLM_BASE_URL` at a free Kimi-K2 host or at Grok while its promo credit lasts - zero code changes.

## Local testing without any key

```env
LLM_PROVIDER=mock
```
`/api/chat` then answers with a canned Plexi reply (Hinglish if you write Hindi) so the whole loop - mic, avatar visemes, chat UI - can be exercised offline. Remove it (or set `LLM_PROVIDER=kimi`) to use the real API.

## Other options

* `VITE_STT_LANG` (default `en-IN`) - speech-recognition language; use `hi-IN` for Hindi-first visitors.
* `VITE_TTS_VOICE` - force an exact `speechSynthesis` voice name (run `speechSynthesis.getVoices().map(v => v.name)` in the browser console to list them). By default Plexi picks an Indian-English male voice if the OS has one, and a Hindi voice for Devanagari replies.

## Hosting

Cloudflare Pages: set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (and optionally `LLM_PROVIDER`) as environment variables; `functions/api/chat.js` deploys automatically with the site. Netlify/Vercel: port that one function to their format.
