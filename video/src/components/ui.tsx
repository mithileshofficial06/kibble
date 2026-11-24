import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { C, MONO, SANS, SERIF } from "../theme";
import { EASE, EASE_IO, lerp, prog, SCENES } from "../tl";

/* ------------------------------------------------------------------ type */

/** A headline whose words rise out of a mask, one after another. `*word*` is set in the serif italic, in saffron. */
export const Rise: React.FC<{
  text: string;
  at: number;
  size?: number;
  weight?: number;
  color?: string;
  accent?: string;
  stagger?: number;
  out?: number;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  style?: React.CSSProperties;
  dim?: number;
}> = ({ text, at, size = 96, weight = 300, color = C.fg, accent = C.saffron, stagger = 3, out, align = "left", lineHeight = 1.02, style, dim = 1 }) => {
  const f = useCurrentFrame();
  const lines = text.split("\n");
  let idx = 0;
  return (
    <div style={{ fontFamily: SANS, fontSize: size, fontWeight: weight, color, letterSpacing: "-0.045em", lineHeight, textAlign: align, opacity: dim, ...style }}>
      {lines.map((ln, li) => (
        <div key={li} style={{ display: "block", whiteSpace: "nowrap" }}>
          {ln.split(" ").map((w, wi) => {
            const i = idx++;
            const it = w.startsWith("*");
            const word = w.replace(/\*/g, "");
            const p = prog(f, at + i * stagger, at + i * stagger + 26);
            const o = out !== undefined ? prog(f, out + i * 1.5, out + i * 1.5 + 18, EASE_IO) : 0;
            const y = (1 - p) * 105 - o * 105;
            return (
              <span key={wi} style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.04em 0.14em", margin: "-0.06em 0 -0.14em", verticalAlign: "top" }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${y}%) rotate(${(1 - p) * 4}deg)`,
                    transformOrigin: "0 100%",
                    fontFamily: it ? SERIF : SANS,
                    fontStyle: it ? "italic" : "normal",
                    fontWeight: it ? 400 : weight,
                    color: it ? accent : color,
                    letterSpacing: it ? "-0.02em" : undefined,
                    fontSize: it ? "1.1em" : undefined,
                    lineHeight: it ? 0.9 : undefined,
                  }}
                >
                  {word}
                </span>
                {wi < ln.split(" ").length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Mono, tracked, uppercase label. */
export const Label: React.FC<{ children: React.ReactNode; color?: string; dot?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.muted, dot, size = 15, style }) => (
  <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: "0.2em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap", ...style }}>
    {dot && <span style={{ width: 8, height: 8, borderRadius: 9, background: dot, boxShadow: `0 0 12px ${dot}` }} />}
    {children}
  </div>
);

/** Fade + rise in at `at`, optional fade out at `out`. */
export const Appear: React.FC<{ at: number; out?: number; dy?: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties; blur?: boolean }> = ({ at, out, dy = 24, dur = 24, children, style, blur }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, at + dur);
  const o = out !== undefined ? prog(f, out, out + 16, EASE_IO) : 0;
  return (
    <div style={{ opacity: p * (1 - o), transform: `translateY(${(1 - p) * dy - o * 10}px)`, filter: blur ? `blur(${(1 - p) * 10}px)` : undefined, ...style }}>
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------ numbers */

/** A rolling odometer. Every digit column spins like a mechanical counter. */
export const Odometer: React.FC<{ value: number; decimals?: number; size: number; weight?: number; color?: string; prefix?: string; style?: React.CSSProperties; comma?: boolean }> = ({ value, decimals = 0, size, weight = 200, color = C.fg, prefix = "", style, comma }) => {
  const scale = Math.pow(10, decimals);
  const v = Math.max(0, value) * scale;
  const intDigits = Math.max(1, Math.floor(Math.max(1, value)).toString().length);
  const total = intDigits + decimals;
  const cols: React.ReactNode[] = [];
  for (let k = total - 1; k >= 0; k--) {
    const pos = (v / Math.pow(10, k)) % 10;
    // only the last column rolls continuously; higher columns roll as the one below passes 9 → 0
    const lower = (v % Math.pow(10, k)) / Math.pow(10, k);
    const d = Math.floor(pos);
    const roll = k === 0 ? pos : d + (lower > 0.9 ? (lower - 0.9) * 10 : 0);
    cols.push(
      <span key={k} style={{ display: "inline-block", height: "1em", overflow: "hidden", verticalAlign: "top", width: "0.6em", textAlign: "center" }}>
        <span style={{ display: "block", transform: `translateY(${-roll}em)` }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => (
            <span key={i} style={{ display: "block", height: "1em", lineHeight: "1em" }}>{n}</span>
          ))}
        </span>
      </span>,
    );
    if (k === decimals && decimals > 0) cols.push(<span key="dot" style={{ display: "inline-block", width: "0.28em" }}>.</span>);
    if (comma && k > decimals && (k - decimals) % 3 === 0) cols.push(<span key={`c${k}`} style={{ display: "inline-block", width: "0.26em" }}>,</span>);
  }
  return (
    <span style={{ fontFamily: SANS, fontSize: size, fontWeight: weight, color, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", display: "inline-flex", ...style }}>
      {prefix}
      {cols}
    </span>
  );
};

/* ------------------------------------------------------------------ cards */

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; accent?: string }> = ({ children, style, accent }) => (
  <div
    style={{
      background: "linear-gradient(180deg, rgba(28,22,34,0.92), rgba(18,14,22,0.92))",
      border: `1px solid ${C.line2}`,
      borderRadius: 18,
      boxShadow: `0 40px 120px rgba(0,0,0,0.55)${accent ? `, 0 0 0 1px ${accent}22, 0 0 80px ${accent}1a` : ""}`,
      padding: "26px 30px",
      position: "relative",
      ...style,
    }}
  >
    {accent && <div style={{ position: "absolute", left: 30, right: 30, top: -1, height: 2, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
    {children}
  </div>
);

/** State pill, as in the app. */
export const Pill: React.FC<{ state: "Healthy" | "Watch" | "Braked" | "Paused" | "Learning"; size?: number; glow?: number }> = ({ state, size = 15, glow = 0 }) => {
  const col = { Healthy: C.mint, Watch: C.saffron, Braked: C.amber, Paused: C.coral, Learning: C.muted }[state];
  const solid = state === "Paused" || state === "Healthy";
  return (
    <span
      style={{
        fontFamily: MONO, fontSize: size, letterSpacing: "0.16em", textTransform: "uppercase", padding: `${size * 0.4}px ${size * 0.9}px`, borderRadius: 99,
        background: solid ? col : "transparent", color: solid ? "#120c0a" : col, border: `1.5px solid ${col}`, display: "inline-flex", alignItems: "center", gap: size * 0.5,
        boxShadow: glow ? `0 0 ${40 * glow}px ${col}` : undefined, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: size * 0.45, height: size * 0.45, borderRadius: 9, background: solid ? "#120c0a" : col }} />
      {state}
    </span>
  );
};

/* ------------------------------------------------------------------ chrome */

const CHAPTERS = ["The problem", "The idea", "Live on Aevum", "The proof"];

/** Frame furniture: corner ticks, the wordmark, the chapter, the network. */
export const Chrome: React.FC<{ frame: number; visible: number; chapter: number }> = ({ visible, chapter }) => {
  const tick = (s: React.CSSProperties, r: number) => (
    <div style={{ position: "absolute", width: 22, height: 22, borderTop: `1.5px solid ${C.line2}`, borderLeft: `1.5px solid ${C.line2}`, transform: `rotate(${r}deg)`, ...s }} />
  );
  return (
    <AbsoluteFill style={{ opacity: visible, pointerEvents: "none" }}>
      {tick({ left: 40, top: 40 }, 0)}
      {tick({ right: 40, top: 40 }, 90)}
      {tick({ right: 40, bottom: 40 }, 180)}
      {tick({ left: 40, bottom: 40 }, 270)}
      <div style={{ position: "absolute", left: 74, top: 50, fontFamily: SANS, fontWeight: 600, fontSize: 24, color: C.fg, letterSpacing: "-0.04em" }}>
        kibble<span style={{ color: C.saffron }}>.</span>
      </div>
      <div style={{ position: "absolute", right: 74, top: 56, display: "flex", gap: 18, alignItems: "center" }}>
        <Label size={13} color={C.saffron}>{`0${chapter}`}</Label>
        <Label size={13} color={C.muted}>{CHAPTERS[chapter - 1]}</Label>
      </div>
      <div style={{ position: "absolute", left: 74, bottom: 52 }}>
        <Label size={12} color={C.faint} dot={C.mint}>QDay Aevum testnet · chain 44005</Label>
      </div>
      <div style={{ position: "absolute", right: 74, bottom: 56, display: "flex", gap: 6 }}>
        {[1, 2, 3, 4].map((c) => (
          <div key={c} style={{ width: c === chapter ? 34 : 14, height: 3, borderRadius: 3, background: c === chapter ? C.saffron : c < chapter ? C.fg2 : C.line2 }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ captions */

/** Word-by-word captions: spoken words light up, the rest of the line waits in shadow. */
export const Captions: React.FC<{ frame: number; lift?: number }> = ({ frame, lift = 0 }) => {
  const sc = SCENES.find((s) => frame >= s.from && frame < s.from + s.frames);
  if (!sc) return null;
  const f = frame - sc.from;
  const line = sc.captions.find((l) => f >= l.f - 4 && f < l.e);
  if (!line) return null;
  const pin = prog(f, line.f - 4, line.f + 8);
  const pout = prog(f, line.e - 8, line.e, EASE_IO);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 260, background: "linear-gradient(180deg, rgba(16,12,20,0) 0%, rgba(16,12,20,0.72) 70%)" }} />
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 104 + lift, textAlign: "center", fontFamily: SANS, fontSize: 34, fontWeight: 400, letterSpacing: "-0.012em",
          opacity: pin * (1 - pout), transform: `translateY(${(1 - pin) * 10}px)`,
        }}
      >
        {line.toks.map((t, i) => {
          const on = prog(f, t.f - 2, t.f + 6);
          return (
            <span key={i} style={{ color: `rgba(237,232,227,${lerp(0.3, 1, on)})`, textShadow: "0 2px 24px rgba(0,0,0,0.6)" }}>
              {t.c}
              {i < line.toks.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ transition */

/**
 * The chapter wipe: the app's grain-pour hover, full screen. A dot grid pours up, solid saffron follows, the
 * chapter title rises, then everything drains up and away. Lasts 84 frames; the cut sits at frame 42.
 */
export const PourWipe: React.FC<{ num: string; title: string }> = ({ num, title }) => {
  const f = useCurrentFrame();
  const up1 = prog(f, 0, 26, EASE_IO);
  const up2 = prog(f, 8, 34, EASE_IO);
  const away = prog(f, 56, 82, EASE_IO);
  const dots =
    "radial-gradient(circle at 50% 50%, rgba(255,176,0,0.95) 0 2.2px, transparent 2.6px) 0 0 / 14px 14px, radial-gradient(circle at 50% 50%, rgba(255,200,80,0.6) 0 1.6px, transparent 2px) 7px 7px / 14px 14px";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: dots, clipPath: `inset(${(1 - up1) * 100}% 0 ${away * 100}% 0)` }} />
      <AbsoluteFill style={{ background: C.saffron, clipPath: `inset(${(1 - up2) * 100}% 0 ${prog(f, 50, 78, EASE_IO) * 100}% 0)` }}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 22 }}>
          <Label size={18} color="#120c0a" style={{ opacity: prog(f, 22, 34) * (1 - prog(f, 48, 56)) }}>{num}</Label>
          <Rise text={title} at={20} out={48} size={150} weight={300} color="#120c0a" accent="#120c0a" align="center" />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ footage */

export type Cam = { f: number; s: number; x: number; y: number };
/** Camera inside the browser: focus point (CSS px of the 1600x900 viewport) and zoom, eased between keys. */
const camAt = (keys: Cam[], f: number) => {
  if (f <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (f <= b.f) {
      const t = interpolate(f, [a.f, b.f], [0, 1], { easing: EASE_IO });
      return { f, s: lerp(a.s, b.s, t), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    }
  }
  return keys[keys.length - 1];
};

/** A floating browser window showing a real recording, with a camera that can push in on details. */
export const Browser: React.FC<{
  clip: string;
  startFrom?: number;
  cam?: Cam[];
  title: string;
  w?: number;
  rotY?: number;
  rotX?: number;
  chip?: React.ReactNode;
  style?: React.CSSProperties;
  dim?: number;
}> = ({ clip, startFrom = 0, cam = [{ f: 0, s: 1, x: 800, y: 450 }], title, w = 1500, rotY = 0, rotX = 0, chip, style, dim = 0 }) => {
  const f = useCurrentFrame();
  const k = camAt(cam, f);
  const scale = w / 1600;
  const vh = 900 * scale;
  return (
    <div style={{ perspective: 2600, ...style }}>
      <div
        style={{
          width: w, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line2}`, background: C.bg,
          boxShadow: "0 70px 160px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4), 0 0 140px rgba(255,176,0,0.07)",
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`, transformStyle: "preserve-3d",
        }}
      >
        <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 18px", gap: 8, background: "#17121c", borderBottom: `1px solid ${C.line}` }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 9, background: C.line2 }} />
          ))}
          <div style={{ marginLeft: 18, fontFamily: MONO, fontSize: 13, color: C.muted, letterSpacing: "0.06em" }}>{title}</div>
          <div style={{ marginLeft: "auto" }}>{chip}</div>
        </div>
        <div style={{ width: w, height: vh, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1600, height: 900, transformOrigin: "0 0", transform: `scale(${scale}) translate(${800 - k.x * k.s}px, ${450 - k.y * k.s}px) scale(${k.s})` }}>
            <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} startFrom={startFrom} style={{ width: 1600, height: 900 }} muted />
          </div>
          {dim > 0 && <AbsoluteFill style={{ background: `rgba(16,12,20,${dim})` }} />}
        </div>
      </div>
    </div>
  );
};

/** Chip shown on the browser bar. */
export const Chip: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.mint }) => (
  <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color, border: `1px solid ${color}55`, borderRadius: 99, padding: "5px 12px", display: "flex", alignItems: "center", gap: 8, background: `${color}10` }}>
    <span style={{ width: 7, height: 7, borderRadius: 8, background: color, boxShadow: `0 0 10px ${color}` }} />
    {children}
  </div>
);

/** A pointer that glides to a spot and clicks (with a saffron ring). Coordinates in the parent's pixels. */
export const Cursor: React.FC<{ path: { f: number; x: number; y: number }[]; click?: number }> = ({ path, click }) => {
  const f = useCurrentFrame();
  let x = path[0].x, y = path[0].y;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (f >= a.f) {
      const t = interpolate(f, [a.f, b.f], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
      x = lerp(a.x, b.x, t);
      y = lerp(a.y, b.y, t);
    }
  }
  const press = click !== undefined ? prog(f, click, click + 5) * (1 - prog(f, click + 5, click + 12)) : 0;
  const ring = click !== undefined ? prog(f, click, click + 30) : 0;
  const vis = prog(f, path[0].f - 10, path[0].f);
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: vis, pointerEvents: "none" }}>
      {click !== undefined && f >= click && (
        <div style={{ position: "absolute", left: -40 * ring, top: -40 * ring, width: 80 * ring, height: 80 * ring, borderRadius: 999, border: `2px solid ${C.saffron}`, opacity: 1 - ring }} />
      )}
      <svg width="30" height="36" viewBox="0 0 30 36" style={{ transform: `scale(${1 - press * 0.15})`, transformOrigin: "0 0", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.6))" }}>
        <path d="M2 2 L2 28 L9 21.5 L14 33 L19 31 L14 19.5 L24 19.5 Z" fill="#ede8e3" stroke="#100c14" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export { EASE, prog };
