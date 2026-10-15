/**
 * Structural validation of spine/Plexi_skeleton.json against the Spine JSON format rules and the
 * artwork on disk. Exits non-zero on any error.
 *
 *   node scripts/validate_skeleton.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "spine", "Plexi_skeleton.json");
const sk = JSON.parse(await fs.readFile(file, "utf8"));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

// skeleton header
if (!/^4\.\d+(\.\d+)?/.test(sk.skeleton?.spine ?? "")) err(`skeleton.spine must be a 4.x version, got ${sk.skeleton?.spine}`);
if (typeof sk.skeleton?.images !== "string") err("skeleton.images missing");

// bones
const boneNames = new Set();
for (const [i, b] of sk.bones.entries()) {
  if (!b.name) err(`bone #${i} has no name`);
  if (boneNames.has(b.name)) err(`duplicate bone ${b.name}`);
  if (i === 0 && b.parent) err("first bone must be the root (no parent)");
  if (i > 0 && !b.parent) err(`bone ${b.name} has no parent`);
  if (b.parent && !boneNames.has(b.parent)) err(`bone ${b.name}: parent ${b.parent} must be defined before it`);
  boneNames.add(b.name);
}

// slots + draw order
const slotNames = new Set();
const slotIndex = {};
for (const [i, s] of sk.slots.entries()) {
  if (slotNames.has(s.name)) err(`duplicate slot ${s.name}`);
  if (!boneNames.has(s.bone)) err(`slot ${s.name}: unknown bone ${s.bone}`);
  slotNames.add(s.name);
  slotIndex[s.name] = i;
}

// skins / attachments
const imagesDir = path.resolve(path.dirname(file), sk.skeleton.images);
const attachmentsBySlot = {};
let regionCount = 0, clipCount = 0;
for (const skin of sk.skins) {
  for (const [slot, atts] of Object.entries(skin.attachments)) {
    if (!slotNames.has(slot)) err(`skin ${skin.name}: attachment slot ${slot} does not exist`);
    attachmentsBySlot[slot] ??= new Set();
    for (const [name, a] of Object.entries(atts)) {
      attachmentsBySlot[slot].add(name);
      const type = a.type ?? "region";
      if (type === "region") {
        regionCount++;
        const p = path.join(imagesDir, (a.path ?? name) + ".png");
        try {
          const meta = await sharp(p).metadata();
          if (meta.width !== a.width || meta.height !== a.height) err(`${slot}/${name}: size ${a.width}x${a.height} in data but image is ${meta.width}x${meta.height}`);
          if (!meta.hasAlpha) warn(`${slot}/${name}: image has no alpha channel`);
        } catch {
          err(`${slot}/${name}: image not found at ${p}`);
        }
        for (const k of ["x", "y", "width", "height"]) if (typeof a[k] !== "number") err(`${slot}/${name}: ${k} missing`);
      } else if (type === "clipping") {
        clipCount++;
        if (!slotNames.has(a.end)) err(`${slot}/${name}: clipping end slot ${a.end} missing`);
        else if (slotIndex[a.end] <= slotIndex[slot]) err(`${slot}/${name}: clipping end slot must come after the clipping slot in draw order`);
        if (!Array.isArray(a.vertices) || a.vertices.length !== a.vertexCount * 2) err(`${slot}/${name}: vertices/vertexCount mismatch`);
        if (a.vertexCount < 3) err(`${slot}/${name}: polygon needs >= 3 vertices`);
      } else err(`${slot}/${name}: unsupported attachment type ${type} for this validator`);
    }
  }
}
for (const s of sk.slots) if (s.attachment && !attachmentsBySlot[s.name]?.has(s.attachment)) err(`slot ${s.name}: default attachment ${s.attachment} not in skin`);

// animations
const animNames = Object.keys(sk.animations ?? {});
for (const [name, anim] of Object.entries(sk.animations ?? {})) {
  for (const [bone, tls] of Object.entries(anim.bones ?? {})) {
    if (!boneNames.has(bone)) err(`animation ${name}: unknown bone ${bone}`);
    for (const [tl, keys] of Object.entries(tls)) {
      if (!["rotate", "translate", "scale", "shear", "translatex", "translatey", "scalex", "scaley"].includes(tl)) err(`animation ${name}/${bone}: unknown timeline ${tl}`);
      let last = -1;
      for (const k of keys) {
        const t = k.time ?? 0;
        if (t < last) err(`animation ${name}/${bone}/${tl}: keys out of order at ${t}`);
        last = t;
        if (tl === "rotate" && typeof k.value !== "number" && k.value !== undefined) err(`animation ${name}/${bone}/rotate: value must be a number`);
        if (Array.isArray(k.curve)) {
          const need = tl === "rotate" ? 4 : 8;
          if (k.curve.length !== need) err(`animation ${name}/${bone}/${tl}: bezier curve needs ${need} numbers at t=${t}`);
        }
      }
    }
  }
  for (const [slot, tls] of Object.entries(anim.slots ?? {})) {
    if (!slotNames.has(slot)) err(`animation ${name}: unknown slot ${slot}`);
    for (const k of tls.attachment ?? []) if (k.name !== null && !attachmentsBySlot[slot]?.has(k.name)) err(`animation ${name}/${slot}: attachment ${k.name} not in skin`);
  }
}
const required = ["idle", "blink", "talking", "listening", "happy", "surprised", "concerned", "thinking"];
for (const r of required) if (!animNames.includes(r)) err(`required animation ${r} missing`);
const visemeMap = JSON.parse(await fs.readFile(path.join(ROOT, "spine", "viseme_map.json"), "utf8"));
for (const [g, att] of Object.entries(visemeMap.groups)) {
  if (!attachmentsBySlot[visemeMap.slot]?.has(att)) err(`viseme ${g}: attachment ${att} missing in slot ${visemeMap.slot}`);
  if (!animNames.includes(`visemes/${g}`)) err(`viseme ${g}: animation visemes/${g} missing`);
}

console.log(`bones ${sk.bones.length}, slots ${sk.slots.length}, region attachments ${regionCount}, clipping ${clipCount}, animations ${animNames.length}`);
for (const w of warnings) console.log("warn:", w);
for (const e of errors) console.log("ERROR:", e);
console.log(errors.length ? `FAILED with ${errors.length} error(s)` : "OK - structure valid, all images present with matching sizes");
process.exit(errors.length ? 1 : 0);
