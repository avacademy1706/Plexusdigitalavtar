// Headless reproduction of the microphone path: fakes getUserMedia + SpeechRecognition so the app believes a user spoke.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const log = [];
p.on("console", (m) => log.push(`${m.type()}: ${m.text().slice(0, 180)}`));
p.on("pageerror", (e) => log.push("pageerror: " + e.message));
p.on("response", (r) => { if (/\/api\//.test(r.url())) log.push(`net: ${r.status()} ${new URL(r.url()).pathname}`); });
await p.evaluateOnNewDocument((d) => { window.__askDelay = d;
  // fake mic permission
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  // fake SpeechRecognition: first start() -> user asks a question after 1.2 s; later starts -> silence then end
  let starts = 0;
  class FakeRec {
    constructor() { this.lang = ""; this.continuous = false; this.interimResults = false; this.onresult = null; this.onerror = null; this.onend = null; this._t = null; }
    start() {
      starts++;
      const n = starts;
      window.__recStarts = n;
      if (n === 1) {
        this._t = setTimeout(() => {
          const mk = (text, isFinal) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
          this.onresult?.(mk("what does plexus digitals do", false));
          setTimeout(() => { this.onresult?.(mk("what does plexus digitals do", true)); setTimeout(() => this.onend?.(), 100); }, 400);
        }, Number(window.__askDelay ?? 1200));
      } else {
        this._t = setTimeout(() => this.onend?.(), 3000); // silence
      }
    }
    stop() { clearTimeout(this._t); this.onend?.(); }
    abort() { clearTimeout(this._t); }
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
}, Number(process.env.ASK_DELAY_MS ?? 1200));
await p.goto("http://localhost:5173/", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
await p.click("button[aria-label='Talk to Plexi']");
const status = async () => p.$eval("section[aria-label='Talk to Plexi'] header p", (el) => el.textContent?.trim());
const lines = async () => p.$$eval("[role=log] li", (els) => els.map((e) => e.textContent?.replace(/\s+/g, " ").trim()));
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const l = await lines();
  const s = await status();
  if (i % 2 === 0) console.log(`t=${i}s status="${s}" lines=${l.length} recStarts=${await p.evaluate(() => window.__recStarts)}`);
  if (l.length >= 4 && l[l.length - 1].startsWith("Plexi") && l.some((x) => x.startsWith("User"))) { console.log("ANSWERED:", l[l.length - 1].slice(0, 200)); break; }
}
console.log("final lines:", JSON.stringify(await lines()).slice(0, 600));
await p.screenshot({ path: `${out}/voice_path.png` });
await b.close();
console.log("--- log ---\n" + log.filter((l) => !/favicon/.test(l)).slice(0, 40).join("\n"));
