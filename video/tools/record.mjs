// Records shots of the real app on Aevum testnet at 3200x1800 (1600x900 @2x), 30 fps CFR, NVENC.
// Usage (needs the web app on :3005 with the playground on, and playwright): node tools/record.mjs <outDir> <shot...>   shots: landing live sales bad hijack drawerA drawerB explorer
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
const BASE = "http://localhost:3005";
const [outDir, ...shots] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async () => (await fetch(BASE + "/api/playground")).json();

async function record(name, fn) {
  const b = await chromium.launch({ channel: "chromium", args: ["--force-device-scale-factor=2"] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", `${outDir}/${name}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  let latest = null, t0 = 0, written = 0, running = true;
  const events = [];
  const mark = (type, data = {}) => { const t = (Date.now() - t0) / 1000; events.push({ t, type, ...data }); console.log(`[${name}] ${t.toFixed(1)}s ${type}`, JSON.stringify(data).slice(0, 160)); };
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => { latest = Buffer.from(data, "base64"); cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {}); });
  const writer = (async () => {
    while (!latest) await sleep(10);
    t0 = Date.now();
    while (running) {
      const due = Math.floor(((Date.now() - t0) / 1000) * FPS);
      while (written <= due) { if (!ff.stdin.write(latest)) await new Promise((r) => ff.stdin.once("drain", r)); written++; }
      await sleep(8);
    }
  })();
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 3200, maxHeight: 1800 });
  const h = {
    p, mark, sleep, api,
    async goto(path) { await p.goto(BASE + path, { waitUntil: "domcontentloaded" }); },
    async scrollTo(y, ms = 1600) {
      await p.evaluate(async ([y, ms]) => {
        const s = window.scrollY, d = y - s, t0 = performance.now();
        await new Promise((res) => { const f = (now) => { const k = Math.min(1, (now - t0) / ms); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; window.scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
      }, [y, ms]);
      mark("scroll", { y: await p.evaluate(() => window.scrollY) });
    },
    async scrollToEl(sel, offset = 120, ms = 1600) { const y = await p.locator(sel).first().evaluate((el, o) => el.getBoundingClientRect().top + window.scrollY - o, offset); await h.scrollTo(y, ms); },
    async hoverClick(sel, hoverMs = 1100) {
      const el = p.locator(sel).first(); const box = await el.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      mark("move", { x, y }); await p.mouse.move(x, y, { steps: 12 }); await sleep(hoverMs);
      mark("click", { x, y, sel }); await p.mouse.down(); await sleep(90); await p.mouse.up();
    },
  };
  while (!t0) await sleep(20);
  mark("start");
  try { await fn(h); } catch (e) { mark("error", { msg: String(e) }); }
  mark("end");
  running = false; await writer; ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  fs.writeFileSync(`${outDir}/${name}.json`, JSON.stringify(events, null, 1));
  await b.close();
}

async function runBeat(h, idx, beatKey) {
  await h.goto("/playground");
  await h.p.waitForSelector(".beat .btn:not([disabled])", { timeout: 60000 });
  await h.sleep(2500);
  await h.scrollToEl(".beat", 260, 1400);
  await h.sleep(800);
  await h.hoverClick(`.beat:nth-of-type(${idx}) .btn`);
  await h.p.waitForSelector(".run-progress", { timeout: 30000 });
  h.mark("job-start", { beat: beatKey });
  await h.sleep(1200);
  await h.scrollToEl(".terminal", 90, 1500);
  const seen = new Set();
  for (;;) {
    const s = await h.api();
    for (const l of s.job?.lines ?? []) if (!seen.has(l)) { seen.add(l); h.mark("line", { l }); }
    if (s.job?.finishedAt !== undefined) { h.mark("job-end", { ok: s.job.ok }); break; }
    // keep the newest log lines in view
    await h.p.evaluate(() => { const pre = document.querySelector(".terminal pre"); if (pre) pre.scrollTop = pre.scrollHeight; });
    await h.sleep(1000);
  }
  await h.sleep(4000);
}

const SHOTS = {
  async landing(h) { await h.goto("/"); await h.sleep(14000); await h.p.mouse.wheel(0, 900); await h.sleep(5000); await h.scrollToEl("#replay", 0, 1800); await h.sleep(9000); },
  async live(h) {
    await h.goto("/live"); await h.sleep(7000);
    const H = await h.p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 450; y < H - 900; y += 520) { await h.scrollTo(y, 1700); await h.sleep(2600); }
    await h.sleep(2000);
  },
  live2: (h) => SHOTS.live(h),
  sales: (h) => runBeat(h, 1, "sales-rush"),
  bad: (h) => runBeat(h, 2, "bad-strategy"),
  hijack: (h) => runBeat(h, 3, "hijack"),
  async drawerA(h) { await h.goto("/drawer/0xa924b7f72f33c0A99dD81e3B2C7E3437D9FA902B"); await h.sleep(7000); const H = await h.p.evaluate(() => document.documentElement.scrollHeight); for (let y = 500; y < H - 900; y += 560) { await h.scrollTo(y, 1700); await h.sleep(2400); } },
  async drawerB(h) { await h.goto("/drawer/0x6A22c5b44C3c3f428FDa104910B6cEab8325b9F2"); await h.sleep(7000); const H = await h.p.evaluate(() => document.documentElement.scrollHeight); for (let y = 500; y < H - 900; y += 560) { await h.scrollTo(y, 1700); await h.sleep(2400); } },
};
for (const s of shots) { await record(s, SHOTS[s]); console.log(`[${s}] saved`); }
