/**
 * Builds Plexi's Spine skeleton data from artwork/manifest.json.
 *
 *   node scripts/build_skeleton.mjs            -> spine/Plexi_skeleton.json
 *
 * The output is Spine's documented JSON skeleton format (http://esotericsoftware.com/spine-json-format),
 * intended for Spine Editor 4.2: Spine > Import Data. It is NOT a .spine project file; the project is
 * created when the data is imported and saved in Spine Editor.
 *
 * Coordinate system: Spine uses y-up with the root at the bottom-centre of the artwork canvas.
 *   spineX = canvasX - canvasWidth / 2,  spineY = canvasHeight - canvasY
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPINE_VERSION = process.env.SPINE_VERSION ?? "4.2.43";
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "artwork", "manifest.json"), "utf8"));
const { width: W, height: H } = manifest.canvas;
const LM = manifest.landmarks;

const toSpine = ([x, y]) => [x - W / 2, H - y];
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Bones (world positions first, then converted to parent-relative)
// ---------------------------------------------------------------------------------------------
const eyeL = toSpine(LM.eyes.L.center), eyeR = toSpine(LM.eyes.R.center);
const browL = toSpine(LM.brows.L.center), browR = toSpine(LM.brows.R.center);
const worldBones = [
  { name: "root", pos: [0, 0], length: 0 },
  { name: "body", parent: "root", pos: toSpine(LM.pivots.body), length: 180, color: "ffffffff" },
  { name: "neck", parent: "body", pos: toSpine(LM.pivots.neck), length: 150, color: "ffffffff" },
  { name: "head", parent: "neck", pos: toSpine(LM.pivots.head), length: 420, color: "ffd36bff" },
  { name: "hair_front", parent: "head", pos: toSpine(LM.pivots.hairFront), length: 80, color: "a06bffff" },
  { name: "eye_L", parent: "head", pos: eyeL, length: 24, color: "6bd3ffff" },
  { name: "eye_R", parent: "head", pos: eyeR, length: 24, color: "6bd3ffff" },
  { name: "eyelid_upper_L", parent: "head", pos: eyeL, length: 20, color: "6bffb4ff" },
  { name: "eyelid_lower_L", parent: "head", pos: eyeL, length: 20, color: "6bffb4ff" },
  { name: "eyelid_upper_R", parent: "head", pos: eyeR, length: 20, color: "6bffb4ff" },
  { name: "eyelid_lower_R", parent: "head", pos: eyeR, length: 20, color: "6bffb4ff" },
  { name: "brow_L", parent: "head", pos: browL, length: 60, color: "ffb46bff" },
  { name: "brow_R", parent: "head", pos: browR, length: 60, color: "ffb46bff" },
  { name: "mouth", parent: "head", pos: toSpine(LM.mouth.center), length: 100, color: "ff6b6bff" },
  { name: "drawstring_L", parent: "body", pos: toSpine(LM.drawstrings.L), length: 160, rotation: -90, color: "ff9f6bff" },
  { name: "drawstring_R", parent: "body", pos: toSpine(LM.drawstrings.R), length: 160, rotation: -90, color: "ff9f6bff" },
];
const worldPos = Object.fromEntries(worldBones.map((b) => [b.name, b.pos]));
const bones = worldBones.map((b) => {
  const out = { name: b.name };
  if (b.parent) {
    out.parent = b.parent;
    const p = worldPos[b.parent];
    out.x = r2(b.pos[0] - p[0]);
    out.y = r2(b.pos[1] - p[1]);
  }
  if (b.length) out.length = b.length;
  if (b.rotation) out.rotation = b.rotation;
  if (b.color) out.color = b.color;
  return out;
});

// ---------------------------------------------------------------------------------------------
// Slots (draw order, back to front) and attachments
// ---------------------------------------------------------------------------------------------
const layer = (id) => {
  const l = manifest.layers.find((x) => x.id === id);
  if (!l) throw new Error(`manifest has no layer ${id}`);
  return l;
};
/** Region attachment for a manifest layer, positioned relative to `bone` (world pos). */
function region(id, bone) {
  const l = layer(id);
  const sc = l.scale ?? 1;
  const center = toSpine([l.x + (l.w * sc) / 2, l.y + (l.h * sc) / 2]);
  const b = worldPos[bone];
  return { path: l.file.replace(/\.png$/, ""), x: r2(center[0] - b[0]), y: r2(center[1] - b[1]), width: l.w, height: l.h, ...(sc !== 1 ? { scaleX: sc, scaleY: sc } : {}) };
}
function clipping(side, endSlot) {
  const b = worldPos.head;
  const verts = LM.eyes[side].clipPolygon.flatMap((p) => {
    const s = toSpine(p);
    return [r1(s[0] - b[0]), r1(s[1] - b[1])];
  });
  return { type: "clipping", end: endSlot, vertexCount: verts.length / 2, vertices: verts, color: "ce3a3aff" };
}

const VISEME_FILES = ["smile", "rest", "MBP", "FV", "A", "E", "I", "O", "U", "L", "TH", "CH_SH", "open"];
const slots = [];
const attachments = {};
const addSlot = (name, bone, atts, defaultAtt) => {
  slots.push({ name, bone, ...(defaultAtt ? { attachment: defaultAtt } : {}) });
  attachments[name] = atts;
};
addSlot("lower_body", "body", { lower_body: region("lower_body", "body") }, "lower_body");
addSlot("hoodie", "body", { hoodie_shoulders: region("hoodie_shoulders", "body") }, "hoodie_shoulders");
addSlot("drawstrings", "body", { hood_drawstrings: region("hood_drawstrings", "body") }, "hood_drawstrings");
addSlot("neck", "neck", { neck: region("neck", "neck") }, "neck");
addSlot("hair_back", "head", { hair_back: region("hair_back", "head") }, "hair_back");
addSlot("head_base", "head", { head_base: region("head_base", "head") }, "head_base");
for (const side of ["L", "R"]) {
  addSlot(`eye_clip_${side}`, "head", { [`eye_clip_${side}`]: clipping(side, `eyelid_lower_${side}`) }, `eye_clip_${side}`);
  addSlot(`eye_white_${side}`, "head", { [`eye_white_${side}`]: region(`eye_white_${side}`, "head") }, `eye_white_${side}`);
  addSlot(`iris_${side}`, `eye_${side}`, { [`iris_${side}`]: region(`iris_${side}`, `eye_${side}`) }, `iris_${side}`);
  addSlot(`pupil_${side}`, `eye_${side}`, { [`pupil_${side}`]: region(`pupil_${side}`, `eye_${side}`) }, `pupil_${side}`);
  addSlot(`eyelid_upper_${side}`, `eyelid_upper_${side}`, { [`eyelid_upper_${side}`]: region(`eyelid_upper_${side}`, `eyelid_upper_${side}`) }, `eyelid_upper_${side}`);
  addSlot(`eyelid_lower_${side}`, `eyelid_lower_${side}`, { [`eyelid_lower_${side}`]: region(`eyelid_lower_${side}`, `eyelid_lower_${side}`) }, `eyelid_lower_${side}`);
}
addSlot("brow_L", "brow_L", { brow_L: region("brow_L", "brow_L") }, "brow_L");
addSlot("brow_R", "brow_R", { brow_R: region("brow_R", "brow_R") }, "brow_R");
// part-based mouth (hidden by default; for custom mouths built from pieces)
addSlot("mouth_interior", "mouth", { mouth_interior: region("mouth_interior", "mouth") }, null);
addSlot("mouth_tongue", "mouth", { tongue: region("tongue", "mouth") }, null);
addSlot("mouth_teeth_lower", "mouth", { teeth_lower: region("teeth_lower", "mouth") }, null);
addSlot("mouth_teeth_upper", "mouth", { teeth_upper: region("teeth_upper", "mouth") }, null);
// viseme mouth (attachment swaps)
addSlot("mouth", "mouth", Object.fromEntries(VISEME_FILES.map((v) => [`mouth_${v}`, region(`mouth_${v}`, "mouth")])), "mouth_smile");
addSlot("hair_front", "hair_front", { hair_front: region("hair_front", "hair_front") }, "hair_front");

// ---------------------------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------------------------
const openL = LM.eyes.L.openHeight, openR = LM.eyes.R.openHeight;
const EASE = [0.25, 0, 0.75, 1]; // smooth in/out (single-value curves)
const EASE2 = [0.25, 0, 0.75, 1, 0.25, 0, 0.75, 1]; // for 2-value timelines (translate/scale)
const key = (time, value, curve) => ({ time: r2(time), value: r2(value), ...(curve ? { curve } : {}) });
const keyXY = (time, x, y, curve) => ({ time: r2(time), x: r2(x), y: r2(y), ...(curve ? { curve } : {}) });
const stepped = (time, name) => ({ time: r2(time), name });

/** Eyelid close/open for one side: returns translate keys (y down = negative). */
function blinkKeys(t0, side, { close = 0.08, hold = 0.05, open = 0.12, lowerLift = 0.18 } = {}) {
  const h = side === "L" ? openL : openR;
  return {
    upper: [keyXY(t0, 0, 0, EASE2), keyXY(t0 + close, 0, -h * 1.02, EASE2), keyXY(t0 + close + hold, 0, -h * 1.02, EASE2), keyXY(t0 + close + hold + open, 0, 0)],
    lower: [keyXY(t0, 0, 0, EASE2), keyXY(t0 + close, 0, h * lowerLift, EASE2), keyXY(t0 + close + hold, 0, h * lowerLift, EASE2), keyXY(t0 + close + hold + open, 0, 0)],
  };
}
function blinkAnimation(sides, t0 = 0) {
  const out = { bones: {} };
  for (const side of sides) {
    const k = blinkKeys(t0, side);
    out.bones[`eyelid_upper_${side}`] = { translate: k.upper };
    out.bones[`eyelid_lower_${side}`] = { translate: k.lower };
  }
  return out;
}
/** Merge blinks into an existing animation at several times. */
function addBlinks(anim, times) {
  for (const side of ["L", "R"]) {
    const up = [], lo = [];
    for (const t of times) {
      const k = blinkKeys(t, side);
      up.push(...k.upper);
      lo.push(...k.lower);
    }
    anim.bones[`eyelid_upper_${side}`] = { translate: up };
    anim.bones[`eyelid_lower_${side}`] = { translate: lo };
  }
}

const animations = {};

// -- idle: breathing + very small head motion (4 s loop, no blinks: layer `blink` on another track)
animations.idle = {
  bones: {
    body: { scale: [keyXY(0, 1, 1, EASE2), keyXY(2, 1.006, 1.012, EASE2), keyXY(4, 1, 1)] },
    neck: { rotate: [key(0, 0, EASE), key(2, 0.6, EASE), key(4, 0)] },
    head: {
      rotate: [key(0, 0, EASE), key(1.3, 0.9, EASE), key(2.7, -0.7, EASE), key(4, 0)],
      translate: [keyXY(0, 0, 0, EASE2), keyXY(2, 0, 2.5, EASE2), keyXY(4, 0, 0)],
    },
    hair_front: { rotate: [key(0, 0, EASE), key(1.6, 0.5, EASE), key(3, -0.4, EASE), key(4, 0)] },
    drawstring_L: { rotate: [key(0, 0, EASE), key(2.2, 1.2, EASE), key(4, 0)] },
    drawstring_R: { rotate: [key(0, 0, EASE), key(1.8, -1.2, EASE), key(4, 0)] },
  },
};

// -- blink / wink
animations.blink = blinkAnimation(["L", "R"]);
animations.blink_L = blinkAnimation(["L"]);
animations.blink_R = blinkAnimation(["R"]);

// -- listening: relaxed face, slow tilt, gaze shift, two blinks (6 s loop)
animations.listening = {
  bones: {
    head: { rotate: [key(0, 0, EASE), key(2.5, 2.2, EASE), key(5, 0.4, EASE), key(6, 0)], translate: [keyXY(0, 0, 0, EASE2), keyXY(3, 0, 1.5, EASE2), keyXY(6, 0, 0)] },
    body: { scale: [keyXY(0, 1, 1, EASE2), keyXY(3, 1.005, 1.01, EASE2), keyXY(6, 1, 1)] },
    eye_L: { translate: [keyXY(0, 0, 0, EASE2), keyXY(1.5, 7, 1, EASE2), keyXY(3.5, 7, 1, EASE2), keyXY(4.2, 0, 0)] },
    eye_R: { translate: [keyXY(0, 0, 0, EASE2), keyXY(1.5, 7, 1, EASE2), keyXY(3.5, 7, 1, EASE2), keyXY(4.2, 0, 0)] },
    brow_L: { translate: [keyXY(0, 0, 0, EASE2), keyXY(1.4, 0, 3, EASE2), keyXY(3.8, 0, 0)] },
    brow_R: { translate: [keyXY(0, 0, 0, EASE2), keyXY(1.4, 0, 3, EASE2), keyXY(3.8, 0, 0)] },
  },
  slots: { mouth: { attachment: [stepped(0, "mouth_smile")] } },
};
addBlinks(animations.listening, [1.9, 4.7]);

// -- talking: viseme sequence with head emphasis (2.4 s loop). Replace in production with timing-driven swaps.
const seq = [
  [0, "mouth_rest"], [0.12, "mouth_A"], [0.26, "mouth_E"], [0.38, "mouth_MBP"], [0.48, "mouth_O"], [0.62, "mouth_L"],
  [0.74, "mouth_E"], [0.86, "mouth_FV"], [0.98, "mouth_A"], [1.12, "mouth_CH_SH"], [1.24, "mouth_U"], [1.36, "mouth_rest"],
  [1.5, "mouth_TH"], [1.62, "mouth_E"], [1.74, "mouth_MBP"], [1.84, "mouth_A"], [1.98, "mouth_I"], [2.1, "mouth_O"], [2.24, "mouth_rest"],
];
animations.talking = {
  bones: {
    head: {
      rotate: [key(0, 0, EASE), key(0.5, 1.4, EASE), key(1.1, -0.8, EASE), key(1.7, 1.0, EASE), key(2.4, 0)],
      translate: [keyXY(0, 0, 0, EASE2), keyXY(0.12, 0, -2, EASE2), keyXY(0.4, 0, 1.5, EASE2), keyXY(0.98, 0, -2, EASE2), keyXY(1.3, 0, 1, EASE2), keyXY(1.84, 0, -2, EASE2), keyXY(2.4, 0, 0)],
    },
    brow_L: { translate: [keyXY(0, 0, 0, EASE2), keyXY(0.12, 0, 4, EASE2), keyXY(0.6, 0, 0, EASE2), keyXY(0.98, 0, 3, EASE2), keyXY(1.5, 0, 0)] },
    brow_R: { translate: [keyXY(0, 0, 0, EASE2), keyXY(0.12, 0, 4, EASE2), keyXY(0.6, 0, 0, EASE2), keyXY(0.98, 0, 3, EASE2), keyXY(1.5, 0, 0)] },
    hair_front: { rotate: [key(0, 0, EASE), key(0.6, 0.6, EASE), key(1.2, -0.4, EASE), key(1.8, 0.5, EASE), key(2.4, 0)] },
  },
  slots: { mouth: { attachment: seq.map(([t, n]) => stepped(t, n)) } },
};

// -- expression poses: one key at t=0; cross-fade to them with a mix duration (editor/runtime)
const pose = (bonesSpec, mouthName) => ({
  bones: Object.fromEntries(Object.entries(bonesSpec).map(([b, v]) => [b, Object.fromEntries(Object.entries(v).map(([tl, val]) => [tl, [tl === "rotate" ? key(0, val) : keyXY(0, val[0], val[1])]]))])),
  slots: { mouth: { attachment: [stepped(0, mouthName)] } },
});
animations.happy = pose({
  brow_L: { translate: [0, 5] }, brow_R: { translate: [0, 5] },
  eyelid_lower_L: { translate: [0, openL * 0.22] }, eyelid_lower_R: { translate: [0, openR * 0.22] },
  head: { rotate: 2.5 },
}, "mouth_smile");
animations.surprised = pose({
  brow_L: { translate: [0, 11] }, brow_R: { translate: [0, 11] },
  eyelid_upper_L: { translate: [0, 3] }, eyelid_upper_R: { translate: [0, 3] },
  eye_L: { translate: [0, 1] }, eye_R: { translate: [0, 1] },
  head: { translate: [0, 4] },
}, "mouth_open");
animations.concerned = pose({
  brow_L: { rotate: 11, translate: [3, 6] }, brow_R: { rotate: -11, translate: [-3, 6] },
  eyelid_upper_L: { translate: [0, -openL * 0.12] }, eyelid_upper_R: { translate: [0, -openR * 0.12] },
  head: { rotate: -1.5, translate: [0, -2] },
}, "mouth_rest");
animations.thinking = pose({
  eye_L: { translate: [13, 3] }, eye_R: { translate: [13, 3] },
  brow_L: { translate: [0, 7] }, brow_R: { translate: [0, -2], rotate: -5 },
  eyelid_lower_L: { translate: [0, openL * 0.18] }, eyelid_lower_R: { translate: [0, openR * 0.18] },
  head: { rotate: 3.5, translate: [0, 1] },
}, "mouth_rest");

// -- one-frame viseme animations for lip-sync drivers that prefer animation tracks over setAttachment
const VISEME_GROUPS = { REST: "mouth_rest", MBP: "mouth_MBP", FV: "mouth_FV", AI: "mouth_A", E: "mouth_E", O: "mouth_O", U: "mouth_U", L: "mouth_L", TH: "mouth_TH", CH_SH: "mouth_CH_SH", SMILE: "mouth_smile", OPEN: "mouth_open" };
for (const [g, att] of Object.entries(VISEME_GROUPS)) animations[`visemes/${g}`] = { slots: { mouth: { attachment: [stepped(0, att)] } } };

// ---------------------------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------------------------
const skeleton = {
  skeleton: { hash: "plexi-talking-avatar", spine: SPINE_VERSION, x: -W / 2, y: 0, width: W, height: H, images: "../artwork/", audio: "" },
  bones,
  slots,
  skins: [{ name: "default", attachments }],
  animations,
};
await fs.mkdir(path.join(ROOT, "spine"), { recursive: true });
await fs.writeFile(path.join(ROOT, "spine", "Plexi_skeleton.json"), JSON.stringify(skeleton, null, 2));
await fs.writeFile(path.join(ROOT, "spine", "viseme_map.json"), JSON.stringify({
  description: "Viseme group -> Spine attachment in slot 'mouth' (also available as one-frame animations 'visemes/<GROUP>').",
  slot: "mouth",
  groups: VISEME_GROUPS,
  extra: { I: "mouth_I (narrow 'ee' variant of E/AI)" },
}, null, 2));
console.log(`spine/Plexi_skeleton.json: ${bones.length} bones, ${slots.length} slots, ${Object.keys(animations).length} animations (spine ${SPINE_VERSION})`);
