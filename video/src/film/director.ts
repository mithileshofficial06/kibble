import * as THREE from "three";
import type { V3 } from "./assets";
import { EASE, TOTAL, at, end, p, w } from "./tl";
import { H, W } from "./theme";

/** Where everything stands, and where the camera looks, frame by frame. */

// ------------------------------------------------------------ layout (world units)

/** Chapter 1: three agents with a fixed limit. */
export const ONE = { left: [-7.6, 0, 0] as V3, mid: [0, 0, 0] as V3, right: [7.6, 0, 0] as V3 };
/** Inside one shop (relative to its pedestal). */
export const SHOP = {
  robot: [-1.45, 0, 0.75] as V3,
  box: [0.55, 0, -0.15] as V3,
  tray: [0.55, 0, 1.02] as V3,
  safe: [2.45, 0, -1.15] as V3,
  supplier: [-2.55, 0, -1.55] as V3,
  bowl: [0.5, 0, 0.25] as V3,
  thief: [-2.35, 0, 1.75] as V3,
  counter: [2.05, 0, 2.15] as V3,
};
/** Chapter 3: fixed on the left, Kibble on the right, the chain behind. */
export const DUEL = { fixed: [-4.4, 0, 0] as V3, kibble: [4.4, 0, 0] as V3, chain: [0, 0.55, -6.6] as V3, screens: [0, 12.6, 0] as V3 };
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ------------------------------------------------------------ chapters (which set is on screen)

export const CH = {
  one: [0, at("reveal")],
  reveal: [at("reveal"), at("box")],
  shop: [at("box"), at("test")],
  duel: [at("test"), at("proof")],
  end: [at("proof"), TOTAL],
} as const;
export const inCh = (f: number, c: keyof typeof CH) => f >= CH[c][0] - 2 && f < CH[c][1] + 2;
/** Dips to night that hide the cuts between sets. */
export const CUTS = [at("reveal"), at("box"), at("test"), at("proof")];

// ------------------------------------------------------------ camera

type Key = { f: number; pos: V3; tgt: V3; fov?: number; e?: (t: number) => number };
const k = (f: number, pos: V3, tgt: V3, fov = 35, e?: (t: number) => number): Key => ({ f, pos, tgt, fov, e });

const KEYS: Key[] = [
  // 1. the hook: a robot wakes in the dark and starts buying
  k(0, [0.9, 1.25, 4.9], [-0.35, 1.75, 0.4], 30),
  k(at("hook", 4.5), [-1.3, 2.0, 5.6], [0.2, 1.0, 0], 32),
  k(end("hook"), [-2.2, 2.6, 7.4], [0.5, 0.85, 0], 34),
  // the fixed limit lands
  k(w("limit", "fixed") - 20, [-1.6, 2.6, 7.0], [0.6, 0.8, 0.2], 34),
  k(end("limit"), [2.2, 3.0, 7.8], [0.7, 0.7, 0.1], 34),
  // three agents, one guess
  k(at("guess", 1.6), [0, 7.6, 19.5], [0, 0.6, 0], 40),
  k(w("guess", "great") + 10, [-5.4, 4.1, 10.4], [-7.4, 0.9, 0], 36),
  k(w("guess", "bad") - 10, [-4.6, 4.2, 10.6], [-7.2, 0.9, 0], 36),
  k(w("guess", "bad") + 25, [1.2, 4.1, 10.4], [0, 0.9, 0], 36),
  k(w("guess", "thief") - 10, [1.6, 4.2, 10.6], [0.2, 0.9, 0], 36),
  k(w("guess", "thief") + 25, [8.8, 4.1, 10.4], [7.6, 0.9, 0], 36),
  k(end("guess") - 50, [8.2, 4.3, 10.8], [7.4, 0.9, 0], 36),
  k(end("guess"), [0, 8.6, 21.5], [0, 0.4, 0], 40),
  // 2. the title: pellets fall one at a time
  k(at("reveal"), [0, 1.45, 4.9], [0, 0.95, 0], 30),
  k(end("reveal"), [0, 1.2, 3.8], [0, 0.85, 0], 30),
  // the locked box
  k(at("box"), [3.6, 2.5, 6.0], [0.5, 0.85, 0], 34),
  k(w("box", "open") - 10, [1.2, 2.1, 4.9], [0.2, 0.9, 0.1], 34),
  k(end("box"), [-1.2, 2.2, 5.2], [0.0, 0.9, 0.2], 34),
  // the tray, refilled by a sale
  k(at("tray", 0.4), [-0.6, 3.0, 5.4], [0.6, 0.5, 1.1], 34),
  k(end("tray"), [0.9, 3.1, 6.0], [0.9, 0.55, 1.3], 34),
  // the owner's safe
  k(at("safe", 0.3), [4.4, 3.0, 4.9], [1.6, 0.8, -0.6], 34),
  k(w("safe", "never") - 20, [3.6, 3.0, 5.4], [1.2, 0.8, -0.5], 36),
  k(end("safe"), [2.2, 3.4, 6.4], [0.6, 0.8, -0.3], 38),
  // the limit grows and shrinks
  k(at("grow", 0.3), [0.6, 3.6, 4.6], [0.55, 0.3, 0.9], 34),
  k(end("grow"), [-0.6, 3.2, 4.9], [0.55, 0.35, 0.9], 34),
  // the brakes
  k(at("brakes", 0.3), [0.4, 2.2, 3.9], [0.55, 1.0, 0], 32),
  k(end("brakes"), [1.7, 1.9, 3.6], [0.55, 1.0, 0], 32),
  // one number
  k(at("owner", 0.3), [6.2, 6.2, 8.0], [0.2, 0.4, 0], 36),
  k(end("owner"), [-5.8, 6.4, 8.2], [0.2, 0.4, 0], 36),
  // 3. the test on chain: from the chain down to the two shops
  k(at("test"), [0, 1.9, -2.6], [0, 0.7, -6.6], 42),
  k(w("test", "two") - 20, [0, 4.0, 5.5], [0, 0.4, -4.0], 42),
  k(w("test", "same") + 30, [0, 6.4, 14.2], [0, -0.2, 0], 40),
  k(end("test"), [0, 6.0, 13.6], [0, -0.2, 0], 40),
  k(end("busy"), [0.6, 5.8, 13.2], [0, -0.1, 0], 40),
  k(end("losing"), [-0.6, 5.8, 13.2], [0, -0.1, 0], 40),
  k(w("thief", "spending") - 30, [-0.2, 5.9, 13.4], [0, -0.1, 0], 40),
  k(w("thief", "spending") + 10, [-3.2, 3.6, 8.6], [-4.4, 0.6, 0], 38),
  k(w("thief", "kibble") - 2, [-3.0, 3.6, 8.4], [-4.4, 0.6, 0], 38),
  k(w("thief", "kibble") + 40, [3.6, 3.4, 8.2], [4.4, 0.7, 0], 38),
  k(w("thief", "locked") - 5, [5.6, 2.6, 6.6], [4.6, 1.0, 0], 36),
  k(end("thief") - 40, [5.2, 2.4, 6.0], [4.6, 1.0, 0], 36),
  // up to the screens: the real recordings
  k(end("thief") + 10, [0, 9.0, 13.0], [0, 9.0, 0], 40),
  k(at("real", 1.2), [-2.5, 12.6, 6.6], [-2.75, 12.6, 0], 38),
  k(w("real", "every") - 4, [-2.3, 12.6, 6.4], [-2.75, 12.6, 0], 38),
  k(w("real", "every") + 40, [2.5, 12.6, 6.6], [2.75, 12.6, 0], 38),
  k(w("real", "anyone") - 6, [2.3, 12.6, 6.4], [2.75, 12.6, 0], 38),
  k(end("real"), [0, 12.6, 11.0], [0, 12.6, 0], 38),
  // 4. proof and close: the Kibble shop at night
  k(at("proof"), [4.6, 1.9, 7.4], [-1.9, 1.0, 0], 32),
  k(end("proof"), [2.4, 1.8, 7.9], [-2.2, 1.0, 0], 32),
  k(at("close"), [-3.0, 2.6, 7.6], [0.4, 1.9, 0], 34),
  k(at("close", 7.5), [-0.6, 3.2, 9.6], [0.4, 2.0, 0], 36),
  k(TOTAL, [0, 3.6, 10.6], [0.4, 2.0, 0], 36),
];
/** Cuts: no interpolation across these frames (the camera jumps during the dip to night). */
const HARD = new Set(CUTS);
KEYS.sort((a, b) => a.f - b.f);

const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function camAt(f: number) {
  let i = 0;
  while (i < KEYS.length - 1 && KEYS[i + 1].f <= f) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const cut = [...HARD].some((c) => c > a.f && c < b.f && f < c);
  let t = b.f === a.f ? 0 : (b.e ?? EASE.inOut)(Math.min(1, Math.max(0, (f - a.f) / (b.f - a.f))));
  // a cut between two keys: hold a until the cut
  if (cut) t = 0;
  const pos = mix(a.pos, b.pos, t);
  const tgt = mix(a.tgt, b.tgt, t);
  const fov = (a.fov ?? 35) + ((b.fov ?? 35) - (a.fov ?? 35)) * t;
  // a slow, living drift
  pos[0] += Math.sin(f / 151) * 0.07;
  pos[1] += Math.sin(f / 113 + 1) * 0.05;
  tgt[1] += Math.sin(f / 173 + 2) * 0.02;
  return { pos, tgt, fov };
}

// ------------------------------------------------------------ projection for the labels over the picture

const cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
const v = new THREE.Vector3();
export function project(f: number, pt: V3) {
  const c = camAt(f);
  cam.position.set(...c.pos);
  cam.fov = c.fov;
  cam.updateProjectionMatrix();
  cam.lookAt(...c.tgt);
  cam.updateMatrixWorld();
  v.set(...pt).project(cam);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, front: v.z < 1 };
}

/** How dark the dip to night is at a frame (0 = clear, 1 = black). */
export const dip = (f: number) => Math.max(...CUTS.map((c) => (f < c ? p(f, c - 14, c, EASE.in) : 1 - p(f, c, c + 18, EASE.out))));
