import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Appear, Card, Label, Odometer, Pill, Rise } from "../components/ui";
import { C, MONO, SANS } from "../theme";
import { EASE, EASE_IO, lerp, prog, scene, wf } from "../tl";

/* ================================================================== the machine */
// The drawer, the allowance up to T, verified refills, the sweep to the vault and the earned T, as one diagram
// that runs through four narration scenes.
const M0 = () => scene("drawer").from;
const at = (sid: string, word: string, nth = 1) => scene(sid).from - M0() + wf(sid, word, nth);
export const MACHINE_FRAMES = () => scene("earned").from + scene("earned").frames - M0();

const V = { x: 770, y: 250, w: 380, h: 600 }; // the drawer vessel
const COLS = 17, GAP = 22, ROWH = 20;
const slot = (i: number) => {
  const c = i % COLS, r = Math.floor(i / COLS);
  return { x: V.x + 14 + c * GAP + (r % 2) * 10, y: V.y + V.h - 18 - r * ROWH };
};
const levelY = (rows: number) => V.y + V.h - 8 - rows * ROWH;
const SRC = [
  { x: 640, y: 120, label: "Cleared sales" },
  { x: 1280, y: 120, label: "Accepted work" },
];
const VAULT = { x: 1430, y: 400, w: 330, h: 330 };
const AGENT = { x: 150, y: 470 };
const SUPPLIER = { x: 330, y: 830 };

type Seg = { f0: number; f1: number; n: number; dest?: "supplier" | "vault" };

/** For each grain slot: when it arrived and when (and where) it left. */
function grainEvents(segs: Seg[], max: number) {
  const ev: { add: number; rem: number; dest?: "supplier" | "vault"; src: number }[][] = Array.from({ length: max }, () => []);
  let n = 0;
  for (const s of segs) {
    const n1 = s.n;
    if (n1 > n) for (let i = n; i < n1; i++) ev[i].push({ add: lerp(s.f0, s.f1, (i - n) / Math.max(1, n1 - n)), rem: Infinity, src: i % 2 });
    if (n1 < n)
      for (let i = n - 1; i >= n1; i--) {
        const e = ev[i][ev[i].length - 1];
        if (e) { e.rem = lerp(s.f0, s.f1, (n - 1 - i) / Math.max(1, n - n1)); e.dest = s.dest; }
      }
    n = n1;
  }
  return ev;
}

export const Machine: React.FC = () => {
  const f = useCurrentFrame();
  const A = {
    holds: at("drawer", "holds"),
    key: at("drawer", "key"),
    ask: at("drawer", "ask"),
    pay: at("drawer", "pay"),
    allowance: at("allowance", "allowance"),
    T: at("allowance", "T"),
    refills: at("allowance", "refills"),
    sales: at("allowance", "sales"),
    work: at("allowance", "work"),
    swept: at("vault", "swept"),
    safe: at("vault", "safe"),
    reach: at("vault", "reach"),
    profit: at("earned", "profit"),
    grows: at("earned", "grows"),
    loss: at("earned", "loss"),
    shrinks: at("earned", "shrinks"),
    window: at("earned", "window"),
    end: MACHINE_FRAMES(),
  };
  const T0 = 9, T1 = 12, T2 = 8; // T in grain rows: 0.200, 0.260, 0.182 (scaled)
  const tRows = T0 + (T1 - T0) * prog(f, A.grows - 6, A.grows + 30, EASE_IO) - (T1 - T2) * prog(f, A.shrinks - 6, A.shrinks + 30, EASE_IO);
  const tVal = 0.2 + 0.06 * prog(f, A.grows - 6, A.grows + 30, EASE_IO) - 0.078 * prog(f, A.shrinks - 6, A.shrinks + 30, EASE_IO);
  const nT = (rows: number) => Math.round(rows * COLS);

  const segs: Seg[] = useMemo(
    () => [
      { f0: A.holds - 6, f1: A.holds + 50, n: nT(T0) + 6 },
      { f0: A.pay, f1: A.pay + 18, n: nT(T0) + 2, dest: "supplier" },
      { f0: A.refills + 10, f1: A.work + 40, n: nT(T0) + 2 + 95 },
      { f0: A.swept, f1: A.swept + 50, n: nT(T0), dest: "vault" },
      { f0: A.grows - 4, f1: A.grows + 30, n: nT(T1) },
      { f0: A.shrinks - 4, f1: A.shrinks + 26, n: nT(T2), dest: "supplier" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const events = useMemo(() => grainEvents(segs, 400), [segs]);

  const vesselIn = prog(f, 0, 46, EASE_IO);
  const agentIn = prog(f, A.key - 10, A.key + 20);
  const askP = prog(f, A.ask - 4, A.ask + 24, EASE_IO);
  const tLine = prog(f, A.T - 12, A.T + 18, EASE_IO);
  const band = prog(f, A.allowance - 6, A.allowance + 24);
  const srcIn = (i: number) => prog(f, (i ? A.work : A.sales) - 14, (i ? A.work : A.sales) + 14);
  const vaultIn = prog(f, A.swept - 30, A.swept);
  const noReach = prog(f, A.reach - 16, A.reach + 10, EASE_IO);
  const windows = prog(f, A.window - 10, A.window + 20);
  const swept = events.reduce((a, ev) => a + ev.filter((e) => e.dest === "vault" && f > e.rem + 30).length, 0);
  const paid = events.reduce((a, ev) => a + ev.filter((e) => e.dest === "supplier" && f > e.rem + 24).length, 0);

  const yT = levelY(tRows);
  const grains: React.ReactNode[] = [];
  events.forEach((ev, i) => {
    const s = slot(i);
    ev.forEach((e, k) => {
      if (f < e.add || f > e.rem + 40) return;
      let x = s.x, y = s.y, a = 1, scale = 1;
      const inT = (f - e.add) / 22;
      if (inT < 1) {
        // falling in: from a source after the first fill, from above the drawer before
        const fromSrc = e.add > A.refills;
        const sx = fromSrc ? SRC[e.src].x : s.x, sy = fromSrc ? SRC[e.src].y + 60 : V.y - 60;
        const t = EASE(Math.max(0, inT));
        x = lerp(sx, s.x, t);
        y = lerp(sy, s.y, t * t);
        a = Math.min(1, inT * 3);
      }
      if (f > e.rem) {
        const t = EASE_IO(Math.min(1, (f - e.rem) / 34));
        const d = e.dest === "vault" ? { x: VAULT.x + VAULT.w / 2, y: VAULT.y + VAULT.h / 2 } : { x: SUPPLIER.x + 40, y: SUPPLIER.y };
        const cx = e.dest === "vault" ? V.x + V.w + 90 : V.x - 120, cy = e.dest === "vault" ? Math.min(s.y, yT) - 40 : V.y + V.h + 20;
        x = (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * cx + t * t * d.x;
        y = (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * cy + t * t * d.y;
        a = 1 - Math.max(0, (f - e.rem - 26) / 14);
        scale = 1 - t * 0.4;
      }
      const above = s.y < yT - 4 && f < e.rem;
      grains.push(
        <div key={`${i}-${k}`} style={{ position: "absolute", left: x - 7, top: y - 7, width: 14, height: 14, borderRadius: 14, opacity: a * vesselIn, transform: `scale(${scale})`,
          background: above ? "#ffd27a" : C.saffron, boxShadow: above ? `0 0 10px #ffd27a` : `0 0 12px ${C.saffron}aa` }} />,
      );
    });
  });

  return (
    <AbsoluteFill>
      {/* sources */}
      {SRC.map((s, i) => (
        <div key={i} style={{ position: "absolute", left: s.x - 140, top: s.y - 20, width: 280, textAlign: "center", opacity: srcIn(i), transform: `translateY(${(1 - srcIn(i)) * -20}px)` }}>
          <Label size={14} color={C.fg} style={{ justifyContent: "center" }}>
            <span style={{ color: C.mint }}>✓</span> {s.label}
          </Label>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, marginTop: 8, letterSpacing: "0.1em" }}>{i ? "SIGNED BY AN APPROVED CLIENT" : "BUYER PAID · HOLD PASSED"}</div>
        </div>
      ))}
      {/* the vessel */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <path
          d={`M${V.x} ${V.y} L${V.x} ${V.y + V.h - 30} Q${V.x} ${V.y + V.h} ${V.x + 30} ${V.y + V.h} L${V.x + V.w - 30} ${V.y + V.h} Q${V.x + V.w} ${V.y + V.h} ${V.x + V.w} ${V.y + V.h - 30} L${V.x + V.w} ${V.y}`}
          fill="rgba(255,255,255,0.025)" stroke={C.fg2} strokeOpacity={0.55} strokeWidth={2} strokeDasharray={1800} strokeDashoffset={1800 * (1 - vesselIn)}
        />
        {/* allowance band */}
        <rect x={V.x + 2} y={yT} width={V.w - 4} height={V.y + V.h - yT - 2} fill={C.saffron} opacity={0.06 * band} rx={26} />
        {/* the chute to the vault */}
        <path d={`M${V.x + V.w} ${yT} C ${V.x + V.w + 140} ${yT}, ${VAULT.x - 120} ${VAULT.y + VAULT.h / 2}, ${VAULT.x} ${VAULT.y + VAULT.h / 2}`} fill="none" stroke={C.saffron} strokeOpacity={0.35 * vaultIn} strokeWidth={2} strokeDasharray="4 8" />
        {/* the agent asks */}
        <path d={`M${AGENT.x + 300} ${AGENT.y + 80} C ${AGENT.x + 420} ${AGENT.y + 80}, ${V.x - 120} ${V.y + V.h - 140}, ${V.x - 8} ${V.y + V.h - 140}`} fill="none" stroke={C.fg2} strokeWidth={2} strokeDasharray="6 8" strokeDashoffset={-f * 0.8} opacity={askP} />
        {/* no path from the agent to the vault */}
        <path d={`M${AGENT.x + 150} ${AGENT.y - 10} C ${AGENT.x + 300} ${120}, ${VAULT.x} ${150}, ${VAULT.x + VAULT.w / 2} ${VAULT.y - 10}`} fill="none" stroke={C.coral} strokeWidth={2.5} strokeDasharray="8 10"
          strokeDashoffset={(1 - noReach) * 1600} opacity={noReach > 0 ? 0.9 : 0} pathLength={1600} />
      </svg>
      <div style={{ position: "absolute", left: V.x, top: V.y + V.h + 24, width: V.w, textAlign: "center", opacity: vesselIn }}>
        <Label size={15} color={C.fg} style={{ justifyContent: "center" }}>Drawer</Label>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, marginTop: 8, letterSpacing: "0.12em" }}>SMART CONTRACT · ONE PER AGENT</div>
      </div>
      {grains}
      {/* T */}
      <div style={{ position: "absolute", left: V.x - 30, top: yT - 1, width: (V.w + 60) * tLine, height: 0, borderTop: `3px dashed ${C.saffron}`, filter: `drop-shadow(0 0 6px ${C.saffron})` }} />
      <div style={{ position: "absolute", left: V.x - 186, top: yT - 22, opacity: tLine, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: 40, fontWeight: 300, color: C.saffron, fontStyle: "normal" }}>T</span>
        <Odometer value={tVal} decimals={3} size={34} color={C.saffron} weight={300} />
      </div>
      <div style={{ position: "absolute", left: V.x - 186, top: yT + 26, opacity: band * (1 - prog(f, A.swept - 10, A.swept + 10)) }}>
        <Label size={12} color={C.saffron}>allowance ≤ T</Label>
      </div>
      {/* agent key */}
      <div style={{ position: "absolute", left: AGENT.x, top: AGENT.y, opacity: agentIn, transform: `translateX(${(1 - agentIn) * -30}px)` }}>
        <Card style={{ width: 300, padding: "22px 24px" }}>
          <Label size={12} color={C.muted}>Agent key</Label>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 54, fontWeight: 200, color: C.fg, letterSpacing: "-0.04em" }}>0.00</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted }}>tUSD8</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 18, color: C.fg2, marginTop: 6, fontWeight: 300 }}>Holds nothing. Can only ask.</div>
        </Card>
      </div>
      <div style={{ position: "absolute", left: AGENT.x + 350, top: AGENT.y + 30, opacity: askP * (1 - prog(f, A.pay + 30, A.pay + 50)) }}>
        <span style={{ fontFamily: MONO, fontSize: 16, color: C.fg, background: C.bg3, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "6px 10px" }}>pay(supplier, 0.004)?</span>
      </div>
      {/* supplier */}
      <div style={{ position: "absolute", left: SUPPLIER.x - 160, top: SUPPLIER.y - 26, opacity: prog(f, A.pay - 10, A.pay + 10) * (1 - prog(f, A.profit - 20, A.profit)), display: "flex", alignItems: "center", gap: 14 }}>
        <Label size={13} color={C.fg2}>Approved supplier</Label>
        <span style={{ fontFamily: MONO, fontSize: 14, color: C.mint }}>{`receipt #${63 + Math.min(paid, 4)}`}</span>
      </div>
      {/* vault */}
      <div style={{ position: "absolute", left: VAULT.x, top: VAULT.y, width: VAULT.w, height: VAULT.h, opacity: vaultIn, transform: `scale(${0.92 + 0.08 * vaultIn})` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 26, border: `2px solid ${C.fg2}88`, background: "linear-gradient(160deg, #241c2b, #120e16)", boxShadow: `inset 0 0 60px rgba(0,0,0,0.6), 0 40px 120px rgba(0,0,0,0.5)` }} />
        <div style={{ position: "absolute", left: VAULT.w / 2 - 92, top: VAULT.h / 2 - 92, width: 184, height: 184, borderRadius: 999, border: `2px solid ${C.saffron}66`, transform: `rotate(${f * 0.6}deg)`,
          background: `repeating-conic-gradient(from 0deg, ${C.saffron}22 0 6deg, transparent 6deg 30deg)` }} />
        <div style={{ position: "absolute", left: VAULT.w / 2 - 40, top: VAULT.h / 2 - 40, width: 80, height: 80, borderRadius: 999, background: C.bg3, border: `2px solid ${C.saffron}aa`, boxShadow: `0 0 40px ${C.saffron}44` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: VAULT.h + 22, textAlign: "center" }}>
          <Label size={15} color={C.fg} style={{ justifyContent: "center" }}>Owner&apos;s vault</Label>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8 }}>
            <Odometer value={swept * 0.004} decimals={3} size={34} color={C.saffron} weight={300} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>swept</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: VAULT.w / 2 - 22, top: -96, opacity: noReach, transform: `scale(${0.6 + 0.4 * noReach})` }}>
          <div style={{ width: 44, height: 44, borderRadius: 99, background: C.coral, color: "#120c0a", fontFamily: SANS, fontWeight: 600, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 30px ${C.coral}` }}>✕</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 150, opacity: noReach * (1 - prog(f, A.profit - 20, A.profit)) }}>
        <Label size={13} color={C.coral}>The agent key has no path to the vault</Label>
      </div>
      {/* windows strip */}
      <div style={{ position: "absolute", left: 150, top: 700, display: "flex", gap: 10, opacity: windows }}>
        {[0.2, 0.2, 0.215, 0.232, 0.26, 0.26, 0.218, 0.182].map((v, i) => {
          const on = prog(f, A.window + i * 5, A.window + i * 5 + 14);
          const up = i > 0 && v > [0.2, 0.2, 0.215, 0.232, 0.26, 0.26, 0.218, 0.182][i - 1];
          const dn = i > 0 && v < [0.2, 0.2, 0.215, 0.232, 0.26, 0.26, 0.218, 0.182][i - 1];
          return (
            <div key={i} style={{ width: 52, opacity: on, transform: `translateY(${(1 - on) * 14}px)` }}>
              <div style={{ height: 70, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: v * 250, background: up ? C.saffron : dn ? C.coral : C.fg2, opacity: 0.85, borderRadius: "4px 4px 0 0" }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, textAlign: "center", marginTop: 6 }}>{`W${i + 1}`}</div>
            </div>
          );
        })}
      </div>
      {/* the beat headlines */}
      <div style={{ position: "absolute", left: 150, top: 668, opacity: prog(f, A.profit - 10, A.profit + 10) }}>
        <Label size={14} color={C.fg2}>T moves at each window close</Label>
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== brakes */
const LADDER = ["Healthy", "Watch", "Braked", "Paused"] as const;
export const Brakes: React.FC = () => {
  const f = useCurrentFrame();
  const S = "brakes";
  const steps = [wf(S, "healthy"), wf(S, "watch"), wf(S, "braked"), wf(S, "paused")];
  const over = wf(S, "overspends");
  const human = wf(S, "human");
  const level = steps.reduce((a, s, i) => a + (i ? prog(f, s - 6, s + 16, EASE_IO) : 0), 0);
  const cols = [C.mint, C.saffron, C.amber, C.coral];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 150 }}>
        <Rise text={"The wallet\n*brakes* the agent."} at={4} size={92} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 420, width: 640 }}>
        {[1, 2, 3].map((k) => {
          const at = over + 10 + (k - 1) * 22;
          const p = prog(f, at, at + 16);
          return (
            <div key={k} style={{ opacity: p, transform: `translateX(${(1 - p) * -20}px)`, fontFamily: MONO, fontSize: 19, color: C.fg2, marginBottom: 16, display: "flex", gap: 14 }}>
              <span style={{ color: C.coral }}>{`strike ${k}`}</span>
              <span>Refused: over the cost ceiling</span>
            </div>
          );
        })}
        <div style={{ marginTop: 36, opacity: prog(f, human - 12, human + 12) }}>
          <Label size={14} color={C.muted}>No human watching · no alert to read</Label>
        </div>
      </div>
      {/* the ladder: four landings stepping down to the right */}
      {LADDER.map((s, i) => {
        const x = 900 + i * 200, y = 300 + i * 130;
        const active = Math.max(0, 1 - Math.abs(level - i));
        const lit = prog(f, steps[i] - 8, steps[i] + 12);
        return (
          <div key={s} style={{ position: "absolute", left: x, top: y, opacity: 0.25 + 0.75 * lit }}>
            <div style={{ width: 300, height: 2, background: lit > 0 ? cols[i] : C.line2, opacity: 0.6 }} />
            <div style={{ marginTop: 18, transform: `scale(${1 + active * 0.18})`, transformOrigin: "0 0" }}>
              <Pill state={s} size={20} glow={active} />
            </div>
            <div style={{ marginTop: 18, fontFamily: SANS, fontSize: 20, color: C.fg2, fontWeight: 300, width: 300 }}>
              {["Refills up to T", "1 strike: refills to T/2", "2 strikes: no refills", "3 strikes, or the weekly loss: stops"][i]}
            </div>
          </div>
        );
      })}
      {/* the agent token riding down the ladder */}
      {(() => {
        const li = Math.min(3, level);
        const i0 = Math.floor(li), t = li - i0;
        const x0 = 900 + i0 * 200 + 330, y0 = 300 + i0 * 130 + 30;
        const x1 = 900 + Math.min(3, i0 + 1) * 200 + 330, y1 = 300 + Math.min(3, i0 + 1) * 130 + 30;
        const col = cols[Math.round(li)];
        return (
          <div style={{ position: "absolute", left: lerp(x0, x1, t) - 16, top: lerp(y0, y1, t) - 16 - Math.sin(t * Math.PI) * 40, width: 32, height: 32, borderRadius: 99, background: col, boxShadow: `0 0 30px ${col}`, opacity: prog(f, steps[0] - 10, steps[0]) }} />
        );
      })()}
    </AbsoluteFill>
  );
};

/* ================================================================== one number */
export const OneNumber: React.FC = () => {
  const f = useCurrentFrame();
  const S = "onenumber";
  const one = wf(S, "one");
  const week = wf(S, "week");
  const derived = wf(S, "derived");
  const learned = wf(S, "learned");
  const L = interpolate(f, [one, one + 40], [0, 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const items = [
    ["Max limit Tmax", "L / 2", "1.000"],
    ["Starting T", "L / 10", "0.200"],
    ["Owner signs above", "L / 10", "0.200"],
    ["Braked at drawdown", "L / 2", "1.000"],
    ["Paused at drawdown", "L", "2.000"],
  ];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 160 }}>
        <Label size={15} color={C.saffron} dot={C.saffron}>The one owner setting</Label>
      </div>
      <div style={{ position: "absolute", left: 128, top: 210, display: "flex", alignItems: "baseline", gap: 28 }}>
        <Odometer value={L} decimals={3} size={260} weight={100} color={C.fg} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 500, opacity: prog(f, week - 16, week + 10) }}>
        <div style={{ fontFamily: SANS, fontSize: 44, fontWeight: 300, color: C.fg, letterSpacing: "-0.02em" }}>
          L · max <span style={{ fontFamily: "inherit" }}>weekly loss</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: C.muted, marginTop: 12, letterSpacing: "0.14em" }}>TUSD8 · AEVUM DEMO SETTING</div>
      </div>
      <div style={{ position: "absolute", left: 1040, top: 190, width: 740 }}>
        {items.map(([k, formula, v], i) => {
          const p = prog(f, derived + i * 6, derived + i * 6 + 20);
          return (
            <div key={k} style={{ display: "flex", alignItems: "baseline", padding: "18px 0", borderBottom: `1px solid ${C.line}`, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
              <span style={{ fontFamily: SANS, fontSize: 28, color: C.fg, fontWeight: 300, flex: 1 }}>{k}</span>
              <span style={{ fontFamily: MONO, fontSize: 18, color: C.muted, width: 120 }}>{formula}</span>
              <span style={{ fontFamily: MONO, fontSize: 26, color: C.saffron, width: 110, textAlign: "right" }}>{v}</span>
            </div>
          );
        })}
        <Appear at={learned - 6} style={{ marginTop: 34 }}>
          <Card accent={C.mint} style={{ padding: "22px 26px" }}>
            <Label size={12} color={C.mint}>Learned in the first windows</Label>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 12 }}>
              <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 300, color: C.fg }}>Real cost share</span>
              <span style={{ fontFamily: MONO, fontSize: 26, color: C.fg }}>41.37%</span>
              <span style={{ fontFamily: MONO, fontSize: 18, color: C.muted }}>→ ceiling</span>
              <span style={{ fontFamily: MONO, fontSize: 26, color: C.mint }}>51.37%</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.faint, marginTop: 10, letterSpacing: "0.1em" }}>KIBBLE A ON AEVUM TESTNET</div>
          </Card>
        </Appear>
      </div>
    </AbsoluteFill>
  );
};
