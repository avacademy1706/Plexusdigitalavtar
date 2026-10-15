import puppeteer from "puppeteer-core";
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
const shots = [["rig_setup", ""], ["rig_speaking", "?demo=speaking"]];
for (const [id, qs] of shots) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(`[${id}] ${m.type()}: ${m.text().slice(0, 200)}`));
  p.on("pageerror", (e) => errs.push(`[${id}] pageerror: ${e.message}`));
  await p.goto("http://localhost:4173/" + qs, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 4000));
  await p.screenshot({ path: `${out}/${id}.png` });
  await p.screenshot({ path: `${out}/${id}_face.png`, clip: { x: 390, y: 150, width: 300, height: 260 } });
  const kind = await p.evaluate(() => document.querySelector("canvas")?.getAttribute("aria-label"));
  console.log(id, "canvas:", kind);
  await p.close();
}
await b.close();
console.log(errs.length ? errs.join("\n") : "no console errors/warnings");
