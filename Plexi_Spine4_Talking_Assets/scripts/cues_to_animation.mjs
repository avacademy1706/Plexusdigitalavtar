/**
 * Converts timed viseme cues into a Spine animation and merges it into spine/Plexi_skeleton.json,
 * so a recorded line of dialogue can be imported into Spine Editor as a ready-made animation.
 *
 *   node scripts/cues_to_animation.mjs <cues.json> [animationName]
 *
 * cues.json format (see docs/LIP_SYNC_GUIDE.md):
 * {
 *   "name": "line_intro",            // optional animation name (default: lipsync/<file name>)
 *   "cues": [ { "t": 0.00, "viseme": "REST" }, { "t": 0.12, "viseme": "AI" }, ... ],
 *   "end": 1.8                       // optional: time of the final REST
 * }
 * Times are seconds from the start of the audio. Visemes are the group names in spine/viseme_map.json.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , cuesFile, nameArg] = process.argv;
if (!cuesFile) {
  console.error("usage: node scripts/cues_to_animation.mjs <cues.json> [animationName]");
  process.exit(2);
}
const cues = JSON.parse(await fs.readFile(cuesFile, "utf8"));
const map = JSON.parse(await fs.readFile(path.join(ROOT, "spine", "viseme_map.json"), "utf8"));
const skFile = path.join(ROOT, "spine", "Plexi_skeleton.json");
const sk = JSON.parse(await fs.readFile(skFile, "utf8"));

const MIN_HOLD = 0.05; // seconds - shorter cues are dropped so the mouth never flickers
const keys = [];
let lastT = -1, lastName = null;
for (const c of [...cues.cues].sort((a, b) => a.t - b.t)) {
  const att = map.groups[c.viseme];
  if (!att) {
    console.error(`unknown viseme group ${c.viseme} (known: ${Object.keys(map.groups).join(", ")})`);
    process.exit(1);
  }
  if (att === lastName) continue;
  if (keys.length && c.t - lastT < MIN_HOLD) keys.pop(); // replace a too-short cue
  keys.push({ time: Math.round(c.t * 1000) / 1000, name: att });
  lastT = c.t;
  lastName = att;
}
const end = cues.end ?? (lastT + 0.15);
if (lastName !== map.groups.REST) keys.push({ time: Math.round(end * 1000) / 1000, name: map.groups.REST });

const name = nameArg ?? cues.name ?? `lipsync/${path.basename(cuesFile, ".json")}`;
sk.animations[name] = { slots: { [map.slot]: { attachment: keys } } };
await fs.writeFile(skFile, JSON.stringify(sk, null, 2));
console.log(`animation "${name}": ${keys.length} mouth keys, ${end.toFixed(2)} s -> merged into spine/Plexi_skeleton.json`);
