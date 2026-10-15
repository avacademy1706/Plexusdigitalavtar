# The Plexi avatar rig in the web app

The 3D studio shows Plexi as a **layered 2D rig** (eyes, lids, brows, 13 mouth shapes, hair, body) played by a small runtime in `src/components/avatar/RigAvatar.tsx`. It replaces the earlier flat illustration, which stays as a fallback.

## Where the files come from

```
Plexi_Spine4_Talking_Assets/          <- source of truth (artwork pipeline + Spine-format skeleton)
   npm run all                        <- rebuilds artwork, skeleton, QA renders, then exports to ...
plexi-ai-avatar/public/avatar/rig/    <- runtime copy used by the app (do not edit by hand)
   Plexi_skeleton.json                bones, slots, clipping, animations, visemes
   viseme_map.json
   artwork/manifest.json + *.png      36 layers (alpha-bled PNGs)
```

To change the avatar: edit artwork or `scripts/landmarks.mjs` in `Plexi_Spine4_Talking_Assets`, run `npm run all` there, reload the app. An artist can also repaint any PNG in that folder's `artwork/` (keep the filename and canvas) and run `npm run export` only.

## Source priority in `Avatar.tsx`

1. `public/models/plexi.glb` – a real 3D model, if you add one
2. `public/avatar/rig/` – **this rig (default)**
3. `public/avatar/plexi_front_view.png` – flat illustration with shader eyes/mouth
4. built-in placeholder

## What the runtime does (`RigAvatar.tsx`, `rigRuntime.ts`)

* Builds the bone hierarchy as `THREE.Group`s and every attachment as a textured plane; draw order = Spine slot order; eye parts are clipped with the stencil buffer (polygon from the skeleton).
* Additive animation layers, like Spine: base loop (`idle` / `listening`, cross-faded), expression pose (`thinking`, `concerned`), `blink` every 2–6 s, gaze saccades on the eye bones, speech head emphasis.
* Mouth: during speech the attachment follows viseme groups from `SpeechAudioSource.getViseme()` – ElevenLabs character alignment mapped by `src/services/visemes.ts` (`charToViseme`). Without timing data it falls back to loudness. Outside speech the mouth comes from the playing animation (`mouth_smile` / `mouth_rest`).
* State → animation: IDLE/CONNECTING → `idle`; LISTENING → `listening`; THINKING → `idle` + `thinking`; SPEAKING → `idle` + live visemes; ERROR → `idle` + `concerned`.

It reads the documented Spine JSON format but is **not** a Spine runtime (no meshes, IK, or exact bezier curves). If you later export from Spine Editor with meshes, switch to the official `@esotericsoftware/spine-threejs` runtime (needs a Spine license).

## Previews

* `?demo=speaking` – replays a sentence through the viseme path.
* `scripts/shot_rig.mjs` – headless screenshots of setup + speaking (`node scripts/shot_rig.mjs <outDir>` with `vite preview` on port 4173).

## Limits

* Visemes, eyelids and the back-hair silhouette are generated placeholders aligned to the character; see `Plexi_Spine4_Talking_Assets/docs/ARTWORK_AUDIT.md` for the artist to-do list.
* The rig is ~3.5 MB of PNGs at 4× the original 300-px art; a higher-resolution source render is the biggest quality upgrade.
