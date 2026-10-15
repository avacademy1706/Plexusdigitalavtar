# Plexi Spine 4.x Talking Avatar - Asset Handoff

## What's included
- `Plexi_original_full_reference.png` — original user-supplied transparent PNG, preserved unchanged.
- `Plexi_head_shoulders_reference.png` — crop of the original for head/shoulders work; reference only.
- `Plexi_face_reference.png` — crop of the original face; reference only.
- `Plexi_expression_reference_sheet.jpg` — generated visual reference for speech shapes, blinking and expressions. It has a background and is NOT a production sprite atlas or transparent cutout set.
- `CLAUDE_CODE_PROMPT.md` — detailed implementation brief for Claude Code.

## Important limitations
The source character is one flattened image. It does not contain independent eyes, eyelids, eyebrows, mouth interior, jaw, teeth, tongue, or hidden pixels behind facial parts. Those assets cannot be recovered perfectly by cropping alone. The reference expression sheet is illustrative and should not be auto-sliced into final rig assets without cleanup.

## Recommended scope
Build a head-and-shoulders talking avatar first, not a full-body rig. Keep the hoodie shoulders in frame. Prioritize facial animation and subtle head motion. Do not redraw or alter the Plexus logo unless asked.

## Deliverable expectation
A production-ready rig requires manually cleaned/separated artwork and reconstructed hidden areas. Do not claim a Spine project exists until the `.spine` file has actually been authored and tested.
