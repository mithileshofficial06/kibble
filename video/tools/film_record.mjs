// Records the real app for the 3D film (2400x1350, 30 fps): node tools/film_record.mjs <outDir> <shot...>   shots: hijack3d drawerA
// Needs the web app on :3005 with KIBBLE_PLAYGROUND=on. The Playground run spends testnet gas (free test tokens).
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
  const b = await chromium.launch({ channel: "chromium", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
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
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 2400, maxHeight: 1350 });
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

const DRAWER_A = "0xea44B3a2481ceA281B1Cad4fFf631868D2b50cB3";
const SHOTS = {
  // "A stolen key", run for real through the Playground, with the 3D view in frame
  async hijack3d(h) {
    await h.goto("/playground");
    await h.sleep(5000);
    await h.scrollToEl(".story-anchor", 70, 1600);
    await h.sleep(1500);
    const btn = h.p.getByRole("button", { name: /Run it for real/ }).nth(2);
    const box = await btn.boundingBox();
    if (box) { await h.scrollTo(await h.p.evaluate(() => window.scrollY) + box.y - 500, 1200); }
    const b2 = await btn.boundingBox();
    h.mark("move", { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 });
    await h.p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 14 });
    await h.sleep(900);
    h.mark("click");
    await btn.click();
    await h.sleep(1500);
    await h.scrollToEl(".story-anchor", 70, 1400);
    h.mark("job-start");
    const seen = new Set();
    const t0 = Date.now();
    for (;;) {
      const s = await h.api();
      for (const l of s.job?.lines ?? []) if (!seen.has(l)) { seen.add(l); h.mark("line", { l }); }
      if (s.job?.finishedAt !== undefined && s.job.beat === "hijack") { h.mark("job-end", { ok: s.job.ok }); break; }
      if (Date.now() - t0 > 540000) { h.mark("timeout"); break; }
      await h.sleep(1000);
    }
    await h.sleep(9000);
  },
  async drawerA(h) {
    await h.goto(`/drawer/${DRAWER_A}`);
    await h.sleep(6000);
    const H = await h.p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 450; y < H - 900; y += 520) { await h.scrollTo(y, 1700); await h.sleep(2300); }
    await h.sleep(1500);
  },
};
for (const s of shots) { await record(s, SHOTS[s]); console.log(`[${s}] saved`); }
