# Plexi – Lip-sync Guide

Spine does **not** detect phonemes from audio. Lip-sync is driven by **timed viseme cues** produced outside Spine (a TTS alignment, a phoneme tool, or hand timing). This document defines the cue format, the mapping to Spine attachments, and the three ways to play it.

## 1. Viseme groups → Spine attachments (slot `mouth`)

Machine-readable copy: `spine/viseme_map.json`.

| Group | Attachment | Sounds | Shape |
| --- | --- | --- | --- |
| `REST` | `mouth_rest` | silence, pauses | closed, relaxed, slight upturn |
| `MBP` | `mouth_MBP` | m, b, p | lips pressed closed |
| `FV` | `mouth_FV` | f, v | upper teeth on lower lip |
| `AI` | `mouth_A` | a (father), ai, eye | open, teeth top, tongue low |
| `E` | `mouth_E` | e, eh, ae; also "ee" | wide, slight open, both teeth rows |
| `O` | `mouth_O` | o, oh, aw | rounded, tall |
| `U` | `mouth_U` | u, oo, w | pucker |
| `L` | `mouth_L` | l | open, tongue up to the teeth |
| `TH` | `mouth_TH` | th | tongue tip between teeth |
| `CH_SH` | `mouth_CH_SH` | ch, sh, j, zh, s, z, t, d, k, g, n | teeth close together, slight protrusion |
| `SMILE` | `mouth_smile` | the brand smile (original art) | use at the end of lines / listening |
| `OPEN` | `mouth_open` | laughs, surprise | big open |

Extra: `mouth_I` (narrow "ee") can replace `mouth_E` for very wide vowels.

Letter → group quick map (English, approximate): a→AI, e/i/y→E, o→O, u/w→U, m/b/p→MBP, f/v→FV, l→L, th→TH, s/z/c/x/ch/sh/j/t/d/n/k/g→CH_SH, h/r→AI (half), punctuation/space→REST. Hindi/other scripts: map vowels by sound; unknown consonants → CH_SH.

## 2. Cue file format

```json
{
  "name": "lipsync/line_intro",
  "cues": [
    { "t": 0.00, "viseme": "REST" },
    { "t": 0.08, "viseme": "AI" },
    { "t": 0.22, "viseme": "E" },
    { "t": 0.34, "viseme": "MBP" }
  ],
  "end": 1.8
}
```

* `t` = seconds from the start of the audio file; each cue holds until the next one.
* `end` = when to return to `REST`/`SMILE` (default: last cue + 0.15 s).
* Example: `spine/example_cues.json`.

### Timing rules (what makes it look right)
* Minimum hold **50–60 ms**; merge shorter phonemes into their neighbour (the converter does this).
* `MBP` and `FV` must be **snapped** (no blending) and should land ~30 ms **before** the sound is heard.
* Insert `REST` for pauses longer than 150 ms; shorter gaps keep the previous shape.
* Lead the audio by one frame (≈ 30 ms) overall – mouths that lag read as wrong, mouths that lead read as natural.
* Co-articulation: for vowel→vowel transitions in the runtime path you may cross-fade the `mouth` bone scale (1.0→1.04→1.0) over 60 ms; attachments themselves cannot blend.
* End every line on `SMILE` after ~150 ms of `REST`.

## 3. Playing cues

### A. Bake into Spine (editor workflow)
```
node scripts/cues_to_animation.mjs spine/example_cues.json
```
This adds an animation (`lipsync/<name>`) with a stepped attachment timeline on slot `mouth` to `spine/Plexi_skeleton.json`. Import the JSON into Spine Editor (see README) – the animation appears in the Animations list and can be refined by hand. Spine Editor has no cue importer of its own; this script is that importer.

### B. Runtime: attachment swaps (recommended for live TTS)
With any official Spine runtime (spine-ts / Unity / Unreal / Godot …):
```ts
// every cue, at audio time t:
skeleton.setAttachment("mouth", visemeMap.groups[cue.viseme]);
```
Keep `idle`/`listening` on track 0 and `blink` on track 1; the attachment swap is independent of both.

### C. Runtime: one-frame viseme animations
```ts
state.setAnimation(2, "visemes/" + cue.viseme, false); // mix duration 0
```
Equivalent to B but visible in the AnimationState (useful for debugging).

## 4. Getting cues from TTS

* **ElevenLabs Conversational AI** (used by the Plexi web app) streams per-character alignment (`chars`, `char_start_times_ms`, `char_durations_ms`). Map each character with the letter table above → cue list. The web app's `src/services/visemes.ts` already does this mapping for the 2D image avatar and can emit this cue format.
* Any phoneme aligner (e.g. a free forced-alignment tool) → map phonemes to groups with the table in section 1.

## 5. Not included / limitations

* No automatic transcription or audio analysis is bundled; cues must come from outside.
* The 12 viseme mouths are generated placeholders aligned to the character; an artist pass is recommended before shipping (keep filenames and canvas so the rig and this mapping stay valid).
