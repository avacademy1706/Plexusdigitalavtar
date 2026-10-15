# Claude Code task: Prepare Plexi for Spine 4.x talking-avatar rigging

You are working with the supplied files in this folder. The mascot is called Plexi and the goal is a HEAD-AND-SHOULDERS talking avatar with facial expressions. Do not build a full-body rig.

## First inspect the assets
1. Inspect `Plexi_original_full_reference.png`, `Plexi_head_shoulders_reference.png`, `Plexi_face_reference.png`, and `Plexi_expression_reference_sheet.jpg`.
2. Treat the original PNG as the canonical identity and design reference.
3. Treat the expression sheet only as a visual reference. It has a background and must not be presented as clean transparent sprites.
4. Preserve the hairstyle, skin tone, eye style, white hoodie, orange accents, and original Plexus logo design.

## Required artwork preparation
Create a clearly organized `artwork/` directory for manually prepared or generated transparent PNG layers. Use a consistent canvas and alignment for facial parts where practical.

Suggested assets:
- `head_base.png` (face/ears/forehead with neutral features removed where feasible)
- `hair_back.png`
- `hair_front.png`
- `eye_white_L.png`, `eye_white_R.png`
- `iris_pupil_L.png`, `iris_pupil_R.png`
- `eyelid_upper_L.png`, `eyelid_upper_R.png`
- `eyelid_lower_L.png`, `eyelid_lower_R.png`
- `brow_L.png`, `brow_R.png`
- `nose.png` only if separation is visually clean
- `mouth_rest.png`
- `mouth_MBP.png`
- `mouth_FV.png`
- `mouth_A.png`, `mouth_E.png`, `mouth_I.png`, `mouth_O.png`, `mouth_U.png`
- `mouth_L.png`, `mouth_TH.png`, `mouth_CH_SH.png`
- `mouth_smile.png`, `mouth_open.png`
- `mouth_interior.png`, `teeth_upper.png`, `teeth_lower.png`, `tongue.png` as needed
- `neck.png`, `hoodie_shoulders.png`, `hood_drawstrings.png` if useful for subtle upper-body motion

Do not fabricate a claim that these layers already exist. Cropping a flattened PNG is insufficient for clean eyes/mouth separation. If a required part cannot be extracted cleanly, create a TODO entry and recommend manual repainting or a new consistent facial asset. Avoid changing character identity or inventing text/logos.

## Spine 4.x rig design
Suggested bones:
- `root`
- `body`
- `neck`
- `head`
- `hair_front` (optional secondary motion)
- `eye_L`, `eye_R`
- `brow_L`, `brow_R`
- `jaw` (only if supported by the artwork)
- optional `drawstring_L`, `drawstring_R`

Suggested slots:
- `hair_back_slot`
- `neck_slot`
- `head_base_slot`
- `eye_white_L_slot`, `eye_white_R_slot`
- `iris_L_slot`, `iris_R_slot`
- `eyelid_L_slot`, `eyelid_R_slot`
- `brow_L_slot`, `brow_R_slot`
- `mouth_slot`
- `hair_front_slot`
- `hoodie_slot`
- `drawstrings_slot`

Use rigid attachments for pupils and small details, attachment swaps for mouth visemes, and meshes only where deformation is useful. Keep the face features aligned during head tilt. Do not use heavy mesh deformation to fake missing facial artwork.

## Animation timelines
Create or plan:
- `idle`: subtle breathing and very small head motion
- `blink`: clean eyelid closure and reopening
- `talking`: mouth-shape sequence and subtle head/body emphasis
- `listening`: relaxed face with occasional blink
- `happy`, `surprised`, `concerned`, `thinking`: reusable expression poses

## Lip-sync
Use viseme groups, not one image per alphabet letter:
- REST
- MBP (closed lips)
- FV
- AI
- E
- O
- U
- L
- TH
- CH_SH
- SMILE
- OPEN

Provide a documented mapping format that can be driven from audio timing or an external lip-sync system. Spine itself does not automatically infer phonemes from audio.

## Required output
1. A source-art audit listing what is genuinely available versus what needs reconstruction.
2. A clean asset naming manifest.
3. A practical Spine 4.x setup plan.
4. If your environment supports authoring Spine project files, create and test them; otherwise provide scripts, manifests, and instructions without claiming a `.spine` file was created.
5. Include a QA checklist for blink alignment, mouth alignment, head tilt, edge gaps, draw order, and logo integrity.

Be explicit about blockers. Do not silently substitute the generated expression reference sheet for clean separated facial artwork.
