// Review stills of the 3D film: node tools/film_stills.mjs scene@0.5 ... (or f1234 for a global frame)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
const tl = JSON.parse(fs.readFileSync("src/film/timeline.json", "utf8"));
const args = process.argv.slice(2);
const want = args.length ? args : tl.scenes.map((s) => `${s.id}@0.6`);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const chromiumOptions = { gl: "angle" };
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? "FilmSilent", chromiumOptions });
fs.mkdirSync("out/film-stills", { recursive: true });
for (const w of want) {
  let frame, name;
  if (w.startsWith("f")) { frame = Number(w.slice(1)); name = w; }
  else { const [id, fr = "0.6"] = w.split("@"); const s = tl.scenes.find((x) => x.id === id); frame = s.from + Math.round(s.frames * Number(fr)); name = `${id}_${fr}`; }
  const t = Date.now();
  await renderStill({ serveUrl, composition, frame, output: `out/film-stills/${name}.jpg`, chromiumOptions, imageFormat: "jpeg", jpegQuality: 88, timeoutInMilliseconds: 120000, onBrowserLog: (l) => process.env.LOGS && l.type !== "log" && console.log("  [browser]", l.type, l.text.slice(0, 300)) });
  console.log("still", name, frame, `${Date.now() - t} ms`);
}
