# Plexi – QA Checklist

Two levels: **(A)** automated here with `npm run all` (compositor renders in `qa/preview/`), **(B)** must be repeated inside Spine Editor after import, because the compositor is not a Spine runtime (no bezier curves, no meshes, simplified clipping).

Status column: ✅ verified in `qa/preview_sheet.png` · ⚠️ verified with a caveat · ⬜ needs Spine Editor / artist.

| Check | How | Status |
| --- | --- | --- |
| Setup pose matches the original artwork | `qa/composite_rest.png` vs `Plexi_original_full_reference.png`; `qa/composite_diff.png` shows only feature outlines | ✅ (mean diff ≈ 8/255, confined to re-drawn eye whites, lids, feathered seams) |
| Facial features stay aligned during head movement | `tilt_+6`, `tilt_-6`, `idle_2s` frames | ✅ all face slots are children of `head` |
| Blink closes cleanly, no gap at the corners | `blink_closed`, `blink_half`; pixel-column check shows no sclera left inside the clip polygon | ✅ lid clipped to the opening; the dark lower outline on `head_base` stays visible and reads as the closed-eye line |
| Closed eye does not show a lighter patch | `blink_closed` | ⚠️ lid uses a skin gradient; still slightly flatter than painted skin – artist polish |
| Pupils never leave the eye whites | `gaze_far_left/right` (±22 px, beyond the recommended ±16) | ✅ clipped by `eye_clip_*` |
| Mouth poses align with nose and chin | all `viseme_*` frames | ✅ shared footprint around the measured mouth centre |
| Teeth / tongue stay inside the mouth | `viseme_AI`, `viseme_L`, `viseme_TH`, `viseme_OPEN` | ✅ clipped to the interior path in the SVG |
| Head tilt does not expose missing artwork | `tilt_±6` – look at chin/neck, forehead/hair, ears | ✅ neck extended up, skin under hairline rebuilt, hair_back behind |
| Hair overlaps the forehead correctly | `hair_shift` (+2°, +4 px) | ✅ `hair_front` draws last; skin exists beneath |
| Hoodie + drawstrings stable | `idle_2s` (drawstring sway) | ✅ drawstrings on their own bones; cloth rebuilt behind them |
| Branding unchanged | compare logo region of `hoodie_shoulders.png` with the original | ✅ never masked or inpainted (inpaint regions are the neck polygon and the drawstrings only) |
| Alpha / dimensions | `npm run validate` checks every attachment size against its PNG and that alpha exists | ✅ |
| Draw order correct | `scripts/validate_skeleton.mjs` checks clip end slots; visual check in previews | ✅ |
| Expressions readable | `happy`, `surprised`, `concerned`, `thinking` | ⚠️ readable; brows are the weakest (small source art) |
| No edge gaps between neck and collar when `body` scales (breathing) | `idle_2s` | ✅ neck and hoodie are both under `body` |

## To do inside Spine Editor (after Import Data)

1. Set the **images path** (`../artwork` relative to the saved project) and verify every attachment resolves.
2. Scrub `blink`: upper lid must meet the lower lid with no sclera showing; adjust the `eyelid_upper_*` key value if the opening height changed after an artist edit.
3. Scrub `talking` and each `visemes/*`: no mouth jump; check the lower-lip line against the chin shading.
4. Rotate `head` ±8° manually: no gaps at the neck top, the ears, or the hairline.
5. Play `idle` + `blink` on two tracks for 30 s: no drift, no popping.
6. Check the clipping polygons in the viewport – they should hug the inner edge of each eye outline.
7. Export: Texture Packer with "Strip whitespace X/Y" on, premultiplied alpha per your runtime, scale 0.5 if the target is ≤ 600 px tall.
8. Save the project as `spine/Plexi.spine` (not generated here).

## Known residuals to fix by hand (artist)

* Viseme mouths are vector placeholders (flat lips, simple teeth).
* Eyelids are flat skin tone with a lash line; no painted crease texture.
* Skin behind the mouth/brows is diffusion-filled (very smooth); check under strong display scaling.
* Source resolution (300 px wide) limits sharpness at 4×; a higher-res render of the same pose would improve everything without changing the rig.
