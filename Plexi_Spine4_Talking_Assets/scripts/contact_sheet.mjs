/**
 * Debug contact sheet of every exported layer (on neutral grey) -> qa/layers_sheet.png
 *   node scripts/contact_sheet.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "artwork", "manifest.json"), "utf8"));
const CELL = 230, PAD = 8, COLS = 7;
const rows = Math.ceil(manifest.layers.length / COLS);
const composites = [];
let i = 0;
for (const lay of manifest.layers) {
  const img = sharp(path.join(ROOT, "artwork", lay.file));
  const meta = await img.metadata();
  const scale = Math.min((CELL - PAD * 2) / meta.width, (CELL - PAD * 2 - 18) / meta.height, 1.5);
  const w = Math.max(1, Math.round(meta.width * scale)), h = Math.max(1, Math.round(meta.height * scale));
  const buf = await img.resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
  const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
  composites.push({ input: buf, left: cx + Math.round((CELL - w) / 2), top: cy + PAD });
  const label = `<svg width="${CELL}" height="20"><text x="${CELL / 2}" y="14" font-family="Arial" font-size="12" fill="#fff" text-anchor="middle">${lay.id} ${meta.width}x${meta.height}</text></svg>`;
  composites.push({ input: Buffer.from(label), left: cx, top: cy + CELL - 20 });
  i++;
}
await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 110, g: 110, b: 110, alpha: 1 } } })
  .composite(composites)
  .png()
  .toFile(path.join(ROOT, "qa", "layers_sheet.png"));
console.log("qa/layers_sheet.png");
