/**
 * Minimal Spine-JSON compositor for QA: poses the skeleton (setup pose or an animation at time t),
 * applies region + clipping attachments and renders PNG frames, then a labelled contact sheet.
 *
 *   node scripts/render_preview.mjs            -> qa/preview/*.png + qa/preview_sheet.png
 *
 * Supports: bone rotate/translate/scale (linear or bezier-approximated-as-linear-in-time sampling
 * with Spine's bezier curve handling simplified to smoothstep), stepped attachment timelines,
 * region attachments, clipping attachments (polygon, bone-local). Good enough to check alignment,
 * blink closure, pupil containment and mouth placement - it is not a Spine runtime.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Img, rasterSVG } from "./lib/raster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skFile = path.join(ROOT, "spine", "Plexi_skeleton.json");
const sk = JSON.parse(await fs.readFile(skFile, "utf8"));
const imagesDir = path.resolve(path.dirname(skFile), sk.skeleton.images);
const W = sk.skeleton.width, H = sk.skeleton.height;
const OUT = path.join(ROOT, "qa", "preview");
await fs.mkdir(OUT, { recursive: true });

// cache attachment images
const imgCache = new Map();
async function loadImg(p) {
  if (!imgCache.has(p)) imgCache.set(p, await Img.load(path.join(imagesDir, p + ".png")));
  return imgCache.get(p);
}

const deg = Math.PI / 180;
const smoothstep = (t) => t * t * (3 - 2 * t);

/** Sample a timeline at time t. Returns the interpolated key fields (value | x,y) or null. */
function sample(keys, t, fields) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].time) return pick(keys[0], fields);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].time) {
      const a = keys[i - 1], b = keys[i];
      if (a.curve === "stepped") return pick(a, fields);
      let u = (t - a.time) / Math.max(1e-6, b.time - a.time);
      if (Array.isArray(a.curve)) u = smoothstep(u);
      const out = {};
      for (const f of fields) out[f] = (a[f] ?? 0) + ((b[f] ?? 0) - (a[f] ?? 0)) * u;
      return out;
    }
  }
  return pick(keys[keys.length - 1], fields);
}
const pick = (k, fields) => Object.fromEntries(fields.map((f) => [f, k[f] ?? 0]));

/** Compute world transforms for all bones at (animation, time). */
function poseBones(animName, t, overrides = {}) {
  const anim = animName ? sk.animations[animName] : null;
  const world = {};
  for (const b of sk.bones) {
    const local = { x: b.x ?? 0, y: b.y ?? 0, rotation: b.rotation ?? 0, scaleX: b.scaleX ?? 1, scaleY: b.scaleY ?? 1 };
    const tl = anim?.bones?.[b.name];
    if (tl) {
      const r = sample(tl.rotate, t, ["value"]);
      if (r) local.rotation += r.value;
      const tr = sample(tl.translate, t, ["x", "y"]);
      if (tr) { local.x += tr.x; local.y += tr.y; }
      const s = sample(tl.scale, t, ["x", "y"]);
      if (s) { local.scaleX *= s.x || 1; local.scaleY *= s.y || 1; }
    }
    const o = overrides[b.name];
    if (o) { local.rotation += o.rotation ?? 0; local.x += o.x ?? 0; local.y += o.y ?? 0; }
    const p = b.parent ? world[b.parent] : { a: 1, b: 0, c: 0, d: 1, wx: 0, wy: 0 };
    const cos = Math.cos(local.rotation * deg), sin = Math.sin(local.rotation * deg);
    const la = cos * local.scaleX, lb = -sin * local.scaleY, lc = sin * local.scaleX, ld = cos * local.scaleY;
    world[b.name] = {
      a: p.a * la + p.b * lc, b: p.a * lb + p.b * ld, c: p.c * la + p.d * lc, d: p.c * lb + p.d * ld,
      wx: p.a * local.x + p.b * local.y + p.wx, wy: p.c * local.x + p.d * local.y + p.wy,
    };
  }
  return world;
}

/** Current attachment name per slot at (animation, time). */
function poseSlots(animName, t) {
  const anim = animName ? sk.animations[animName] : null;
  const out = {};
  for (const s of sk.slots) {
    let name = s.attachment ?? null;
    const keys = anim?.slots?.[s.name]?.attachment;
    if (keys) for (const k of keys) if (k.time <= t + 1e-6) name = k.name;
    out[s.name] = name;
  }
  return out;
}

const toCanvas = (x, y) => [x + W / 2, H - y];

/** Draw a region attachment with bone world transform `m` into canvas `dst` (optionally masked). */
function drawRegion(dst, img, a, m, mask) {
  // attachment local -> bone -> world; attachment rotation/scale currently unused (always 0 / 1 here)
  const ax = a.x, ay = a.y, sX = a.scaleX ?? 1, sY = a.scaleY ?? 1, hw = (a.width * sX) / 2, hh = (a.height * sY) / 2;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => {
    const bx = ax + lx, by = ay + ly;
    return toCanvas(m.a * bx + m.b * by + m.wx, m.c * bx + m.d * by + m.wy);
  });
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));
  // inverse of the 2x2 world matrix
  if (process.env.DEBUG_LID && (a.path ?? "").includes("eyelid_upper_L")) console.log("lid bbox", { x0, x1, y0, y1 }, "attach", a.x, a.y, "bone", m.wx.toFixed(1), m.wy.toFixed(1), "mask", mask ? "yes" : "no");
  const det = m.a * m.d - m.b * m.c;
  const ia = m.d / det, ib = -m.b / det, ic = -m.c / det, id = m.a / det;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      // canvas -> spine world -> bone local -> attachment image pixel
      const sx = x + 0.5 - W / 2, sy = H - (y + 0.5);
      const wx = sx - m.wx, wy = sy - m.wy;
      const bx = ia * wx + ib * wy, by = ic * wx + id * wy;
      const u = (bx - ax + hw) / sX, v = (hh - (by - ay)) / sY; // image coords (y down)
      if (u < 0 || v < 0 || u >= img.w - 1 || v >= img.h - 1) continue;
      // bilinear
      const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
      const px = [0, 0, 0, 0];
      for (const [du, dv, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
        const i = img.idx(u0 + du, v0 + dv);
        const a4 = img.data[i + 3] * wgt;
        px[0] += img.data[i] * a4; px[1] += img.data[i + 1] * a4; px[2] += img.data[i + 2] * a4; px[3] += a4;
      }
      if (px[3] <= 0.001) continue;
      let sa = px[3];
      const sr = px[0] / sa, sg = px[1] / sa, sb = px[2] / sa;
      if (mask) sa *= mask.data[y * W + x];
      if (sa <= 0) continue;
      const di = dst.idx(x, y);
      const da = dst.data[di + 3];
      const oa = sa + da * (1 - sa);
      dst.data[di] = (sr * sa + dst.data[di] * da * (1 - sa)) / oa;
      dst.data[di + 1] = (sg * sa + dst.data[di + 1] * da * (1 - sa)) / oa;
      dst.data[di + 2] = (sb * sa + dst.data[di + 2] * da * (1 - sa)) / oa;
      dst.data[di + 3] = oa;
    }
}

async function clipMask(a, m) {
  const pts = [];
  for (let i = 0; i < a.vertices.length; i += 2) {
    const bx = a.vertices[i], by = a.vertices[i + 1];
    pts.push(toCanvas(m.a * bx + m.b * by + m.wx, m.c * bx + m.d * by + m.wy));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="#fff"/></svg>`;
  const img = await rasterSVG(svg, W, H);
  const mask = { data: new Float32Array(W * H) };
  for (let i = 0; i < W * H; i++) mask.data[i] = img.data[i * 4 + 3];
  if (process.env.DEBUG_LID) { let y0 = H, y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask.data[y * W + x] > 0.5) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } console.log("clip mask y range", y0, y1, "pts y", pts.map((p) => p[1].toFixed(0)).join(",")); }
  return mask;
}

async function renderFrame(animName, t, overrides) {
  const world = poseBones(animName, t, overrides);
  const current = poseSlots(animName, t);
  const skin = sk.skins[0].attachments;
  const dst = new Img(W, H);
  let clip = null; // { mask, end }
  const only = process.env.ONLY_SLOTS ? new Set(process.env.ONLY_SLOTS.split(",")) : null;
  for (const s of sk.slots) {
    const name = current[s.name];
    if (clip && clip.endPassed) clip = null;
    if (only && !only.has(s.name)) { if (clip && s.name === clip.end) clip.endPassed = true; continue; }
    if (name) {
      const a = skin[s.name]?.[name];
      if (a) {
        if ((a.type ?? "region") === "clipping") {
          clip = process.env.NO_CLIP ? null : { mask: await clipMask(a, world[s.bone]), end: a.end, endPassed: false };
        } else {
          const img = await loadImg(a.path ?? name);
          drawRegion(dst, img, a, world[s.bone], clip?.mask);
        }
      }
    }
    if (clip && s.name === clip.end) clip.endPassed = true;
  }
  return dst;
}

// ---------------------------------------------------------------------------------------------
// Frames to render
// ---------------------------------------------------------------------------------------------
const frames = [
  { id: "setup", anim: null, t: 0 },
  { id: "blink_closed", anim: "blink", t: 0.1 },
  { id: "blink_half", anim: "blink", t: 0.05 },
  { id: "idle_2s", anim: "idle", t: 2.0 },
  { id: "listening_2s_gaze", anim: "listening", t: 2.0 },
  { id: "talking_0.15_A", anim: "talking", t: 0.15 },
  { id: "talking_0.5_O", anim: "talking", t: 0.5 },
  { id: "talking_0.9_FV", anim: "talking", t: 0.9 },
  { id: "happy", anim: "happy", t: 0 },
  { id: "surprised", anim: "surprised", t: 0 },
  { id: "concerned", anim: "concerned", t: 0 },
  { id: "thinking", anim: "thinking", t: 0 },
  { id: "tilt_+6", anim: null, t: 0, overrides: { head: { rotation: 6 } } },
  { id: "tilt_-6", anim: null, t: 0, overrides: { head: { rotation: -6 } } },
  { id: "gaze_far_right", anim: null, t: 0, overrides: { eye_L: { x: 22 }, eye_R: { x: 22 } } },
  { id: "gaze_far_left", anim: null, t: 0, overrides: { eye_L: { x: -22 }, eye_R: { x: -22 } } },
  { id: "hair_shift", anim: null, t: 0, overrides: { hair_front: { rotation: 2, y: 4 } } },
];
for (const v of ["REST", "MBP", "FV", "AI", "E", "O", "U", "L", "TH", "CH_SH", "OPEN"]) frames.push({ id: `viseme_${v}`, anim: `visemes/${v}`, t: 0 });

// FRAMES='[{"id":"x","anim":null,"t":0,"overrides":{...}}]' renders only those frames (debugging)
if (process.env.FRAMES) frames.splice(0, frames.length, ...JSON.parse(process.env.FRAMES));
const CROP = { left: 300, top: 0, width: 600, height: 760 }; // head & shoulders region of the canvas
const sheetCells = [];
let n = 0;
for (const f of frames) {
  const img = await renderFrame(f.anim, f.t, f.overrides);
  const file = path.join(OUT, `${f.id}.png`);
  await img.save(file);
  const cellW = 300, cellH = 380;
  const thumb = await sharp(file).extract(CROP).resize(cellW, cellH).png().toBuffer();
  const col = n % 7, row = Math.floor(n / 7);
  sheetCells.push({ input: thumb, left: col * cellW, top: row * (cellH + 20) });
  sheetCells.push({ input: Buffer.from(`<svg width="${cellW}" height="20"><rect width="${cellW}" height="20" fill="#222"/><text x="${cellW / 2}" y="14" font-family="Arial" font-size="12" fill="#fff" text-anchor="middle">${f.id}</text></svg>`), left: col * cellW, top: row * (cellH + 20) + cellH });
  n++;
  console.log(`rendered ${f.id}`);
}
const rows = Math.ceil(n / 7);
await sharp({ create: { width: 7 * 300, height: rows * 400, channels: 4, background: { r: 60, g: 60, b: 60, alpha: 1 } } }).composite(sheetCells).png().toFile(path.join(ROOT, "qa", "preview_sheet.png"));
console.log("qa/preview_sheet.png");
