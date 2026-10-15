// Headless end-to-end check of the ElevenLabs connection: text-only session, one message, wait for a reply.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--deny-permission-prompts"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const log = [];
p.on("console", (m) => (m.type() === "error" || m.type() === "warning" || m.text().startsWith("[voice]")) && log.push(`${m.type()}: ${m.text().slice(0, 160)}`));
p.on("pageerror", (e) => log.push("pageerror: " + e.message));
await p.goto("http://localhost:5173/", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
await p.click("button[aria-label='Talk to Plexi']");
const status = async () => p.$eval("section[aria-label='Talk to Plexi'] header p", (el) => el.textContent?.trim());
let s = "";
for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); s = await status(); if (/Ready|listening|speaking|wrong|Thinking/.test(s ?? "")) break; }
console.log("status after connect:", s);
await p.screenshot({ path: `${out}/agent_connected.png` });
if (/wrong/.test(s ?? "")) { console.log("error text:", await p.$eval("[role=alert]", (el) => el.textContent).catch(() => "n/a")); }
else {
  await p.type("#plexi-input", "hello, what does Plexus Digitals do?");
  await p.keyboard.press("Enter");
  let reply = "";
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const lines = await p.$$eval("[role=log] li", (els) => els.map((e) => e.textContent?.replace(/\s+/g, " ").trim()));
    const last = lines[lines.length - 1] ?? "";
    if (lines.length >= 3 && last.startsWith("Plexi") && !/Hi, I'm Plexi\. Your AI guide/.test(last)) { reply = last; break; }
  }
  console.log("status:", await status());
  console.log("reply:", reply ? reply.slice(0, 300) : "(no reply within 30 s)");
  await p.screenshot({ path: `${out}/agent_reply.png` });
  await p.click("section[aria-label='Talk to Plexi'] header button").catch(() => {});
}
await b.close();
console.log(log.length ? "console:\n" + log.join("\n") : "no console errors/warnings");
