// Headless smoke test: loads the built app, reports console errors, takes screenshots.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/smoke.mjs
import puppeteer from "puppeteer-core";

const url = process.env.URL ?? "http://localhost:4173/";
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const out = process.env.OUT ?? ".";

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.goto(process.env.QS ? url + process.env.QS : url, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: `${out}/shot-${name}.png` });
  const loading = await page.$eval('[role="status"]', (el) => getComputedStyle(el).opacity).catch(() => "n/a");
  console.log(name, "loading overlay opacity:", loading);
  if (name === "desktop") {
    await page.click("button[aria-label='Talk to Plexi']");
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${out}/shot-desktop-start.png` });
    console.log("after start:", await page.$eval("section[aria-label='Talk to Plexi']", (el) => el.innerText.slice(0, 300)));
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "No console errors");
