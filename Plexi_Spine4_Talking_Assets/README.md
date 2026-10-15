# Plexi – Spine 4.x Talking Avatar (head & shoulders)

Production prep of the Plexus Digitals mascot **Plexi** as a 2D talking avatar for **Spine 4.2**: separated/reconstructed facial artwork, a generated skeleton with eye/brow/mouth rigs and expression animations, a lip-sync cue pipeline, and QA renders.

**What this is and is not**
* ✅ Artwork layers (`artwork/`), asset manifest, Spine skeleton **JSON data** (`spine/Plexi_skeleton.json`) for *Import Data*, animations, viseme map, cue converter, docs, QA renders – all generated and verified by the scripts in this folder.
* ❌ **No `.spine` project file exists yet.** Spine Editor is not installed in the environment that produced this. The project is created the first time you import the JSON in Spine Editor and save (steps below).
* ❌ No automatic lip-sync from audio. Cues come from TTS alignment or a phoneme tool (see `docs/LIP_SYNC_GUIDE.md`).
* ⚠️ The 12 viseme mouths, eyelids and `hair_back` are **generated vector placeholders** in the character's colours, aligned to the face. They work in the rig but should get an artist pass. Everything else is real pixels from the original (plus diffusion-filled hidden areas).

## Folder contents

```
Plexi_original_full_reference.png      canonical art (unchanged)
Plexi_*_reference.*                    reference crops / expression sheet (unchanged, not used as sprites)
artwork/                               rig layers (trimmed PNGs, straight alpha) + manifest.json
  head/      head_base, hair_front, hair_back, neck
  eyes/      eye_white_*, iris_*, pupil_*, eyelid_upper_*, eyelid_lower_*
  brows/     brow_L, brow_R
  mouth/     mouth_smile (original), mouth_rest/MBP/FV/A/E/I/O/U/L/TH/CH_SH/open, mouth_interior, teeth_upper, teeth_lower, tongue
  upper_body/ hoodie_shoulders, hood_drawstrings
spine/Plexi_skeleton.json              Spine 4.2 JSON skeleton data (bones, slots, clipping, skins, 22+ animations)
spine/viseme_map.json                  viseme group -> attachment
spine/example_cues.json                example timed cues for one line
docs/ARTWORK_AUDIT.md                  what existed, what was hidden, what was rebuilt, limits
docs/RIG_HIERARCHY.md                  bones, slots, draw order, animations, ranges
docs/LIP_SYNC_GUIDE.md                 cue format, mapping, how to drive it
docs/QA_CHECKLIST.md                   verified checks + what to re-check in Spine
qa/                                    composite_rest/diff, layers_sheet, preview/*.png, preview_sheet.png
scripts/                               the pipeline (Node 18+)
```

## Rebuild everything

```bash
npm install            # sharp + pngjs (free, open source)
npm run all            # artwork -> layer sheet -> skeleton -> validate -> preview renders
```
Individual steps: `npm run artwork`, `npm run sheet`, `npm run skeleton`, `npm run validate`, `npm run preview`.
Landmarks (eye centres, brow boxes, jaw curve, neck polygon …) live in `scripts/landmarks.mjs`; the whole pipeline is deterministic from them, so re-measure there if you swap in higher-resolution source art.

Lip-sync cues → animation: `node scripts/cues_to_animation.mjs spine/example_cues.json` (merges `lipsync/<name>` into the skeleton JSON).

## Open and complete the rig in Spine Editor 4.2

1. **New project** → `Spine` menu (top-left) → **Import Data…** → choose `spine/Plexi_skeleton.json`. Keep "Import into new project". If your editor is older than 4.2, regenerate with `SPINE_VERSION=4.1.24 npm run skeleton` (the data uses only 4.1-compatible features) – Spine refuses data newer than itself.
2. In the Tree, select the skeleton → **Images** node → set the path to the `artwork` folder (the JSON already carries `../artwork/`; fix it if your project is saved elsewhere). All 35 region attachments must show without a missing-image marker.
3. Check the setup pose against `qa/preview/setup.png`. Nothing should be offset – positions are computed from the manifest.
4. Open **Animate** mode and scrub `blink`, `talking`, `idle`, the four expressions and `visemes/*`. Use `docs/QA_CHECKLIST.md` → "To do inside Spine Editor".
5. Optional: convert the two eye clipping polygons' colours/visibility to taste; add bezier curves (the generated curves are plain smooth-in/out).
6. **Save as** `spine/Plexi.spine`. That file is the editable project; the JSON is only the seed.
7. Export: `Spine` → **Export** → JSON or binary + texture atlas (strip whitespace, premultiplied alpha as required by your runtime).

## Driving it from the Plexi web app

The web app (`../plexi-ai-avatar`) currently animates a flat image. To use this rig in the browser: export the atlas + skeleton from Spine, load it with the official `@esotericsoftware/spine-webgl` / `spine-pixi` runtime (requires a Spine license), play `idle` + `blink`, and call `skeleton.setAttachment("mouth", …)` from the ElevenLabs character alignment using the mapping in `docs/LIP_SYNC_GUIDE.md`. The existing `src/services/visemes.ts` already converts alignment characters to mouth shapes and can emit the cue format.

## Unresolved blockers

* No Spine Editor here → the JSON is validated structurally and rendered with a custom compositor, not loaded by Spine itself.
* Source art is a single 300 px flattened PNG → upscaled 4×; fine detail is soft. A higher-resolution render of the same pose is the single biggest quality upgrade.
* Hidden pixels (skin behind brows/eyes/mouth, hood lining behind the neck, cloth behind drawstrings) are reconstructed by diffusion fill, not painted.
* No jaw bone (no separable chin in the source).
