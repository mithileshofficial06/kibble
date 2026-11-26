import { AbsoluteFill, useCurrentFrame } from "remotion";
import { DUEL, ONE, SHOP, add, dip, project } from "./director";
import type { V3 } from "./assets";
import { BODY, DISPLAY, K, LADDER, MONO } from "./theme";
import { EASE, at, end, lerp, p, sceneAt, w } from "./tl";

/** Everything drawn over the 3D picture: captions, titles, labels pinned to objects, number cards, chapter marks. */

// ------------------------------------------------------------ pieces

const Title = ({ f, a, b, children, size = 96, y = 0.42, sub, color = K.ink, align = "center" }: { f: number; a: number; b: number; children: string; size?: number; y?: number; sub?: string; color?: string; align?: "center" | "left" }) => {
  if (f < a - 2 || f > b + 2) return null;
  const out = 1 - p(f, b - 16, b, EASE.io);
  // *a few words* are highlighted
  let on = false;
  const words = children.split(" ").map((raw) => {
    let t = raw;
    const start = t.startsWith("*");
    if (start) t = t.slice(1);
    const stop = t.endsWith("*");
    if (stop) t = t.slice(0, -1);
    if (start) on = true;
    const hi = on;
    if (stop) on = false;
    return { t, hi };
  });
  return (
    <div style={{ position: "absolute", left: align === "left" ? 150 : 0, right: align === "left" ? undefined : 0, top: `${y * 100}%`, transform: "translateY(-50%)", textAlign: align, opacity: out }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.035em", color, textShadow: "0 6px 40px rgba(0,0,0,.55)" }}>
        {words.map(({ t: wd, hi }, i) => {
          const t = p(f, a + i * 4, a + i * 4 + 22, EASE.out);
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: "0.08em", marginRight: "0.24em" }}>
              <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%)`, color: hi ? K.mint : undefined }}>{wd}</span>
            </span>
          );
        })}
      </div>
      {sub && (
        <div style={{ marginTop: 22, fontFamily: BODY, fontWeight: 600, fontSize: size * 0.3, color: K.ink2, opacity: p(f, a + 14, a + 36), transform: `translateY(${(1 - p(f, a + 14, a + 36)) * 14}px)` }}>{sub}</div>
      )}
    </div>
  );
};

/** A label pinned to a point in the 3D scene. */
const Pin = ({ f, a, b, at: pt, text, sub, color = K.ink, dot = K.mint, dy = -30, big = false }: { f: number; a: number; b: number; at: V3; text: string; sub?: string; color?: string; dot?: string; dy?: number; big?: boolean }) => {
  if (f < a || f > b) return null;
  const s = project(f, pt);
  if (!s.front) return null;
  const edge = Math.min(1, Math.max(0, (Math.min(s.x, 1920 - s.x) - 160) / 140));
  const t = Math.min(p(f, a, a + 16, EASE.back), 1 - p(f, b - 12, b, EASE.io)) * edge;
  if (t <= 0.01) return null;
  return (
    <div style={{ position: "absolute", left: s.x, top: s.y + dy, transform: `translate(-50%, -100%) scale(${0.85 + 0.15 * t})`, opacity: t, transformOrigin: "50% 100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: big ? "14px 22px" : "10px 18px", borderRadius: 999, background: "rgba(8,12,30,.72)", border: `1.5px solid ${dot}55`, backdropFilter: "blur(10px)", boxShadow: `0 10px 30px rgba(0,0,0,.35), 0 0 24px ${dot}22`, whiteSpace: "nowrap" }}>
        <span style={{ width: big ? 14 : 11, height: big ? 14 : 11, borderRadius: 99, background: dot, boxShadow: `0 0 14px ${dot}` }} />
        <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: big ? 34 : 27, color }}>{text}</span>
        {sub && <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: big ? 24 : 21, color: K.muted }}>{sub}</span>}
      </div>
      <div style={{ width: 2, height: 22, margin: "0 auto", background: `linear-gradient(${dot}aa, transparent)` }} />
    </div>
  );
};

/** A glass card with a number that counts. */
const Card = ({ f, a, b, x, y, label, value, color = K.ink, note, w: width = 420, from }: { f: number; a: number; b: number; x: number; y: number; label: string; value: string; color?: string; note?: string; w?: number; from?: "left" | "right" }) => {
  if (f < a || f > b) return null;
  const t = Math.min(p(f, a, a + 20, EASE.out), 1 - p(f, b - 12, b, EASE.io));
  const dx = (1 - t) * (from === "right" ? 40 : -40);
  return (
    <div style={{ position: "absolute", left: x, top: y, width, opacity: t, transform: `translateX(${dx}px)`, padding: "22px 28px", borderRadius: 26, background: "linear-gradient(160deg, rgba(20,28,64,.78), rgba(8,12,30,.78))", border: "1.5px solid rgba(160,175,255,.16)", backdropFilter: "blur(14px)", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: K.muted }}>{label}</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 54, color, marginTop: 6, letterSpacing: "-0.02em" }}>{value}</div>
      {note && <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 23, color: K.ink2, marginTop: 6 }}>{note}</div>}
    </div>
  );
};

const num = (f: number, a: number, b: number, x: number, y: number, d = 3) => lerp(x, y, p(f, a, b, EASE.inOut)).toFixed(d);

/** Captions: the spoken line, each word lighting up as it is said. */
const Captions = ({ f }: { f: number }) => {
  const s = sceneAt(f);
  const lf = f - s.from;
  const line = s.captions.find((c) => lf >= c.f && lf < (c.e ?? c.f + 120));
  if (!line) return null;
  const t = Math.min(p(lf, line.f, line.f + 8), 1 - p(lf, (line.e ?? line.f + 120) - 6, line.e ?? line.f + 120));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center", opacity: t }}>
      <div style={{ padding: "14px 30px", borderRadius: 20, background: "rgba(4,7,18,.6)", backdropFilter: "blur(8px)", maxWidth: 1500, textAlign: "center" }}>
        {line.toks.map((tok, i) => {
          const said = lf >= tok.f;
          return (
            <span key={i} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, letterSpacing: "-0.01em", color: said ? K.ink : "rgba(242,245,255,.42)", marginRight: 11, transition: "none" }}>
              {tok.c}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const CHAPTERS = [
  { n: "01", name: "The problem", from: 0, to: at("reveal") },
  { n: "02", name: "How Kibble works", from: at("box"), to: at("test") },
  { n: "03", name: "Tested on a real blockchain", from: at("test"), to: at("real") },
];
const Chapter = ({ f }: { f: number }) => {
  const c = CHAPTERS.find((x) => f >= x.from && f < x.to);
  if (!c) return null;
  const t = Math.min(p(f, c.from + 20, c.from + 50), 1 - p(f, c.to - 20, c.to));
  return (
    <div style={{ position: "absolute", left: 72, top: 60, display: "flex", alignItems: "center", gap: 16, opacity: t * 0.92 }}>
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: K.mint }}>{c.n}</span>
      <span style={{ width: 40, height: 2, background: K.mint, opacity: 0.6 }} />
      <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: K.ink2 }}>{c.name}</span>
    </div>
  );
};

/** The brake ladder: four pills, the current one lit. */
const Ladder = ({ f }: { f: number }) => {
  const a = w("brakes", "healthy") - 20, b = end("brakes");
  if (f < a || f > b) return null;
  const words = ["healthy", "watch", "braked", "paused"].map((x) => w("brakes", x));
  const cur = words.filter((x) => f >= x).length - 1;
  const t = Math.min(p(f, a, a + 18), 1 - p(f, b - 14, b));
  return (
    <div style={{ position: "absolute", right: 90, top: 250, display: "flex", flexDirection: "column", gap: 16, opacity: t }}>
      {LADDER.map((r, i) => {
        const on = i === cur;
        return (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 26px", borderRadius: 999, minWidth: 300, background: on ? `${r.color}26` : "rgba(8,12,30,.6)", border: `2px solid ${on ? r.color : "rgba(160,175,255,.15)"}`, transform: `scale(${on ? 1.06 : 1})`, boxShadow: on ? `0 0 34px ${r.color}55` : "none" }}>
            <span style={{ width: 16, height: 16, borderRadius: 99, background: r.color, opacity: on ? 1 : 0.35, boxShadow: on ? `0 0 16px ${r.color}` : "none" }} />
            <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 32, color: on ? K.ink : K.muted }}>{r.name}</span>
          </div>
        );
      })}
    </div>
  );
};

/** One number in, everything else worked out. */
const OneNumber = ({ f }: { f: number }) => {
  const a = at("owner", 0.2), b = end("owner");
  if (f < a || f > b) return null;
  const t = Math.min(p(f, a, a + 20), 1 - p(f, b - 14, b));
  const rest = p(f, w("owner", "works") - 10, w("owner", "works") + 20);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 150, paddingTop: 50, paddingBottom: 70, display: "flex", flexDirection: "column", alignItems: "center", opacity: t, background: "radial-gradient(ellipse 50% 55% at 50% 50%, rgba(4,6,16,.7), transparent)" }}>
      <div style={{ padding: "26px 44px", borderRadius: 30, background: "linear-gradient(160deg, rgba(20,28,64,.85), rgba(8,12,30,.85))", border: `2px solid ${K.amber}88`, boxShadow: `0 0 50px ${K.amber}33`, textAlign: "center" }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: "0.08em", textTransform: "uppercase", color: K.muted }}>Most I'm willing to lose in a week</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 84, color: K.amber, marginTop: 4 }}>$20</div>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 34, opacity: rest, transform: `translateY(${(1 - rest) * 20}px)` }}>
        {["Spending limit", "Tray size", "Brakes", "Price ceiling"].map((x) => (
          <div key={x} style={{ padding: "12px 24px", borderRadius: 999, background: "rgba(8,12,30,.7)", border: `1.5px solid ${K.mint}66`, fontFamily: BODY, fontWeight: 700, fontSize: 26, color: K.ink2 }}>
            <span style={{ color: K.mint, marginRight: 10 }}>✓</span>
            {x}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, padding: "8px 18px", borderRadius: 999, background: "rgba(4,6,16,.7)", fontFamily: BODY, fontWeight: 600, fontSize: 22, color: K.ink2, opacity: rest }}>Example amount. Kibble derives the rest, or learns it from the agent's first days.</div>
    </div>
  );
};

// ------------------------------------------------------------ the whole overlay

export const Overlay = ({ captions = true }: { captions?: boolean }) => {
  const f = useCurrentFrame();
  const kib = (pt: V3) => add(DUEL.kibble, pt);
  const fix = (pt: V3) => add(DUEL.fixed, pt);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* 1. the problem */}
      <Title f={f} a={at("hook", 0.4)} b={w("hook", "they") - 4} size={104} y={0.2}>AI agents can now spend *real money.*</Title>
      <Pin f={f} a={w("hook", "data")} b={at("limit", 0.6)} at={add(ONE.mid, [-0.7, 3.15, 0.55])} text="Data · tools · other agents" dot={K.sky} />
      <Pin f={f} a={w("hook", "all") - 4} b={at("limit", 0.6)} at={add(ONE.mid, [-0.7, 2.0, 0.55])} text="All on its own" dot={K.amber} dy={-130} />
      <Pin f={f} a={w("limit", "fifty") - 4} b={at("guess", 1.0)} at={add(ONE.mid, [1.05, 1.25, 0.45])} text="$50 a day" sub="fixed limit" dot={K.red} big />
      <Title f={f} a={at("guess", 0.1)} b={w("guess", "great") - 6} size={120} y={0.2}>It's just a *guess.*</Title>
      <Pin f={f} a={w("guess", "runs")} b={end("guess") - 4} at={add(ONE.left, [0.5, 1.6, 0.25])} text="Runs out" sub="customers turned away" dot={K.orange} />
      <Pin f={f} a={w("guess", "wastes")} b={end("guess") - 4} at={add(ONE.mid, [1.05, 1.6, 0.45])} text="Wastes it" sub="every day" dot={K.red} />
      <Pin f={f} a={w("guess", "gets")} b={end("guess") - 4} at={add(ONE.right, [-2.35, 2.1, 1.75])} text="The thief takes it all" dot={K.red} />

      {/* 2. Kibble */}
      <RevealTitle f={f} />
      <Pin f={f} a={w("box", "locked")} b={end("box") - 4} at={add(SHOP.box, [0, 1.6, 0])} text="Locked box" sub="a smart contract" dot={K.mint} big />
      <Pin f={f} a={w("box", "ask") - 4} b={end("box") - 30} at={add(SHOP.robot, [0, 2.15, 0])} text="“Please pay the supplier”" dot={K.sky} />
      <Pin f={f} a={w("tray", "tray")} b={end("tray") - 4} at={add(SHOP.tray, [0, 0.12, 0.5])} text="Spending tray" dot={K.mint} dy={-6} />
      <Pin f={f} a={w("tray", "pays")} b={end("tray") - 4} at={add(SHOP.counter, [0, 1.6, 0.2])} text="+ a real sale" dot={K.amber} />
      <Pin f={f} a={w("safe", "safe") - 4} b={end("safe") - 4} at={add(SHOP.safe, [0, 1.55, 0])} text="Owner's safe" dot={K.mint} big />
      <Pin f={f} a={w("safe", "never")} b={end("safe") - 4} at={add(SHOP.robot, [0, 2.15, 0])} text="The agent can't touch it" dot={K.red} />
      <Pin f={f} a={w("grow", "grows") - 6} b={w("grow", "shrinks") - 8} at={add(SHOP.tray, [0, 0.4, 0])} text="Made money → bigger tray" dot={K.mint} dy={-20} />
      <Pin f={f} a={w("grow", "shrinks") - 6} b={w("grow", "earned") - 8} at={add(SHOP.tray, [0, 0.4, 0])} text="Lost money → smaller tray" dot={K.red} dy={-20} />
      <Title f={f} a={w("grow", "earned") - 6} b={end("grow") - 2} size={84} y={0.18}>The limit is *earned.*</Title>
      <Ladder f={f} />
      <OneNumber f={f} />

      {/* 3. the test */}
      <Pin f={f} a={at("test", 0.8)} b={w("test", "two") + 10} at={add(DUEL.chain, [0, 0.8, 0])} text="QDay Aevum testnet" sub="a real blockchain" dot={K.violet} big />
      <Pin f={f} a={w("test", "fixed") - 4} b={end("thief") - 10} at={fix([0, 3.0, 0])} text="Fixed limit" dot="#9aa6d6" big dy={0} />
      <Pin f={f} a={w("test", "kibble") - 4} b={end("thief") - 10} at={kib([0, 3.0, 0])} text="Kibble" dot={K.mint} big dy={0} />
      {/* busy day */}
      <Card f={f} a={w("busy", "served") - 6} b={end("busy")} x={70} y={790} label="Customers served" value="8 of 8" w={360} />
      <Card f={f} a={w("busy", "served") - 6} b={end("busy")} x={1490} y={790} label="Customers served" value="8 of 8" w={360} from="right" />
      <Card f={f} a={w("busy", "grew") - 6} b={end("busy")} x={1490} y={620} label="Kibble's limit" value={num(f, w("busy", "grew"), w("busy", "grew") + 50, 0.279, 0.291)} color={K.mint} note="grew as it earned" w={360} from="right" />
      <Pin f={f} a={w("busy", "profit") - 2} b={end("busy") - 4} at={kib(add(SHOP.safe, [0, 1.55, 0]))} text="+0.080 to the safe" dot={K.mint} />
      {/* losing day */}
      <Pin f={f} a={w("losing", "lost") - 4} b={end("losing") - 4} at={fix(add(SHOP.supplier, [0.25, 1.6, 0]))} text="Price 0.010 → 0.013" dot={K.red} />
      <Pin f={f} a={w("losing", "lost") - 4} b={end("losing") - 4} at={kib(add(SHOP.supplier, [0.25, 1.6, 0]))} text="Price 0.010 → 0.013" dot={K.red} />
      <Card f={f} a={w("losing", "fixed") - 4} b={end("losing")} x={70} y={790} label="Fixed: lost so far" value={f < w("losing", "again", 1) ? "0.126" : f < w("losing", "again", 2) ? "0.141" : "0.153"} color={K.red} note="and still paying" w={380} />
      <Card f={f} a={w("losing", "stopped") - 4} b={end("losing")} x={1470} y={790} label="Kibble stopped itself" value="70 s" color={K.mint} note="after the price jump" w={380} from="right" />
      {/* the thief */}
      <Card f={f} a={w("thief", "spending") - 4} b={w("thief", "kibble") + 24} x={70} y={790} label="Thief overbought" value="0.150" color={K.red} note="and the agent stayed open" w={400} />
      <Card f={f} a={w("thief", "nothing", 2) - 4} b={end("thief") + 6} x={1450} y={790} label="Thief got" value="0.000" color={K.mint} note="locked itself in 2 s" w={400} from="right" />

      {/* the real recordings */}
      <Title f={f} a={at("real", 0.2)} b={w("real", "every") - 2} size={64} y={0.12}>Real recordings, on a real blockchain</Title>
      <Pin f={f} a={w("real", "every")} b={end("real") - 4} at={add(DUEL.screens, [-2.75, 1.9, 0])} text="The Playground: anyone can run it" dot={K.amber} dy={0} />
      <Pin f={f} a={w("real", "every")} b={end("real") - 4} at={add(DUEL.screens, [2.75, 1.9, 0])} text="Every payment: a receipt on chain" dot={K.mint} dy={0} />

      {/* 4. proof and close */}
      <Proof f={f} />
      <Close f={f} />

      {captions && <Chapter f={f} />}
      {captions && <Captions f={f} />}
      {/* dips to night between sets */}
      <AbsoluteFill style={{ background: K.night, opacity: dip(f) }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,3,10,.35))" }} />
    </AbsoluteFill>
  );
};

const RevealTitle = ({ f }: { f: number }) => {
  const a = w("reveal", "kibble") - 6, b = end("reveal") - 2;
  if (f < a - 2 || f > b) return null;
  const t = p(f, a, a + 30, EASE.out);
  const out = 1 - p(f, b - 18, b, EASE.io);
  const sub = p(f, w("reveal", "like") - 4, w("reveal", "like") + 20);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: "20%", textAlign: "center", opacity: out }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 230, letterSpacing: "-0.06em", lineHeight: 1, color: K.ink, transform: `translateY(${(1 - t) * 50}px) scale(${0.94 + 0.06 * t})`, opacity: t, textShadow: `0 0 80px ${K.amber}44` }}>
        kibble<span style={{ color: K.amber }}>.</span>
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 44, color: K.ink2, marginTop: 10, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
        A spending limit your AI agent has to <span style={{ color: K.amber }}>earn</span>.
      </div>
    </div>
  );
};

const Proof = ({ f }: { f: number }) => {
  const a = at("proof", 0.3), b = end("proof");
  if (f < a || f > b) return null;
  const t = Math.min(p(f, a, a + 20), 1 - p(f, b - 14, b));
  const n = Math.round(lerp(1, 181, p(f, a + 4, w("proof", "tests") + 6, EASE.inOut)));
  const second = p(f, w("proof", "worst") - 6, w("proof", "worst") + 20);
  return (
    <>
    <AbsoluteFill style={{ opacity: t, background: "linear-gradient(90deg, rgba(4,6,16,.88) 0%, rgba(4,6,16,.7) 38%, transparent 62%)" }} />
    <div style={{ position: "absolute", left: 150, top: 230, opacity: t }}>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 210, lineHeight: 1, color: K.ink, letterSpacing: "-0.04em" }}>{n}</div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 52, color: K.mint, marginTop: 4 }}>tests, all passing</div>
      <div style={{ marginTop: 60, opacity: second, transform: `translateY(${(1 - second) * 20}px)`, padding: "22px 30px", borderRadius: 24, background: "rgba(8,12,30,.72)", border: `1.5px solid ${K.mint}55`, display: "inline-block" }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: "0.08em", textTransform: "uppercase", color: K.muted }}>The worst case</div>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 50, color: K.mint, marginTop: 4 }}>A number on chain, not a guess</div>
      </div>
    </div>
    </>
  );
};

const Close = ({ f }: { f: number }) => {
  const a = at("close", 0.3);
  if (f < a) return null;
  const l1 = p(f, w("close", "a") - 4, w("close", "a") + 20);
  const l2 = p(f, w("close", "earned") - 14, w("close", "earned") + 14);
  const l3 = p(f, w("close", "let") - 6, w("close", "let") + 20);
  const fin = p(f, end("close") - 230, end("close") - 200);
  const lines = 1 - fin;
  return (
    <>
      <AbsoluteFill style={{ opacity: lines * l1, background: "linear-gradient(180deg, rgba(4,6,16,.82) 0%, rgba(4,6,16,.55) 34%, transparent 52%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 130, textAlign: "center", opacity: lines }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 76, color: K.ink2, opacity: l1, letterSpacing: "-0.03em" }}>A fixed limit is a guess.</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, color: K.mint, opacity: l2, transform: `translateY(${(1 - l2) * 18}px)`, letterSpacing: "-0.035em" }}>Kibble's is earned.</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 44, color: K.ink, opacity: l3, marginTop: 26 }}>
          Don't give your agent a budget. <span style={{ color: K.amber }}>Let it earn one.</span>
        </div>
      </div>
      <AbsoluteFill style={{ background: `rgba(6,10,23,${0.82 * fin})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: fin }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 200, letterSpacing: "-0.06em", color: K.ink, lineHeight: 1, transform: `scale(${0.95 + 0.05 * fin})` }}>
          kibble<span style={{ color: K.amber }}>.</span>
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, color: K.ink2, marginTop: 18 }}>The earned spending limit for AI agents</div>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 30, color: K.mint, marginTop: 40 }}>github.com/mithileshofficial06/kibble</div>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 26, color: K.muted, marginTop: 14 }}>Live on the QDay Aevum testnet</div>
      </AbsoluteFill>
    </>
  );
};
