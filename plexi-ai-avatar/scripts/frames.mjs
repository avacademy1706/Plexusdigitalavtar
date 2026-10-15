import puppeteer from "puppeteer-core";
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto("http://localhost:4173/?demo=speaking", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
for (let i = 0; i < 8; i++) {
  await p.screenshot({ path: `${out}/f${i}.png`, clip: { x: 470, y: 250, width: 120, height: 80 } });
  await new Promise((r) => setTimeout(r, 140));
}
await b.close();
