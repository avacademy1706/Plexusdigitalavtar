/**
 * Prepares Plexi's Spine artwork from the single flattened reference PNG.
 *
 *   node scripts/prepare_artwork.mjs
 *
 * Output: artwork/<group>/<layer>.png (trimmed, straight alpha), artwork/manifest.json,
 * qa/composite_rest.png (all layers re-composited) and qa/masks/*.png (debug).
 *
 * Every layer's provenance is recorded in the manifest as one of:
 *   extracted   – real pixels of the original
 *   inpainted   – real pixels plus diffusion-filled hidden areas
 *   generated   – vector art built in the character's sampled colours (needs artist polish)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Img, Mask, clamp01, smooth, inBox, inPoly, curveY, meanColor, inpaint, over, masked, fill, rasterSVG, hex, mix, scaleColor, bleed } from "./lib/raster.mjs";
import * as L from "./landmarks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = path.join(ROOT, "artwork");
const QA = path.join(ROOT, "qa");
const S = L.SCALE;
const sc = (v) => v * S;
const scPt = ([x, y]) => [x * S, y * S];
const scBox = ([x0, y0, x1, y1]) => [x0 * S, y0 * S, (x1 + 1) * S - 1, (y1 + 1) * S - 1];

for (const d of ["head", "eyes", "brows", "mouth", "upper_body"]) await fs.mkdir(path.join(ART, d), { recursive: true });
await fs.mkdir(path.join(QA, "masks"), { recursive: true });

// ---------------------------------------------------------------------------------------------
// 1. Base canvas: crop + 4x Lanczos upscale
// ---------------------------------------------------------------------------------------------
const W = L.CROP.w * S, H = L.CROP.h * S;
const sourceMeta = await sharp(path.join(ROOT, L.SOURCE)).metadata();
// Resize with extra source rows below the crop, then trim them: Lanczos otherwise rings on the last rows and
// the bust / lower-body seam shows as a bright line.
const PAD = Math.min(8, sourceMeta.height - L.CROP.y - L.CROP.h);
const base = (
  await Img.fromSharp(
    sharp(path.join(ROOT, L.SOURCE))
      .extract({ left: L.CROP.x, top: L.CROP.y, width: L.CROP.w, height: L.CROP.h + PAD })
      .resize(W, (L.CROP.h + PAD) * S, { kernel: "lanczos3" }),
  )
).crop(0, 0, W, H);
// The source's white areas are only ~98 % opaque (background-removal artefact); over a dark stage that reads as
// a grey tint and makes separately cut layers mismatch. Treat anything >= 92 % as fully opaque.
const normaliseAlpha = (img) => { for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.min(1, img.data[i] / 0.92); return img; };
normaliseAlpha(base);
console.log(`canvas ${W}x${H} (scale ${S})`);
// Everything below the bust crop (same working scale, overlapping the bust by 12 px): static layer behind the hoodie so the figure has a body in-scene.
const LOWER = { top: L.CROP.y + L.CROP.h - 12, scale: S };
const lowerBody = (
  await Img.fromSharp(
    sharp(path.join(ROOT, L.SOURCE))
      .extract({ left: 0, top: LOWER.top - PAD, width: sourceMeta.width, height: sourceMeta.height - LOWER.top + PAD })
      .resize(Math.round(sourceMeta.width * LOWER.scale), Math.round((sourceMeta.height - LOWER.top + PAD) * LOWER.scale), { kernel: "lanczos3" }),
  )
).crop(0, PAD * LOWER.scale, Math.round(sourceMeta.width * LOWER.scale), Math.round((sourceMeta.height - LOWER.top) * LOWER.scale));
normaliseAlpha(lowerBody);

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const alphaM = Mask.from(base, (r, g, b, a) => a);
const whiteM = Mask.from(base, (r, g, b, a) => a * smooth(Math.min(r, g, b), 0.72, 0.82) * smooth(0.2 - (Math.max(r, g, b) - Math.min(r, g, b)), 0, 0.08));
const orangeM = Mask.from(base, (r, g, b, a) => a * smooth(r, 0.75, 0.85) * smooth(g, 0.25, 0.4) * smooth(0.72 - g, 0, 0.1) * smooth(0.35 - b, 0, 0.12));
const darkM = Mask.from(base, (r, g, b, a) => a * smooth(0.5 - lum(r, g, b), 0, 0.12));

const eyeBoxes = Object.values(L.EYES).map((e) => scBox(e.box));
const browBoxes = Object.values(L.BROWS).map((b) => scBox(b.box));
const mouthBox = scBox(L.MOUTH.box);
const noseBox = scBox(L.NOSE_BOX);
const jaw = L.JAW.map(scPt);
const jawY = (x) => curveY(jaw, x);
const jawX0 = jaw[0][0], jawX1 = jaw[jaw.length - 1][0];
const neckPoly = L.NECK_POLY.map(scPt);

// ---------------------------------------------------------------------------------------------
// 2. Hair
// ---------------------------------------------------------------------------------------------
const hairZone = Mask.fromFn(W, H, (x, y) => {
  if (y >= sc(L.HAIR_MAX_Y)) return 0;
  for (const b of eyeBoxes) if (inBox(x, y, b)) return 0;
  if (inBox(x, y, mouthBox) || inBox(x, y, noseBox)) return 0;
  if (inBox(x, y, browBoxes[0]) && x >= sc(L.BROWS.L.hairLimitX)) return 0;
  if (inBox(x, y, browBoxes[1]) && x <= sc(L.BROWS.R.hairLimitX)) return 0;
  return 1;
});
const hairness = Mask.from(base, (r, g, b, a) => a * smooth(0.4 - lum(r, g, b), 0, 0.12) * smooth(0.22 - (r - b), 0, 0.08)).mul(hairZone);
const hairHard = hairness.threshold(0.5).removeSpecks(80);
// solid inside the hair mass (lighter strands must not let the reconstructed skin show through), soft only at the outer edge
const hairSoft = hairness.max(hairHard.erode(2)).mul(hairHard.dilate(3)).mul(alphaM);
await hairSoft.save(path.join(QA, "masks", "hair.png"));
const hairColor = meanColor(base, hairHard);

// ---------------------------------------------------------------------------------------------
// 3. Head / neck / hoodie zones
// ---------------------------------------------------------------------------------------------
// Head = every drawn pixel above the hood line, except the neck polygon below the jaw curve (soft split).
// The jaw split is applied only inside the neck polygon so the ears and sideburns are never clipped.
const headZone = Mask.fromFn(W, H, (x, y) => {
  if (alphaM.data[y * W + x] < 0.02) return 0;
  if (inPoly(x, y, neckPoly)) return smooth(jawY(x) - y, -S, S);
  return y < sc(L.TORSO_TOP_Y) ? 1 : 0;
});
const neckZone = Mask.fromFn(W, H, (x, y) => (inPoly(x, y, neckPoly) ? 1 - smooth(jawY(x) - y, -S, S) : 0)).mul(alphaM).mul(whiteM.invert());
const hoodieZone = alphaM.mul(headZone.invert()).mul(neckZone.invert()).mul(hairHard.dilate(1).invert()).mul(Mask.fromFn(W, H, (x, y) => (y >= sc(L.TORSO_TOP_Y) ? 1 : 0)));

// ---------------------------------------------------------------------------------------------
// 4. Brows
// ---------------------------------------------------------------------------------------------
const brows = {};
for (const side of ["L", "R"]) {
  const spec = L.BROWS[side];
  const box = scBox(spec.box);
  const zone = Mask.fromFn(W, H, (x, y) => {
    if (!inBox(x, y, box)) return 0;
    if (side === "L" && x < sc(spec.hairLimitX)) return 0;
    if (side === "R" && x > sc(spec.hairLimitX)) return 0;
    return 1;
  });
  const ness = Mask.from(base, (r, g, b, a) => a * smooth(0.42 - lum(r, g, b), 0, 0.14)).mul(zone);
  const hard = ness.threshold(0.5).removeSpecks(120).largestComponent();
  const soft = ness.mul(hard.dilate(3));
  brows[side] = { soft, hard };
  await soft.save(path.join(QA, "masks", `brow_${side}.png`));
}

// ---------------------------------------------------------------------------------------------
// 5. Eyes
// ---------------------------------------------------------------------------------------------
const eyes = {};
const SCLERA = (() => {
  let best = [0.9, 0.9, 0.9], bestL = 0;
  for (const side of ["L", "R"]) {
    const [cx, cy] = scPt(L.EYES[side].center);
    const m = Mask.from(base, (r, g, b, a, x, y) => (Math.hypot(x - cx, y - cy) <= sc(13) && Math.min(r, g, b) > 0.7 ? 1 : 0));
    if (m.sum() < 10) continue;
    const c = meanColor(base, m);
    if (lum(...c) > bestL) { bestL = lum(...c); best = c; }
  }
  return mix(best, [1, 1, 1], 0.3);
})();
for (const side of ["L", "R"]) {
  const spec = L.EYES[side];
  const [cx, cy] = scPt(spec.center);
  const [rx, ry] = [sc(spec.search[0]), sc(spec.search[1])];
  const inSearch = Mask.fromFn(W, H, (x, y) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? 1 : 0));
  // the opening = anything that is not skin inside the search ellipse (sclera, iris, lash outline)
  const irisR = sc(spec.irisR);
  const nonSkin = Mask.from(base, (r, g, b, a, x, y) => {
    const sclera = smooth(Math.min(r, g, b), 0.58, 0.7);
    const dark = smooth(0.3 - lum(r, g, b), 0, 0.08);
    const iris = Math.hypot(x - cx, y - cy) <= irisR ? 1 : 0;
    return a * Math.max(sclera, dark, iris);
  }).mul(inSearch);
  const openHard = nonSkin.threshold(0.5).dilate(3).erode(3).largestComponent([Math.round(cx), Math.round(cy)]);
  const openInner = openHard.erode(S * 0.45); // just inside the dark lash outline (keeps the light lower rim inside the opening)
  // Fit a smooth almond to the detected opening: corners + top/bottom apexes, power-curve arcs.
  const raw = openInner.contour(cx, cy, 48, 400, 1);
  const leftPt = raw.reduce((a, p) => (p[0] < a[0] ? p : a)), rightPt = raw.reduce((a, p) => (p[0] > a[0] ? p : a));
  const halfW = (rightPt[0] - leftPt[0]) / 2;
  const topRaw = raw.reduce((a, p) => (p[1] < a[1] ? p : a)), botRaw = raw.reduce((a, p) => (p[1] > a[1] ? p : a));
  const topPt = [Math.max(cx - halfW * 0.3, Math.min(cx + halfW * 0.3, topRaw[0])), topRaw[1]];
  const botPt = [Math.max(cx - halfW * 0.3, Math.min(cx + halfW * 0.3, botRaw[0])), botRaw[1]];
  const arcY = (x, apex, p) => {
    const side = x < apex[0] ? leftPt : rightPt;
    const t = Math.min(1, Math.abs(x - apex[0]) / Math.max(1, Math.abs(side[0] - apex[0])));
    return apex[1] + (side[1] - apex[1]) * Math.pow(t, p);
  };
  const N = 26;
  const upperArc = Array.from({ length: N + 1 }, (_, i) => { const x = leftPt[0] + ((rightPt[0] - leftPt[0]) * i) / N; return [x, arcY(x, topPt, 1.9)]; });
  const lowerArc = Array.from({ length: N + 1 }, (_, i) => { const x = leftPt[0] + ((rightPt[0] - leftPt[0]) * i) / N; return [x, arcY(x, botPt, 1.6)]; });
  const clipPoly = [...upperArc, ...[...lowerArc].reverse().slice(1, -1)];
  const openTop = topPt[1];
  const openBottom = botPt[1];
  const openHeight = openBottom - openTop;

  // iris / pupil / highlight
  const irisDisc = Mask.fromFn(W, H, (x, y) => smooth(irisR - Math.hypot(x - cx, y - cy), -1.5, 1.5));
  const irisDiscHard = irisDisc.threshold(0.5);
  const pupilR = sc(spec.pupilR);
  const highlight = Mask.from(base, (r, g, b, a, x, y) => (lum(r, g, b) > 0.6 && Math.hypot(x - cx, y - cy) <= irisR * 0.62 ? 1 : 0)).removeSpecks(6);
  let pupilHard = Mask.from(base, (r, g, b, a, x, y) => (Math.hypot(x - cx, y - cy) <= pupilR + S * 1.2 && lum(r, g, b) < 0.3 ? 1 : 0)).max(highlight).dilate(2).erode(2).largestComponent([Math.round(cx), Math.round(cy)]);
  if (pupilHard.sum() < 40) pupilHard = Mask.fromFn(W, H, (x, y) => (Math.hypot(x - cx, y - cy) <= pupilR ? 1 : 0)); // fallback: synthetic disc
  const irisKnown = irisDiscHard.mul(openHard.erode(S * 1.5)).mul(pupilHard.dilate(1).invert()).mul(highlight.dilate(2).invert());
  const irisImg = masked(base, irisKnown);
  inpaint(irisImg, irisDiscHard.sub(irisKnown), 160);
  const iris = masked(irisImg, irisDisc);
  const pupil = masked(base, pupilHard.feather(1.5).max(highlight.feather(1)).mul(irisDisc));

  // sclera fill + lid shadow (generated)
  const scleraMask = openHard.mul(irisDiscHard.invert()).mul(Mask.from(base, (r, g, b) => (lum(r, g, b) > 0.7 ? 1 : 0)));
  const scleraColor = SCLERA;
  const polyStr = clipPoly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const whiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><clipPath id="c"><polygon points="${polyStr}"/></clipPath>
  <linearGradient id="g" x1="0" y1="${openTop}" x2="0" y2="${openTop + openHeight * 0.45}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
  <g clip-path="url(#c)"><polygon points="${polyStr}" fill="${hex(scleraColor)}"/>
  <rect x="0" y="${openTop}" width="${W}" height="${openHeight}" fill="url(#g)"/></g></svg>`;
  const white = await rasterSVG(whiteSvg, W, H);

  // eyelids (generated): skin block whose edge follows the opening contour, with a lash line
  const skinAbove = Mask.fromFn(W, H, (x, y) => (Math.abs(x - cx) < rx * 0.6 && y > openTop - sc(10) && y < openTop - sc(5) ? 1 : 0)).mul(hairSoft.invert()).mul(brows[side].hard.dilate(2).invert());
  const skinBelow = Mask.fromFn(W, H, (x, y) => (Math.abs(x - cx) < rx * 0.6 && y > openBottom + sc(2) && y < openBottom + sc(6) ? 1 : 0));
  const lidColorU = meanColor(base, skinAbove);
  const lidColorL = meanColor(base, skinBelow);
  const outlineMask = openHard.sub(openInner);
  const lashColor = meanColor(base, outlineMask.mul(darkM));
  const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const lidH = openHeight + sc(6);
  const ext = sc(2);
  // tapered lash: thick at the centre, thin at the corners
  const lashPoly = (arc, tc, te) => {
    const th = (i) => { const t = Math.abs(i / N - 0.5) * 2; return te + (tc - te) * (1 - t * t); };
    const top = arc.map(([x, y], i) => [x, y - th(i) / 2]);
    const bot = arc.map(([x, y], i) => [x, y + th(i) / 2]).reverse();
    return [...top, ...bot].map(pt).join(" ");
  };
  const upperSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="lg" x1="0" y1="${openTop - lidH}" x2="0" y2="${openBottom}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${hex(lidColorU)}"/><stop offset="1" stop-color="${hex(mix(lidColorU, lidColorL, 0.75))}"/></linearGradient></defs>
  <polygon points="${pt([leftPt[0] - ext, openTop - lidH])} ${pt([rightPt[0] + ext, openTop - lidH])} ${pt([rightPt[0] + ext, rightPt[1]])} ${[...upperArc].reverse().map(pt).join(" ")} ${pt([leftPt[0] - ext, leftPt[1]])}" fill="url(#lg)"/>
  <polygon points="${lashPoly(upperArc.map(([x, y]) => [x, y - sc(2.4)]), sc(0.7), sc(0.2))}" fill="${hex(scaleColor(lidColorU, 0.8))}" opacity="0.5"/>
  <polygon points="${lashPoly(upperArc, sc(1.3), sc(0.5))}" fill="${hex(lashColor)}"/></svg>`;
  const lowerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <polygon points="${pt([leftPt[0] - ext, openBottom + lidH])} ${pt([rightPt[0] + ext, openBottom + lidH])} ${pt([rightPt[0] + ext, rightPt[1]])} ${[...lowerArc].reverse().map(pt).join(" ")} ${pt([leftPt[0] - ext, leftPt[1]])}" fill="${hex(lidColorL)}"/>
  <polygon points="${lashPoly(lowerArc, sc(0.7), sc(0.3))}" fill="${hex(mix(lashColor, lidColorL, 0.3))}"/></svg>`;
  const lidUpper = await rasterSVG(upperSvg, W, H);
  const lidLower = await rasterSVG(lowerSvg, W, H);

  eyes[side] = { cx, cy, openHard, openInner, clipPoly, openTop, openBottom, openHeight, iris, pupil, white, lidUpper, lidLower, irisR, scleraColor };
  await openHard.save(path.join(QA, "masks", `eye_open_${side}.png`));
  console.log(`eye ${side}: opening ${(openHeight / S).toFixed(1)}px(1x) tall, sclera ${hex(scleraColor)}, lash ${hex(lashColor)}`);
}

// ---------------------------------------------------------------------------------------------
// 6. Head base (face + ears + reconstructed skin)
// ---------------------------------------------------------------------------------------------
const headAlpha = headZone.mul(hairSoft.invert());
const headImg = masked(base, headAlpha);
const skinOnHead = headZone.mul(hairSoft.map((v) => (v < 0.3 ? 1 : 0)));
const distToSkin = skinOnHead.distanceFrom();
const hairlineBand = Mask.fromFn(W, H, (x, y) => (hairSoft.data[y * W + x] > 0.04 && distToSkin.data[y * W + x] <= sc(9) && y < sc(L.HAIR_MAX_Y) && x > sc(118) && x < sc(228) ? 1 : 0));
const mouthInner = Mask.fromFn(W, H, (x, y) => (inBox(x, y, [mouthBox[0] + sc(1.5), mouthBox[1] + sc(1.5), mouthBox[2] - sc(1.5), mouthBox[3] - sc(1.5)]) ? 1 : 0));
let headUnknown = hairlineBand.max(mouthInner);
for (const side of ["L", "R"]) headUnknown = headUnknown.max(brows[side].hard.dilate(S * 1.2)).max(eyes[side].openInner.dilate(1));
headUnknown = headUnknown.mul(headZone.threshold(0.5).max(hairlineBand));
await headUnknown.save(path.join(QA, "masks", "head_inpaint.png"));
inpaint(headImg, headUnknown, 220);
// restore a soft edge where the inpainted hairline band meets transparent canvas
const headBase = masked(headImg, headZone.max(hairlineBand).blur(1, 1));
const skinTone = meanColor(base, Mask.fromFn(W, H, (x, y) => (inBox(x, y, scBox(L.PALETTE_SAMPLES.skinCheek)) ? 1 : 0)));

// ---------------------------------------------------------------------------------------------
// 7. Mouth: extracted smile + generated visemes
// ---------------------------------------------------------------------------------------------
const mouthFoot = Mask.fromFn(W, H, (x, y) => (inBox(x, y, mouthBox) ? 1 : 0)).erode(sc(1)).feather(sc(1.2));
const mouthSmile = masked(base, mouthFoot);
const [mcx, mcy] = scPt(L.MOUTH.center);
const mouthDark = Mask.from(base, (r, g, b, a, x, y) => (inBox(x, y, mouthBox) && lum(r, g, b) < 0.38 ? 1 : 0));
const lipLineColor = mouthDark.sum() > 5 ? meanColor(base, mouthDark) : [0.4, 0.15, 0.1];
const teethMask = Mask.from(base, (r, g, b, a, x, y) => (inBox(x, y, mouthBox) && Math.min(r, g, b) > 0.75 ? 1 : 0));
const teethColor = teethMask.sum() > 5 ? mix(meanColor(base, teethMask), [1, 1, 1], 0.2) : [0.94, 0.92, 0.9];
const skinMouth = meanColor(base, Mask.fromFn(W, H, (x, y) => (inBox(x, y, [mouthBox[0], mouthBox[3] + sc(1), mouthBox[2], mouthBox[3] + sc(4)]) ? 1 : 0)));
const COL = {
  lipLine: hex(scaleColor(lipLineColor, 0.9)),
  lowerLip: hex(mix(skinMouth, [0.75, 0.33, 0.28], 0.3)),
  lipShadow: hex(scaleColor(skinMouth, 0.72)),
  interior: "#3c110c",
  interiorDeep: "#260805",
  teeth: hex(teethColor),
  teethShade: hex(scaleColor(teethColor, 0.82)),
  tongue: "#c9575a",
  tongueDark: "#a8393f",
};

/**
 * Viseme definitions (original px): w = corner-to-corner width, h = opening height at the centre,
 * lift = how far the corners sit above the centre (smile), thick = lower-lip thickness,
 * tUp/tLow = visible teeth band heights, tongue = none|low|up|between, round = corner pull-in.
 */
const VISEMES = {
  rest:   { w: 44, h: 0,  lift: 1.2, thick: 3.2, tUp: 0,   tLow: 0,   tongue: "none" },
  MBP:    { w: 40, h: 0,  lift: 0.2, thick: 2.8, tUp: 0,   tLow: 0,   tongue: "none", pressed: true },
  FV:     { w: 42, h: 3,  lift: 0.6, thick: 3.6, tUp: 3,   tLow: 0,   tongue: "none" },
  A:      { w: 44, h: 13, lift: 0.5, thick: 3.4, tUp: 3.2, tLow: 0,   tongue: "low" },
  E:      { w: 48, h: 7,  lift: 1.5, thick: 3,   tUp: 3,   tLow: 1.6, tongue: "none" },
  I:      { w: 50, h: 4.5,lift: 2,   thick: 2.8, tUp: 3,   tLow: 0,   tongue: "none" },
  O:      { w: 28, h: 12, lift: -0.5,thick: 3.2,   tUp: 1.6, tLow: 0,   tongue: "low", round: 1 },
  U:      { w: 22, h: 7,  lift: -0.6,thick: 3.4, tUp: 0.8, tLow: 0,   tongue: "none", round: 1 },
  L:      { w: 42, h: 10, lift: 0.6, thick: 3.2, tUp: 2.6, tLow: 0,   tongue: "up" },
  TH:     { w: 42, h: 6,  lift: 0.6, thick: 3.2, tUp: 2.4, tLow: 0,   tongue: "between" },
  CH_SH:  { w: 34, h: 7,  lift: 0,   thick: 3.8, tUp: 2.6, tLow: 2,   tongue: "none", round: 0.5 },
  open:   { w: 46, h: 18, lift: 0.3, thick: 3.6, tUp: 3.4, tLow: 0,   tongue: "low" },
};

function mouthSvg(v, parts = { lips: true, interior: true, teethUp: true, teethLow: true, tongue: true }) {
  const w = sc(v.w), h = sc(v.h), lift = sc(v.lift), thick = sc(v.thick), tUp = sc(v.tUp), tLow = sc(v.tLow);
  const round = v.round ?? 0;
  const X = (x) => (mcx + x).toFixed(1), Y = (y) => (mcy + y).toFixed(1);
  const lx = -w / 2, rx = w / 2, cy0 = -lift; // corner y
  const cxl = -w / 6, cxr = w / 6;
  const ctl = lift / 3; // control y giving mid-point y = 0 for the upper line
  // bezier from left corner to right corner with control depth d (mid-point y = d)
  const curve = (d) => `M${X(lx)},${Y(cy0)} C${X(cxl)},${Y(ctl + d * 4 / 3)} ${X(cxr)},${Y(ctl + d * 4 / 3)} ${X(rx)},${Y(cy0)}`;
  const curveRev = (d) => `L${X(rx)},${Y(cy0)} C${X(cxr)},${Y(ctl + d * 4 / 3)} ${X(cxl)},${Y(ctl + d * 4 / 3)} ${X(lx)},${Y(cy0)}`;
  const region = (dTop, dBot) => `${curve(dTop)} ${curveRev(dBot).replace(/^L[^ ]+ /, "")} Z`; // area between two curves
  const upperOuter = -sc(1.4) * (1 + round * 0.6);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="in"><path d="${region(0, h)}"/></clipPath></defs>`;
  if (parts.lips) {
    // soft upper-lip body and lower-lip body
    out += `<path d="${region(upperOuter, 0)}" fill="${COL.lipShadow}" opacity="${0.35 + round * 0.3}"/>`;
    out += `<path d="${region(h, h + thick)}" fill="${COL.lowerLip}" opacity="0.9"/>`;
    out += `<path d="${region(h + thick * 0.7, h + thick + sc(1.2))}" fill="${COL.lipShadow}" opacity="0.5"/>`;
  }
  if (parts.interior && h > 0) {
    out += `<path d="${region(0, h)}" fill="${COL.interior}"/>`;
    out += `<path d="${region(h * 0.45, h)}" fill="${COL.interiorDeep}" opacity="0.8"/>`;
  }
  if (parts.tongue && h > 0 && v.tongue === "low") {
    out += `<g clip-path="url(#in)"><ellipse cx="${X(0)}" cy="${Y(h * 0.85)}" rx="${(w * 0.3).toFixed(1)}" ry="${(h * 0.42).toFixed(1)}" fill="${COL.tongue}"/><ellipse cx="${X(0)}" cy="${Y(h * 0.95)}" rx="${(w * 0.22).toFixed(1)}" ry="${(h * 0.25).toFixed(1)}" fill="${COL.tongueDark}" opacity="0.5"/></g>`;
  }
  if (parts.teethUp && h > 0 && tUp > 0) {
    out += `<g clip-path="url(#in)"><path d="${region(-sc(1), Math.min(h, tUp))}" fill="${COL.teeth}"/><path d="${region(Math.min(h, tUp) - sc(0.8), Math.min(h, tUp))}" fill="${COL.teethShade}" opacity="0.6"/></g>`;
  }
  if (parts.teethLow && h > 0 && tLow > 0) {
    out += `<g clip-path="url(#in)"><path d="${region(h - tLow, h + sc(1))}" fill="${COL.teethShade}"/></g>`;
  }
  if (parts.tongue && h > 0 && v.tongue === "up") {
    out += `<g clip-path="url(#in)"><ellipse cx="${X(0)}" cy="${Y(h * 0.55)}" rx="${(w * 0.17).toFixed(1)}" ry="${(h * 0.55).toFixed(1)}" fill="${COL.tongue}"/></g>`;
  }
  if (parts.tongue && h > 0 && v.tongue === "between") {
    out += `<ellipse cx="${X(0)}" cy="${Y(h * 0.35)}" rx="${(w * 0.19).toFixed(1)}" ry="${(h * 0.42).toFixed(1)}" fill="${COL.tongue}"/>`;
  }
  if (parts.lips) {
    const lw = h > 0 ? sc(0.8) : sc(v.pressed ? 1.4 : 1.1);
    out += `<path d="${curve(0)}" fill="none" stroke="${COL.lipLine}" stroke-width="${lw}" stroke-linecap="round"/>`;
    if (h > 0) out += `<path d="${curve(h)}" fill="none" stroke="${COL.lipLine}" stroke-width="${sc(0.6)}" stroke-linecap="round" opacity="0.8"/>`;
    // corner dimples
    for (const x of [lx, rx]) out += `<circle cx="${X(x)}" cy="${Y(cy0)}" r="${sc(0.9)}" fill="${COL.lipLine}" opacity="0.45"/>`;
  }
  return out + "</svg>";
}

const mouthLayers = { smile: mouthSmile };
for (const [name, v] of Object.entries(VISEMES)) mouthLayers[name] = await rasterSVG(mouthSvg(v), W, H);
const openV = VISEMES.open;
mouthLayers.interior = await rasterSVG(mouthSvg(openV, { interior: true }), W, H);
mouthLayers.teeth_upper = await rasterSVG(mouthSvg(openV, { teethUp: true }), W, H);
mouthLayers.teeth_lower = await rasterSVG(mouthSvg({ ...openV, tLow: 2.4 }, { teethLow: true }), W, H);
mouthLayers.tongue = await rasterSVG(mouthSvg(openV, { tongue: true }), W, H);

// ---------------------------------------------------------------------------------------------
// 8. Neck (extracted + extended up behind the chin)
// ---------------------------------------------------------------------------------------------
const neckImg = masked(base, Mask.fromFn(W, H, (x, y) => (inPoly(x, y, neckPoly) ? 1 : 0)).mul(whiteM.invert())); // masked() applies the base alpha
const neckUnknown = Mask.fromFn(W, H, (x, y) => (inPoly(x, y, neckPoly) && y < jawY(x) + sc(1) && alphaM.data[y * W + x] > 0.5 ? 1 : 0)); // only behind the drawn head
inpaint(neckImg, neckUnknown, 200);
const neck = masked(neckImg, Mask.fromFn(W, H, (x, y) => (inPoly(x, y, neckPoly) ? 1 : 0)).feather(1));

// ---------------------------------------------------------------------------------------------
// 9. Hoodie + drawstrings
// ---------------------------------------------------------------------------------------------
const dsBoxes = { L: scBox(L.DRAWSTRINGS.L), R: scBox(L.DRAWSTRINGS.R) };
const dsMask = orangeM.mul(Mask.fromFn(W, H, (x, y) => (inBox(x, y, dsBoxes.L) || inBox(x, y, dsBoxes.R) ? 1 : 0))).threshold(0.5).removeSpecks(40);
const drawstrings = masked(base, dsMask.feather(1.2));
const hoodieImg = masked(base, hoodieZone);
const hoodieUnknown = Mask.fromFn(W, H, (x, y) => (inPoly(x, y, neckPoly) && y >= sc(168) && whiteM.data[y * W + x] < 0.5 && alphaM.data[y * W + x] > 0.5 ? 1 : 0)).max(dsMask.dilate(sc(0.8)));
await hoodieUnknown.save(path.join(QA, "masks", "hoodie_inpaint.png"));
inpaint(hoodieImg, hoodieUnknown, 220);
// fade the last rows of the bust canvas so the lower-body layer behind it takes over without a seam
const bottomFade = Mask.fromFn(W, H, (x, y) => (y >= H - sc(3) ? (H - 1 - y) / sc(3) : 1));
const hoodie = masked(hoodieImg, hoodieZone.max(hoodieUnknown).mul(bottomFade)); // hoodieZone already carries the base alpha

// ---------------------------------------------------------------------------------------------
// 10. Hair layers
// ---------------------------------------------------------------------------------------------
const hairFront = masked(base, hairSoft);
const hairBack = fill(W, H, hairHard.dilate(sc(1.2)).feather(sc(1.2)).mul(Mask.fromFn(W, H, (x, y) => (y < sc(L.HAIR_MAX_Y + 6) ? 1 : 0))), scaleColor(hairColor, 0.85));

// ---------------------------------------------------------------------------------------------
// 11. Export + manifest
// ---------------------------------------------------------------------------------------------
const layers = [];
/** x/y = top-left on the 4x canvas; w/h = PNG size; scale = display multiplier (PNG px -> canvas px). */
async function exportLayer(id, group, img, meta, placement) {
  const t = placement ? { img, x: placement.x, y: placement.y, w: img.w, h: img.h } : img.trim(2);
  if (!t) {
    console.warn(`layer ${id} is empty - skipped`);
    return;
  }
  const file = `${group}/${id}.png`;
  await bleed(t.img).save(path.join(ART, file));
  layers.push({ id, file, x: t.x, y: t.y, w: t.w, h: t.h, scale: placement?.scale ?? 1, ...meta });
  console.log(`  ${file}  ${t.w}x${t.h} @ (${t.x},${t.y}) x${placement?.scale ?? 1}  [${meta.kind}]`);
}
console.log("exporting layers");
await exportLayer("lower_body", "upper_body", lowerBody, { kind: "extracted", slot: "lower_body", bone: "body", notes: "Static torso/arms/legs below the bust crop. Drawn behind everything so the figure is complete in a full-body scene." }, { x: 0, y: LOWER.top * S, scale: S / LOWER.scale });
await exportLayer("hair_back", "head", hairBack, { kind: "generated", slot: "hair_back", bone: "head", notes: "Flat silhouette behind the hair so secondary hair motion never shows gaps. Repaint with real hair for texture." });
await exportLayer("neck", "head", neck, { kind: "inpainted", slot: "neck", bone: "neck", notes: "Original neck; extended upward behind the chin by diffusion fill." });
await exportLayer("head_base", "head", headBase, { kind: "inpainted", slot: "head_base", bone: "head", notes: "Face, ears, eye outlines, nose; skin reconstructed behind brows, eye openings, mouth and under the hairline." });
await exportLayer("hair_front", "head", hairFront, { kind: "extracted", slot: "hair_front", bone: "hair_front", notes: "All visible hair pixels." });
for (const side of ["L", "R"]) {
  const e = eyes[side];
  await exportLayer(`eye_white_${side}`, "eyes", e.white, { kind: "generated", slot: `eye_white_${side}`, bone: "head", notes: "Sclera fill with a lid shadow, in the sampled sclera colour." });
  await exportLayer(`iris_${side}`, "eyes", e.iris, { kind: "inpainted", slot: `iris_${side}`, bone: `eye_${side}`, notes: "Original iris; colour reconstructed behind the pupil/highlight and under the lid." });
  await exportLayer(`pupil_${side}`, "eyes", e.pupil, { kind: "extracted", slot: `pupil_${side}`, bone: `eye_${side}`, notes: "Original pupil plus its highlight so both move together." });
  await exportLayer(`eyelid_upper_${side}`, "eyes", e.lidUpper, { kind: "generated", slot: `eyelid_upper_${side}`, bone: `eyelid_upper_${side}`, notes: "Skin-tone lid with lash line; sits above the opening at rest, clipped by the eye clip polygon." });
  await exportLayer(`eyelid_lower_${side}`, "eyes", e.lidLower, { kind: "generated", slot: `eyelid_lower_${side}`, bone: `eyelid_lower_${side}`, notes: "Thin lower lid; moves up for squints." });
  await exportLayer(`brow_${side}`, "brows", masked(base, brows[side].soft), { kind: "extracted", slot: `brow_${side}`, bone: `brow_${side}`, notes: "Original eyebrow pixels." });
}
const mouthNotes = {
  smile: ["extracted", "The original baked smile - identical to the source at rest."],
  rest: ["generated", "Closed, relaxed mouth (lip-sync REST)."],
  interior: ["generated", "Dark mouth interior of the OPEN shape (for part-based mouths)."],
  teeth_upper: ["generated", "Upper teeth band of the OPEN shape."],
  teeth_lower: ["generated", "Lower teeth band of the OPEN shape."],
  tongue: ["generated", "Tongue of the OPEN shape."],
};
for (const [name, img] of Object.entries(mouthLayers)) {
  const [kind, notes] = mouthNotes[name] ?? ["generated", `Viseme ${name} (vector, built to the measured mouth position/width).`];
  const id = ["interior", "teeth_upper", "teeth_lower", "tongue"].includes(name) ? (name === "interior" ? "mouth_interior" : name) : `mouth_${name}`;
  await exportLayer(id, "mouth", img, { kind, slot: ["mouth_interior", "teeth_upper", "teeth_lower", "tongue"].includes(id) ? "mouth_parts" : "mouth", bone: "mouth", notes });
}
await exportLayer("hoodie_shoulders", "upper_body", hoodie, { kind: "inpainted", slot: "hoodie", bone: "body", notes: "Hoodie, hood lining and collar; lining reconstructed behind the neck, cloth behind the drawstrings. Logo untouched." });
await exportLayer("hood_drawstrings", "upper_body", drawstrings, { kind: "extracted", slot: "drawstrings", bone: "body", notes: "Both drawstrings in one layer (split by x in the skeleton builder if separate bones are wanted)." });

const manifest = {
  generated: new Date().toISOString(),
  source: L.SOURCE,
  canvas: { width: W, height: H, scale: S, crop: L.CROP, units: "canvas pixels, origin top-left, y down (multiply original coords by scale)" },
  source: { file: L.SOURCE, width: sourceMeta.width, height: sourceMeta.height },
  naming: "_L = screen-left, _R = screen-right",
  landmarks: {
    eyes: Object.fromEntries(["L", "R"].map((s) => [s, { center: [eyes[s].cx, eyes[s].cy], irisRadius: eyes[s].irisR, openTop: eyes[s].openTop, openBottom: eyes[s].openBottom, openHeight: eyes[s].openHeight, clipPolygon: eyes[s].clipPoly.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]) }])),
    brows: Object.fromEntries(["L", "R"].map((s) => { const b = brows[s].hard.map((v) => v); let sx = 0, sy = 0, n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b.data[y * W + x] > 0.5) { sx += x; sy += y; n++; } return [s, { center: [+(sx / n).toFixed(1), +(sy / n).toFixed(1)] }]; })),
    mouth: { center: [mcx, mcy], box: mouthBox, restWidth: sc(L.MOUTH.restWidth) },
    pivots: Object.fromEntries(Object.entries(L.PIVOTS).map(([k, p]) => [k, scPt(p)])),
    drawstrings: { L: scPt(L.PIVOTS.drawstringL), R: scPt(L.PIVOTS.drawstringR) },
  },
  colors: { skin: hex(skinTone), hair: hex(hairColor), sclera: hex(eyes.L.scleraColor), lipLine: COL.lipLine, teeth: COL.teeth },
  visemes: VISEMES,
  layers,
};
await fs.writeFile(path.join(ART, "manifest.json"), JSON.stringify(manifest, null, 2));

// ---------------------------------------------------------------------------------------------
// 12. QA composite: re-assemble in draw order and diff against the upscaled original
// ---------------------------------------------------------------------------------------------
const order = ["lower_body", "hoodie_shoulders", "hood_drawstrings", "neck", "hair_back", "head_base", "eye_white_L", "iris_L", "pupil_L", "eye_white_R", "iris_R", "pupil_R", "brow_L", "brow_R", "mouth_smile", "hair_front"];
const comp = new Img(W, H);
for (const id of order) {
  const lay = layers.find((l) => l.id === id);
  const img = await Img.load(path.join(ART, lay.file));
  const full = new Img(W, H);
  const sc2 = lay.scale ?? 1;
  for (let y = 0; y < img.h * sc2; y++) for (let x = 0; x < img.w * sc2; x++) { const cx2 = lay.x + x, cy2 = lay.y + y; if (cx2 >= W || cy2 >= H) continue; const si = img.idx(Math.min(img.w - 1, Math.floor(x / sc2)), Math.min(img.h - 1, Math.floor(y / sc2))), di = full.idx(cx2, cy2); for (let c = 0; c < 4; c++) full.data[di + c] = img.data[si + c]; }
  over(comp, full);
}
await comp.save(path.join(QA, "composite_rest.png"));
let diffSum = 0, diffMax = 0, n = 0;
const diffImg = new Img(W, H);
for (let i = 0; i < W * H; i++) {
  const a = Math.max(base.data[i * 4 + 3], comp.data[i * 4 + 3]);
  if (a < 0.5) continue;
  let d = 0;
  for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(base.data[i * 4 + c] * base.data[i * 4 + 3] - comp.data[i * 4 + c] * comp.data[i * 4 + 3]));
  d = Math.max(d, Math.abs(base.data[i * 4 + 3] - comp.data[i * 4 + 3]));
  diffSum += d; n++; if (d > diffMax) diffMax = d;
  diffImg.set(i % W, (i / W) | 0, d > 0.08 ? 1 : d * 4, d * 4, d * 4, 1);
}
await diffImg.save(path.join(QA, "composite_diff.png"));
console.log(`composite vs original: mean abs diff ${(diffSum / n * 255).toFixed(2)}/255 over ${n} px, max ${(diffMax * 255).toFixed(0)}/255`);
console.log("done");
