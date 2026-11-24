import timeline from "./timeline.json";
import { Easing, interpolate, spring } from "remotion";

export type Scene = (typeof timeline.scenes)[number];
export const FPS = timeline.fps;
export const TOTAL = timeline.total;
export const SCENES = timeline.scenes;
export const scene = (id: string) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Local frame (inside the scene) where the nth spoken occurrence of `word` starts. */
export const wf = (id: string, word: string, nth = 1) => {
  let n = 0;
  for (const w of scene(id).words) if (norm(w.w) === norm(word) && ++n === nth) return w.f;
  throw new Error(`no word "${word}" #${nth} in ${id}`);
};
export const sec = (s: number) => Math.round(s * FPS);

export const EASE = Easing.bezier(0.16, 1, 0.3, 1); // the app's --ease
export const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);
/** 0 → 1 between frames a and b with the app's ease. */
export const prog = (f: number, a: number, b: number, ease = EASE) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const spr = (f: number, start: number, damping = 18, mass = 0.9) =>
  spring({ frame: f - start, fps: FPS, config: { damping, mass, stiffness: 120 } });
