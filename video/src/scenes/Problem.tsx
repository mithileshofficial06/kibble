import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { Appear, Label, Odometer, Rise } from "../components/ui";
import { GrainField, Grain, rng } from "../components/Grains";
import { C, MONO, SANS, SERIF } from "../theme";
import { EASE_IO, FPS, lerp, prog, scene, wf } from "../tl";

/* ================================================================== hook */
/** An agent node sends grains of money to the things it buys. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const S = "hook";
  const orb = { x: 700, y: 610 };
  const dests = [
    { x: 1430, y: 360, label: "Data", at: wf(S, "data") },
    { x: 1560, y: 600, label: "Model calls", at: wf(S, "model") },
    { x: 1430, y: 840, label: "Other agents' work", at: wf(S, "other") },
  ];
  const flowStart = wf(S, "spend");
  const born = prog(f, 40, 110);
  // the very first grain falls into the orb in the dark
  const drop = prog(f, 0, 50, EASE_IO);
  const ownIt = wf(S, "on");
  const own = prog(f, ownIt, ownIt + 30);

  const packets = [];
  for (let i = 0; i < 160; i++) {
    const s = flowStart + i * 3.2;
    const d = dests[i % 3];
    if (f < s || f > s + 46 || s < d.at - 8) continue;
    const t = EASE_IO((f - s) / 46);
    const mx = (orb.x + d.x) / 2, my = Math.min(orb.y, d.y) - 120 + (i % 5) * 18;
    const x = (1 - t) * (1 - t) * orb.x + 2 * (1 - t) * t * mx + t * t * d.x;
    const y = (1 - t) * (1 - t) * orb.y + 2 * (1 - t) * t * my + t * t * d.y;
    packets.push(<div key={i} style={{ position: "absolute", left: x - 5, top: y - 5, width: 10, height: 10, borderRadius: 10, background: C.saffron, boxShadow: `0 0 18px ${C.saffron}, 0 0 4px #fff8` }} />);
  }
  return (
    <AbsoluteFill>
      {/* the falling grain */}
      {f < 60 && <div style={{ position: "absolute", left: orb.x - 6, top: lerp(-40, orb.y - 6, drop), width: 12, height: 12, borderRadius: 12, background: C.saffron, boxShadow: `0 0 24px ${C.saffron}` }} />}
      {/* the agent */}
      <div style={{ position: "absolute", left: orb.x, top: orb.y, opacity: born }}>
        {[0, 1, 2].map((k) => {
          const r = 70 + k * 46;
          const pulse = ((f + k * 26) % 90) / 90;
          return <div key={k} style={{ position: "absolute", left: -r, top: -r, width: r * 2, height: r * 2, borderRadius: 999, border: `1px solid rgba(255,176,0,${0.28 - k * 0.07 - pulse * 0.1})`, transform: `scale(${0.9 + born * 0.1 + pulse * 0.04})` }} />;
        })}
        <div style={{ position: "absolute", left: -46, top: -46, width: 92, height: 92, borderRadius: 99, background: `radial-gradient(circle at 40% 35%, #ffe2a0, ${C.saffron} 45%, #b36b00 100%)`, boxShadow: `0 0 80px ${C.saffron}88, 0 0 160px ${C.saffron}44`, transform: `scale(${born})` }} />
        <div style={{ position: "absolute", left: -140, top: 200, width: 280, textAlign: "center" }}>
          <Label size={14} color={C.fg2}>AI agent</Label>
        </div>
        <div style={{ position: "absolute", left: -140, top: 230, width: 280, display: "flex", justifyContent: "center", opacity: own }}>
          <Label size={13} color={C.coral} dot={C.coral}>no human in the loop</Label>
        </div>
      </div>
      {packets}
      {dests.map((d, i) => {
        const p = prog(f, d.at - 6, d.at + 20);
        return (
          <div key={i} style={{ position: "absolute", left: d.x - 26, top: d.y - 26, opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, border: `1px solid ${C.line2}`, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: C.fg2, transform: "rotate(45deg)" }} />
            </div>
            <div style={{ position: "absolute", left: 74, top: 8, fontFamily: SANS, fontSize: 30, color: C.fg, fontWeight: 300, whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>{d.label}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 140, top: 150 }}>
        <Rise text={"Your AI agent can\n*spend* money now."} at={wf(S, "your") - 4} size={92} />
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== guess */
export const Guess: React.FC = () => {
  const f = useCurrentFrame();
  const S = "guess";
  const lim = wf(S, "limit");
  const fifty = wf(S, "fifty");
  const g = wf(S, "guess");
  const three = wf(S, "three");
  const line = prog(f, lim, lim + 40, EASE_IO);
  const num = prog(f, fifty - 6, fifty + 24);
  const shrink = prog(f, g - 4, g + 30, EASE_IO);
  const agents = prog(f, three, three + 30);
  const exit = prog(f, scene(S).frames - 24, scene(S).frames, EASE_IO);
  return (
    <AbsoluteFill style={{ opacity: 1 - exit }}>
      {/* the cap line */}
      <div style={{ position: "absolute", left: 140, top: 520, width: 1640 * line, height: 2, background: C.fg2 }} />
      <div style={{ position: "absolute", left: 140, top: 480, opacity: line }}>
        <Label size={14} color={C.fg2}>Fixed limit · set once · refilled daily</Label>
      </div>
      <div style={{ position: "absolute", left: 140, top: 120, transform: `scale(${lerp(1, 0.62, shrink)})`, transformOrigin: "0 0", opacity: num }}>
        <span style={{ fontFamily: SANS, fontWeight: 100, fontSize: 340, color: C.fg, letterSpacing: "-0.06em", lineHeight: 1 }}>$50</span>
        <span style={{ fontFamily: MONO, fontSize: 34, color: C.muted, marginLeft: 18, letterSpacing: "0.1em" }}>/ DAY</span>
      </div>
      <div style={{ position: "absolute", left: 980, top: 300 }}>
        <Rise text={"A fixed limit\nis a *guess.*"} at={g - 30} size={104} />
      </div>
      {/* three agents, one rule */}
      <div style={{ position: "absolute", left: 140, top: 600, display: "flex", gap: 40, opacity: agents }}>
        {["Winning", "Losing", "Hijacked"].map((n, i) => {
          const p = prog(f, three + i * 8, three + i * 8 + 24);
          return (
            <div key={n} style={{ width: 520, padding: "26px 28px", border: `1px solid ${C.line2}`, borderRadius: 16, background: "rgba(255,255,255,0.02)", transform: `translateY(${(1 - p) * 40}px)`, opacity: p }}>
              <Label size={13} color={C.muted}>{`Agent 0${i + 1}`}</Label>
              <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 300, color: C.fg, marginTop: 14, letterSpacing: "-0.02em" }}>{n}?</div>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1, height: 2, background: C.fg2 }} />
                <span style={{ fontFamily: MONO, fontSize: 16, color: C.fg2 }}>$50 / day</span>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== three */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const Three: React.FC = () => {
  const f = useCurrentFrame();
  const S = "three";
  const cols = [
    { name: "Winning", color: C.mint, at: wf(S, "winning"), note: "Hits the cap. Turns customers away." },
    { name: "Losing", color: C.amber, at: wf(S, "losing"), note: "Burns the full limit, every day." },
    { name: "Hijacked", color: C.coral, at: wf(S, "hijacked"), note: "Pays the attacker, every day." },
  ];
  const human = wf(S, "human");
  const enter = prog(f, 0, 30);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 128, opacity: enter }}>
        <Label size={14} color={C.muted}>Same fixed limit · $50 / day · three agents</Label>
      </div>
      <div style={{ position: "absolute", left: 140, top: 200, display: "flex", gap: 36 }}>
        {cols.map((c, ci) => {
          const on = prog(f, c.at - 10, c.at + 20);
          const focus = ci === 2 ? 1 : 1 - 0.45 * prog(f, cols[ci + 1].at - 6, cols[ci + 1].at + 16);
          const dayLen = 22;
          const capY = 210; // px from chart top
          const chartH = 380;
          let counter = 0;
          return (
            <div key={c.name} style={{ width: 528, opacity: Math.max(0.12, on) * (0.25 + 0.75 * focus), transform: `translateY(${(1 - on) * 30}px)` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontFamily: SANS, fontSize: 46, fontWeight: 300, color: C.fg, letterSpacing: "-0.03em" }}>{c.name}</div>
                <Label size={13} color={c.color} dot={c.color}>{`0${ci + 1}`}</Label>
              </div>
              <div style={{ marginTop: 18, height: chartH, position: "relative", borderBottom: `1px solid ${C.line2}` }}>
                {/* the fixed cap */}
                <div style={{ position: "absolute", left: 0, right: 0, top: capY, height: 2, background: C.fg2 }} />
                <div style={{ position: "absolute", right: 0, top: capY - 26 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.fg2, letterSpacing: "0.12em" }}>CAP $50</span>
                </div>
                {DAYS.map((d, i) => {
                  const p = prog(f, c.at + 8 + i * dayLen, c.at + 8 + i * dayLen + 18);
                  const capH = chartH - capY;
                  let bar: React.ReactNode;
                  if (ci === 0) {
                    const demand = capH * (0.75 + i * 0.22);
                    const served = Math.min(demand, capH);
                    const away = Math.max(0, demand - capH);
                    counter += away * p * 0.9;
                    bar = (
                      <>
                        <div style={{ position: "absolute", bottom: 0, width: "100%", height: served * p, background: `${c.color}cc`, borderRadius: "4px 4px 0 0" }} />
                        <div style={{ position: "absolute", bottom: served, width: "100%", height: away * p, borderRadius: "4px 4px 0 0", background: `repeating-linear-gradient(135deg, ${C.muted}55 0 3px, transparent 3px 8px)`, border: `1px dashed ${C.muted}88`, borderBottom: "none" }} />
                      </>
                    );
                  } else {
                    const h = capH * p;
                    counter += 50 * p;
                    bar = <div style={{ position: "absolute", bottom: 0, width: "100%", height: h, background: ci === 1 ? `linear-gradient(180deg, ${c.color}, ${c.color}88)` : `linear-gradient(180deg, ${c.color}, ${c.color}77)`, borderRadius: "4px 4px 0 0", boxShadow: ci === 2 && p > 0.9 ? `0 0 26px ${c.color}66` : undefined }} />;
                  }
                  return (
                    <div key={d} style={{ position: "absolute", left: i * 74 + 6, bottom: 0, width: 50, height: chartH }}>
                      <div style={{ position: "absolute", bottom: 0, width: "100%", height: "100%" }}>{bar}</div>
                      <div style={{ position: "absolute", bottom: -30, width: "100%", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.faint, letterSpacing: "0.1em" }}>{d.toUpperCase()}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 52, display: "flex", alignItems: "baseline", gap: 14 }}>
                {ci === 0 ? (
                  <>
                    <Odometer value={counter} size={64} color={C.fg} />
                    <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted, letterSpacing: "0.12em" }}>CUSTOMERS TURNED AWAY</span>
                  </>
                ) : (
                  <>
                    <Odometer value={counter} size={64} prefix="−$" color={c.color} />
                    <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted, letterSpacing: "0.12em" }}>{ci === 1 ? "LOST THIS WEEK" : "TO THE ATTACKER"}</span>
                  </>
                )}
              </div>
              <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 24, color: C.fg2, fontWeight: 300 }}>{c.note}</div>
              {ci === 2 && (
                <div style={{ marginTop: 18, opacity: prog(f, human - 20, human + 10) }}>
                  <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.14em", color: C.coral, border: `1px solid ${C.coral}66`, padding: "7px 12px", borderRadius: 8, opacity: 0.5 + 0.5 * Math.round(((f / 14) % 2)) }}>
                    ⚠ ALERT · 7 UNREAD
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== wallet */
export const Wallet: React.FC = () => {
  const f = useCurrentFrame();
  const S = "wallet";
  const guard = wf(S, "guard");
  const live = wf(S, "live");
  const move = wf(S, "move");
  const typed = "Stay within budget.";
  const typeStart = wf(S, "stay") - 6;
  const n = Math.floor(interpolate(f, [typeStart, typeStart + 40], [0, typed.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const strike = prog(f, guard - 8, guard + 14, EASE_IO);
  const away = prog(f, live - 30, live + 4, EASE_IO);
  const chart = prog(f, move - 6, move + 110, EASE_IO);
  // performance curve and a limit that follows it
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40;
    const perf = 0.45 + 0.28 * Math.sin(x * 5.2 + 0.4) + 0.12 * Math.sin(x * 13.1) - (x > 0.7 ? (x - 0.7) * 1.2 : 0);
    return { x, perf };
  });
  const W = 1000, Hh = 300;
  const perfPath = pts.map((p, i) => `${i ? "L" : "M"}${p.x * W},${Hh - p.perf * Hh}`).join(" ");
  let lim = 0.4;
  const limPath = pts
    .map((p, i) => {
      if (i % 4 === 0) lim = Math.max(0.12, Math.min(0.85, lim + (p.perf - lim) * 0.6));
      return `${i ? "L" : "M"}${p.x * W},${Hh - lim * Hh}`;
    })
    .join(" ");
  return (
    <AbsoluteFill>
      {/* the prompt */}
      <div style={{ position: "absolute", left: 140, top: 190, width: 760, opacity: 1 - away * 0.85, transform: `translateY(${away * 40}px) scale(${1 - away * 0.08})`, transformOrigin: "0 0" }}>
        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 16, background: "rgba(28,22,34,0.85)", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.5)" }}>
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between" }}>
            <Label size={12} color={C.muted}>system prompt</Label>
            <Label size={12} color={C.faint}>agent.md</Label>
          </div>
          <div style={{ padding: "28px 26px", fontFamily: MONO, fontSize: 26, lineHeight: 1.7, color: C.fg2 }}>
            <div style={{ color: C.faint }}>You are a purchasing agent.</div>
            <div style={{ color: C.faint }}>Buy what the task needs.</div>
            <div style={{ position: "relative", display: "inline-block", color: C.fg }}>
              {typed.slice(0, n)}
              {n < typed.length && <span style={{ opacity: Math.round((f / 8) % 2), color: C.saffron }}>▍</span>}
              <div style={{ position: "absolute", left: -6, right: -6, top: "54%", height: 3, background: C.coral, transform: `scaleX(${strike})`, transformOrigin: "0 50%", boxShadow: `0 0 14px ${C.coral}` }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 22, opacity: strike }}>
          <Label size={14} color={C.coral} dot={C.coral}>A sentence is not a guard</Label>
        </div>
      </div>
      {/* the wallet line */}
      <div style={{ position: "absolute", left: 1000, top: 200 }}>
        <Rise text={"The limit has to\nlive in the *wallet.*"} at={live - 26} size={84} />
      </div>
      <div style={{ position: "absolute", left: 1000, top: 520, opacity: prog(f, move - 10, move + 20) }}>
        <svg width={W} height={Hh + 40} style={{ overflow: "visible" }}>
          {[0, 1, 2, 3].map((k) => (
            <line key={k} x1={0} x2={W} y1={k * (Hh / 3)} y2={k * (Hh / 3)} stroke={C.line} />
          ))}
          <path d={perfPath} fill="none" stroke={C.fg2} strokeWidth={2} strokeDasharray={1400} strokeDashoffset={1400 * (1 - chart)} opacity={0.6} />
          <path d={limPath} fill="none" stroke={C.saffron} strokeWidth={4} strokeDasharray={1600} strokeDashoffset={1600 * (1 - chart)} style={{ filter: `drop-shadow(0 0 8px ${C.saffron})` }} />
        </svg>
        <div style={{ display: "flex", gap: 40, marginTop: 6 }}>
          <Label size={13} color={C.fg2}>— how the agent performs</Label>
          <Label size={13} color={C.saffron}>— its limit, following</Label>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== reveal */
/** Grains rain out of the dark and lock into the wordmark (GPU). */
export const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const S = "reveal";
  const grains = useMemo(() => wordmarkGrains(11), []);
  const tag = wf(S, "the");
  const t = f / FPS;
  const dolly = interpolate(f, [0, scene(S).frames], [10.6, 9.6]);
  const exit = prog(f, scene(S).frames - 30, scene(S).frames, EASE_IO);
  return (
    <AbsoluteFill>
      <GrainField grains={grains} t={t} dur={1.25} camZ={dolly} camY={-0.12} focus={dolly} out={exit * 1.2} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 760, display: "flex", justifyContent: "center", opacity: 1 - exit }}>
        <Rise text={"The *earned* spending limit for AI agents."} at={tag - 6} size={58} weight={300} align="center" />
      </div>
    </AbsoluteFill>
  );
};

/** Grains for the "kibble." wordmark plus a few out-of-focus foreground and background grains. */
export function wordmarkGrains(seed: number, yOffset = 0.25, step = 6) {
  const r = rng(seed);
  // sampled lazily in the browser, where the font is loaded
  const pts = sampleWordmark(step);
  const PXW = 5.359 / 1080;
  const g: Grain[] = pts.map(([x, y]) => ({
    from: [x * PXW * 1.4 + (r() - 0.5) * 3, 3.6 + r() * 2.5, (r() - 0.5) * 2.5],
    to: [x * PXW, -y * PXW + yOffset, (r() - 0.5) * 0.08],
    out: [x * PXW * 1.6 + (r() - 0.5) * 2, -y * PXW + 5 + r() * 2, 2 + r() * 4],
    delay: 0.15 + r() * 1.1 + ((x + 900) / 1800) * 0.9,
    size: 0.021 + r() * 0.01,
    hue: r(),
    seed: r(),
  }));
  for (let i = 0; i < 90; i++) {
    const z = r() < 0.5 ? 2 + r() * 4 : -3 - r() * 6;
    const x = (r() - 0.5) * 9, y = (r() - 0.5) * 5;
    g.push({ from: [x, y + 4, z], to: [x, y, z], out: [x, y + 5, z], delay: 0.2 + r() * 2.5, size: 0.02 + r() * 0.02, hue: r(), seed: r() });
  }
  return g;
}

import { sampleText } from "../components/Grains";
const sampleWordmark = (step: number) => sampleText("kibble.", `600 380px ${SANS}`, step);
export { SERIF };
