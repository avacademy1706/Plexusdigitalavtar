# Plexi – Artwork Audit (Spine 4.x talking-avatar prep)

Audited: 2026-10-15. All pixel coordinates below are in the **original 300 × 860 PNG** (origin top-left).

## 1. Source images available

| File | Size | Alpha | Role | Notes |
| --- | --- | --- | --- | --- |
| `Plexi_original_full_reference.png` | 300 × 860 | yes (clean 0/255 except on edges) | **Canonical identity** | Byte-identical to the file used by the web app (`plexi-ai-avatar/aVTAR_IMAGE/plexi_front_view.png`). One flattened layer. |
| `Plexi_head_shoulders_reference.png` | 264 × 470 | yes | Framing reference | A crop of the original; no new pixels. |
| `Plexi_face_reference.png` | 156 × 190 | yes | Facial detail reference | A crop of the original; no new pixels. |
| `Plexi_expression_reference_sheet.jpg` | 1536 × 1024 | **no** (JPEG, painted background) | Inspiration only | 22 separately generated portraits at ~200 px head height. Identity drifts between portraits (eye size, hair volume, chin). Not aligned to each other or to the original; not cut out. **Not used as rig artwork.** |
| `README.md`, `CLAUDE_CODE_PROMPT.md` | – | – | Brief | – |

**Key limitation: the only canonical art is one flattened 300-px-wide PNG.** The head is ~130 px wide; each eye is ~25 × 17 px; the mouth is ~50 × 15 px. There are no separate layers and no hidden pixels anywhere.

## 2. Measured facial landmarks (original pixels)

| Feature | Position / extent |
| --- | --- |
| Hair | top y≈12; mass spans x≈95–245, y≈12–150 (sideburns behind ears). Fringe sweeps over the forehead from the right, lowest at ≈(160, 95). |
| Forehead skin | visible from y≈72 (right side) / y≈85 (left side) down to the brows. |
| Brow L (screen-left) | x≈129–168, y≈88–108; thick, dark brown, arched; tail touches hair at x≈128–132. |
| Brow R (screen-right) | x≈178–211, y≈88–111; hair begins at x≈212–216 at brow height. |
| Eye L opening | centre ≈(147.5, 118.5); ≈25 × 17 px almond; dark lash outline; iris ≈15 px with dark pupil and one white highlight (upper-right). |
| Eye R opening | centre ≈(193, 121); same construction. |
| Nose | x≈160–183, y≈136–148; soft shading only, no hard outline. |
| Mouth (baked smile) | corners ≈(144, 150.5) and (193, 151); upper lip line y≈150–153; visible upper teeth y≈153–161; lower-lip shadow to y≈166. The mouth is **open in a smile showing teeth** – there is no closed-lip rest pose in the source. |
| Ears | L x≈108–132, y≈108–150; R x≈228–246, y≈112–150 (partly behind hair). |
| Chin / jaw | lowest chin point ≈(168, 178); jaw rises to ≈y 166 at x 140 and ≈y 168 at x 200. |
| Neck | skin x≈147–206, y≈170–218, darker than the face; hood lining (orange) directly left/right of it, near-identical hue to the skin. |
| Hood lining | orange, visible y≈175–222 either side of the neck. |
| Drawstrings | orange, x≈140–151 and 172–183, y≈212–262, eyelets at y≈214–220. |
| Plexus logo | network graphic y≈262–300, "plexus" y≈304–324, "digitals" y≈328–340, x≈100–200. **Must not be altered.** |

Sampled colours: cheek skin ≈ (228,127,74); forehead ≈ (231,147,87); chin ≈ (246,156,87); neck ≈ (227,123,53); hoodie white ≈ (244,236,234); hood lining ≈ (237,144,87); drawstring ≈ (247,107,19).

## 3. What exists vs. what is hidden

| Needed layer | Visible in source? | Hidden pixels that must be reconstructed |
| --- | --- | --- |
| Head/face skin | yes | skin **behind** brows, eye sockets, mouth, and under the fringe/hairline band (needed so head tilt and hair motion do not expose holes). |
| Hair | yes (one mass) | there is no "back" hair layer: the skull behind the hair does not exist. |
| Eye whites | yes, but partly covered by the iris and outlined by lashes | sclera behind the iris. |
| Iris | yes (with pupil + highlight painted in) | iris colour behind the pupil. |
| Pupil | yes (baked into the iris) | – |
| Eyelids (upper/lower) | **no** – the eyes are open; no lid artwork exists | entire eyelid pieces. |
| Eyebrows | yes | – (skin behind them must be reconstructed on the head). |
| Mouth – rest/smile | yes (open smile with upper teeth) | **no closed mouth and no other mouth shapes exist.** |
| Mouth – MBP, FV, A, E, I, O, U, L, TH, CH_SH, OPEN | **no** | entire set of viseme mouths. |
| Mouth interior, lower teeth, tongue | **no** | entire pieces. |
| Neck | yes | neck skin behind the chin (needed for head tilt). |
| Hoodie shoulders / hood | yes | hoodie behind the drawstrings; hood lining behind the neck. |
| Drawstrings | yes | – |

## 4. Reconstruction plan (what the scripts in this folder genuinely do)

Working canvas: crop **x 0–300, y 0–352** of the original (head, neck, shoulders, full logo), upscaled **4×** with Lanczos to **1200 × 1408**. Upscaling adds no detail; it only gives the vector-generated parts (eyelids, visemes) room for clean anti-aliased edges and gives Spine a reasonable working size. Edges of the original artwork stay slightly soft at this size.

* **Extracted from the original (real pixels):** hair, brows, iris ring, pupil + highlight, baked smile (`mouth_rest`), neck, hoodie, drawstrings, head skin.
* **Reconstructed by diffusion inpainting (skin/cloth filled from surrounding pixels):** head skin behind brows, eye sockets, mouth and a band under the hairline; iris colour behind the pupil; neck extended up behind the chin; hoodie behind the drawstrings; hood lining behind the neck. Diffusion fill is smooth but featureless – acceptable for this flat-shaded style, but a painter should check it.
* **Generated as vector art in the character's sampled colours (NOT hand-painted):** eye-white fills, upper/lower eyelids (skin tone with a lash line), the `hair_back` silhouette, and all viseme mouths (`MBP, FV, A, E, I, O, U, L, TH, CH_SH, OPEN, SMILE`) plus `mouth_interior`, `teeth_upper`, `teeth_lower`, `tongue`. These are built to the mouth's measured position and width so they do not float or change scale, but they are simpler than the painted source and are the first thing an artist should repaint.

## 5. Limitations that remain after processing

1. **Resolution.** 4× upscale of a 300-px source: hair and skin edges are soft; iris/pupil separation is approximate (the iris is ~15 source pixels). A higher-resolution render of the same character would improve every extracted layer; the scripts rerun unchanged on a larger source once `scripts/landmarks.mjs` is rescaled.
2. **No jaw.** The chin cannot be separated from the flattened face without repainting the lower face, so no `jaw` bone is created. Mouth opening is done with attachment swaps (visemes) on a `mouth` bone; subtle emphasis uses that bone's translate/scale only.
3. **Generated mouths are stylised.** They match position, width and colours but not the painterly rendering of the original smile. Treat them as production-aligned placeholders for an artist's pass.
4. **Hair back layer is a silhouette**, not drawn hair. It exists only so that secondary hair motion never exposes transparent gaps.
5. **Neck/lining colour overlap.** Neck skin and hood lining are near-identical in hue; the split is done with a hand-measured polygon, not colour alone. Check the seam if the neck polygon is edited.
6. **Expression sheet unused.** Its portraits are not consistent enough to cut sprites from. It remains a visual target for an artist.
7. **No Spine Editor in this environment.** The rig is authored as Spine 4.x skeleton JSON (the documented *Import Data* format) and verified with a custom compositor; it is not a `.spine` project until imported and saved in Spine Editor. See `docs/RIG_HIERARCHY.md` and the README for the exact import steps.

## 6. Manual-artwork tasks recommended (for a painter, ordered by impact)

1. Repaint the 12 viseme mouths over the generated placeholders (keep filenames, canvas and alignment).
2. Paint proper eyelids (upper with lashes/crease, lower thin) over the generated skin-tone lids.
3. Touch up inpainted skin behind the mouth and brows (subtle shading continuity).
4. Optionally paint real hair strands for `hair_back` so hair secondary motion shows texture, not a silhouette.
5. Optionally paint a separable chin if a true `jaw` bone is wanted later.

## 7. Result status (after running `npm run all`)

| Layer group | Provenance (from `artwork/manifest.json`) | Verified by |
| --- | --- | --- |
| head_base, neck, hoodie_shoulders, iris_L/R | real pixels + diffusion-filled hidden areas (`inpainted`) | `qa/composite_rest.png` reproduces the original; `qa/composite_diff.png` shows differences only on redrawn/feathered edges |
| hair_front, brow_L/R, pupil_L/R, mouth_smile, hood_drawstrings | real pixels only (`extracted`) | same |
| hair_back, eye_white_L/R, eyelid_upper/lower_L/R, mouth_rest/MBP/FV/A/E/I/O/U/L/TH/CH_SH/open, mouth_interior, teeth_upper/lower, tongue | vector art in sampled colours (`generated`) | `qa/layers_sheet.png`; placement checked in `qa/preview_sheet.png` |

No layer is claimed to be hand-painted. Layers marked `generated` are the artist to-do list in section 6.
