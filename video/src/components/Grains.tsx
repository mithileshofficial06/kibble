import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import * as THREE from "three";
import { H, W } from "../theme";

/** World units: the camera at z=10 with a 30° vertical FOV sees 5.359 units of height at z=0. */
export const VIEW_H = 2 * 10 * Math.tan((15 * Math.PI) / 180);
export const PX = VIEW_H / H; // world units per pixel at z = 0
export const toWorld = (x: number, y: number): [number, number] => [(x - W / 2) * PX, -(y - H / 2) * PX];

export type Grain = {
  from: [number, number, number];
  to: [number, number, number];
  delay: number;
  size: number;
  hue: number;
  seed: number;
  out?: [number, number, number];
};

const vert = /* glsl */ `
attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aOut;
attribute float aDelay; attribute float aSize; attribute float aSeed; attribute float aHue;
uniform float uT; uniform float uDur; uniform float uOut; uniform float uFocus; uniform float uPx; uniform float uShimmer; uniform float uArc;
varying float vA; varying float vBlur; varying float vHue; varying float vHot;
void main(){
  float k = clamp((uT - aDelay) / uDur, 0., 1.);
  vec3 p;
  float e = 1. - pow(1. - k, 2.2);
  p.xz = mix(aFrom.xz, aTo.xz, e);
  p.y = mix(aFrom.y, aTo.y, k * k);
  p.y += uArc * sin(k * 3.14159) * (0.4 + aSeed);
  float tl = max(0., uT - aDelay - uDur);
  p.y += step(1., k) * .045 * abs(sin(tl * 11.)) * exp(-tl * 6.);
  p += uShimmer * .018 * vec3(sin(uT*1.7 + aSeed*40.), cos(uT*1.3 + aSeed*31.), 0.);
  float o = clamp((uOut - aSeed * .35) / .65, 0., 1.);
  o = o * o * (3. - 2. * o);
  p = mix(p, aOut, o);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float depth = -mv.z;
  vBlur = clamp(abs(depth - uFocus) * .55, 0., 3.);
  gl_PointSize = aSize * uPx / depth * (1. + vBlur * 1.6);
  vA = (1. / (1. + vBlur * vBlur * 2.2)) * step(aDelay, uT);
  vHue = aHue;
  vHot = 1. - smoothstep(0., .25, tl) * .6;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
precision highp float;
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uCoral; uniform float uAlpha;
varying float vA; varying float vBlur; varying float vHue; varying float vHot;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float soft = .18 + vBlur * .35;
  float disc = 1. - smoothstep(1. - soft, 1., d);
  float glow = exp(-d * d * 2.5) * .35;
  if (disc + glow <= .002) discard;
  vec3 base = mix(uC1, uC2, vHue);
  base = mix(base, uC3, uCoral);
  float core = exp(-d * d * 5.) * (.35 + .25 * vHot);
  vec3 col = base * (.85 + core) + vec3(1., .95, .85) * core * .5 * (1. - uCoral * .5);
  gl_FragColor = vec4(col, (disc * .9 + glow) * vA * uAlpha);
}`;

/**
 * A field of glowing grains, animated entirely in the vertex shader (GPU): each grain falls from `from` to `to`
 * starting at `delay`, lands with a little bounce, shimmers, and can be blown out to `out`. Depth of field: grains
 * away from `focus` (distance from the camera) grow and soften into bokeh.
 */
export const GrainField: React.FC<{
  grains: Grain[];
  t: number;
  dur?: number;
  out?: number;
  focus?: number;
  shimmer?: number;
  coral?: number;
  alpha?: number;
  arc?: number;
  camZ?: number;
  camX?: number;
  camY?: number;
  rotY?: number;
  colors?: [string, string, string];
  style?: React.CSSProperties;
}> = ({ grains, t, dur = 1.1, out = 0, focus = 10, shimmer = 1, coral = 0, alpha = 1, arc = 0, camZ = 10, camX = 0, camY = 0, rotY = 0, colors = ["#ffb000", "#ffc94a", "#ff4d3d"], style }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = grains.length;
    const f = (k: (x: Grain) => number[], size: number) => {
      const a = new Float32Array(n * size);
      grains.forEach((x, i) => a.set(k(x), i * size));
      return new THREE.BufferAttribute(a, size);
    };
    g.setAttribute("position", f((x) => x.to, 3));
    g.setAttribute("aFrom", f((x) => x.from, 3));
    g.setAttribute("aTo", f((x) => x.to, 3));
    g.setAttribute("aOut", f((x) => x.out ?? x.to, 3));
    g.setAttribute("aDelay", f((x) => [x.delay], 1));
    g.setAttribute("aSize", f((x) => [x.size], 1));
    g.setAttribute("aSeed", f((x) => [x.seed], 1));
    g.setAttribute("aHue", f((x) => [x.hue], 1));
    return g;
  }, [grains]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uT: { value: 0 }, uDur: { value: 1 }, uOut: { value: 0 }, uFocus: { value: 10 }, uPx: { value: (H / VIEW_H) * 10 },
          uShimmer: { value: 1 }, uArc: { value: 0 }, uCoral: { value: 0 }, uAlpha: { value: 1 },
          uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() },
        },
      }),
    [],
  );
  const u = mat.uniforms;
  u.uT.value = t;
  u.uDur.value = dur;
  u.uOut.value = out;
  u.uFocus.value = focus;
  u.uShimmer.value = shimmer;
  u.uArc.value = arc;
  u.uCoral.value = coral;
  u.uAlpha.value = alpha;
  (u.uC1.value as THREE.Color).set(colors[0]);
  (u.uC2.value as THREE.Color).set(colors[1]);
  (u.uC3.value as THREE.Color).set(colors[2]);
  return (
    <ThreeCanvas
      linear
      flat
      width={W}
      height={H}
      style={{ position: "absolute", inset: 0, ...style }}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
      camera={{ fov: 30, position: [camX, camY, camZ], near: 0.1, far: 100 }}
    >
      <group rotation={[0, rotY, 0]}>
        <points geometry={geo} material={mat} frustumCulled={false} />
      </group>
    </ThreeCanvas>
  );
};

/** Deterministic random numbers. */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Points inside the glyphs of `text`, sampled from a canvas, in pixels relative to the centre. */
export function sampleText(text: string, font: string, step: number, w = 1800, h = 600) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  const d = g.getImageData(0, 0, w, h).data;
  const pts: [number, number][] = [];
  let row = 0;
  for (let y = 0; y < h; y += step, row++)
    for (let x = 0; x < w; x += step) {
      const jx = Math.floor(x + (row % 2) * step * 0.5);
      if (jx < w && d[(y * w + jx) * 4 + 3] > 128) pts.push([jx - w / 2, y - h / 2]);
    }
  return pts;
}
