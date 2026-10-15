/**
 * Copies the runtime files (artwork PNGs, manifest, skeleton JSON, viseme map) into the Plexi web app.
 *   node scripts/export_web.mjs [targetDir]   (default: ../plexi-ai-avatar/public/avatar/rig)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(process.argv[2] ?? path.join(ROOT, "..", "plexi-ai-avatar", "public", "avatar", "rig"));
await fs.rm(target, { recursive: true, force: true });
await fs.cp(path.join(ROOT, "artwork"), path.join(target, "artwork"), { recursive: true });
for (const f of ["Plexi_skeleton.json", "viseme_map.json"]) await fs.copyFile(path.join(ROOT, "spine", f), path.join(target, f));
const sk = JSON.parse(await fs.readFile(path.join(target, "Plexi_skeleton.json"), "utf8"));
sk.skeleton.images = "./artwork/";
await fs.writeFile(path.join(target, "Plexi_skeleton.json"), JSON.stringify(sk));
let n = 0, bytes = 0;
const walk = async (dir) => { for (const e of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) await walk(p); else { n++; bytes += (await fs.stat(p)).size; } } };
await walk(target);
console.log(`exported to ${target}: ${n} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
