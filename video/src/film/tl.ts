import timeline from "./timeline.json";
import { Easing, interpolate } from "remotion";

/** The film's clock: scenes and word timings from tools/film_timeline.py. Every helper returns GLOBAL frames. */
export type Scene = (typeof timeline.scenes)[number];
export const FPS = timeline.fps;
export const TOTAL = timeline.total;
export const SCENES = timeline.scenes;

export const scene = (id: string) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
/** Global frame where a scene starts, plus `sec` seconds. */
export const at = (id: string, sec = 0) => scene(id).from + Math.round(sec * FPS);
/** Global frame where a scene ends (start of the next one). */
export const end = (id: string) => scene(id).from + scene(id).frames;
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Global frame where the nth spoken `word` of a scene starts. */
export const w = (id: string, word: string, nth = 1) => {
  let n = 0;
  const s = scene(id);
  for (const x of s.words) if (norm(x.w) === norm(word) && ++n === nth) return s.from + x.f;
  throw new Error(`no word "${word}" #${nth} in ${id}`);
};
export const sec = (s: number) => Math.round(s * FPS);
export const sceneAt = (f: number) => SCENES.find((s) => f >= s.from && f < s.from + s.frames) ?? SCENES[SCENES.length - 1];

export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  io: Easing.bezier(0.65, 0, 0.35, 1),
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
  in: Easing.bezier(0.5, 0, 0.75, 0),
  lin: (t: number) => t,
};
/** 0 → 1 between frames a and b. */
export const p = (f: number, a: number, b: number, e: (t: number) => number = EASE.out) =>
  interpolate(f, [a, Math.max(b, a + 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
/** Up from a to a+inn, hold, down over `out` frames before b. */
export const env = (f: number, a: number, b: number, inn = 18, out = 18) => Math.min(p(f, a, a + inn), 1 - p(f, b - out, b, EASE.io));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
