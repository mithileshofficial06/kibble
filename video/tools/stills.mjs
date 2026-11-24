// Render review stills: node tools/stills.mjs [scene[@fraction]...]  (default: every scene at 70%)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
const tl = JSON.parse(fs.readFileSync("src/timeline.json", "utf8"));
const args = process.argv.slice(2);
const want = args.length ? args : tl.scenes.map((s) => `${s.id}@0.7`);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "KibbleSilent", chromiumOptions: { gl: "angle" } });
fs.mkdirSync("out/stills", { recursive: true });
for (const w of want) {
  const [id, fr = "0.7"] = w.split("@");
  const s = tl.scenes.find((x) => x.id === id);
  const frame = fr.startsWith("f") ? s.from + Number(fr.slice(1)) : s.from + Math.round(s.frames * Number(fr));
  await renderStill({ serveUrl, composition, frame, output: `out/stills/${id}_${fr}.png`, chromiumOptions: { gl: "angle" }, imageFormat: "png" });
  console.log("still", id, fr, frame);
}
