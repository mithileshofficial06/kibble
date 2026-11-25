"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { SideTally, Snap, StoryEvent, StorySide } from "@kibble/sdk";
import { StatePill } from "@/components/ui";
import { Term } from "@/components/Term";
import type { Focus } from "./plan";

/*
 * One side of the story: customer, cash box, supplier, vault and (when there is one) the thief. Money is
 * a pour of grains, drawn on a canvas over an SVG scene in the same 520 x 300 space.
 */

const W = 520;
const H = 300;
type P = readonly [number, number];
const AT = { customer: [74, 42], box: [260, 140], supplier: [446, 42], vault: [446, 222], thief: [74, 222] } as const satisfies Record<string, P>;

const SAFFRON = "255,176,0";
const CORAL = "255,77,61";
const MINT = "110,231,168";
const FG = "237,232,227";

type Grain = { from: P; to: P; bend: number; t0: number; dur: number; col: string; r: number; jx: number; jy: number; bounce: boolean };

function pour(list: Grain[], from: P, to: P, col: string, opts: { n?: number; bounce?: boolean; delay?: number; bend?: number; dur?: number } = {}) {
  const now = performance.now() + (opts.delay ?? 0);
  const n = opts.n ?? 22;
  for (let i = 0; i < n; i++) {
    list.push({
      from, to, col, bounce: Boolean(opts.bounce),
      bend: opts.bend ?? 0,
      t0: now + (i / n) * 260 + Math.random() * 60,
      dur: (opts.dur ?? 620) + Math.random() * 160,
      r: 1.3 + Math.random() * 1.5,
      jx: (Math.random() - 0.5) * 18,
      jy: (Math.random() - 0.5) * 18,
    });
  }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function useGrains(event: StoryEvent | undefined, side: StorySide, seq: number, prev: Snap | undefined, snap: Snap | undefined, fast: boolean) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const grains = useRef<Grain[]>([]);
  const raf = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !event || event.kind !== "flow" || event.side !== side) return;
    const g = grains.current;
    const n = fast ? 9 : 22;
    const dur = fast ? 380 : 640;
    const bad = event.by !== "agent";
    switch (event.step) {
      case "sale":
        pour(g, AT.customer, AT.box, SAFFRON, { n, dur, bend: -26 });
        break;
      case "buy":
        pour(g, AT.box, AT.supplier, bad ? CORAL : FG, { n, dur, bend: -26 });
        break;
      case "refused":
        pour(g, bad ? AT.thief : AT.supplier, AT.box, CORAL, { n, dur: dur + 160, bounce: true, bend: bad ? 26 : 26 });
        break;
      case "refund":
        pour(g, AT.box, AT.customer, FG, { n: Math.ceil(n / 2), dur, bend: 26 });
        break;
      case "earned":
        if (side === "kibble" && snap && prev && snap.saved > prev.saved) pour(g, AT.box, AT.vault, MINT, { n, dur, bend: 26 });
        break;
      default:
        break;
    }
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      if (el.width !== Math.round(w * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(((w * H) / W) * dpr);
      }
      const k = (w / W) * dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      const keep: Grain[] = [];
      ctx.globalCompositeOperation = "lighter";
      for (const p of grains.current) {
        const raw = (now - p.t0) / p.dur;
        if (raw >= 1) continue;
        keep.push(p);
        if (raw < 0) continue;
        // a refused grain reaches the wall of the box, then falls back
        const u = p.bounce ? (raw < 0.5 ? ease(raw * 2) * 0.72 : 0.72 - ease((raw - 0.5) * 2) * 0.5) : ease(raw);
        const [ax, ay] = p.from;
        const [bx, by] = p.to;
        const mx = (ax + bx) / 2 + (by - ay) * (p.bend / 120);
        const my = (ay + by) / 2 - (bx - ax) * (p.bend / 120);
        const spread = Math.sin(Math.PI * Math.min(1, u));
        const x = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx + p.jx * spread;
        const y = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by + p.jy * spread;
        const a = Math.min(1, raw * 6, (1 - raw) * 5);
        ctx.fillStyle = `rgba(${p.col},${0.16 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 3.4, 0, 7);
        ctx.fill();
        ctx.fillStyle = `rgba(${p.col},${0.95 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, 7);
        ctx.fill();
      }
      grains.current = keep;
      raf.current = keep.length ? requestAnimationFrame(draw) : 0;
      if (!keep.length) ctx.clearRect(0, 0, W, H);
    };
    if (!raf.current) raf.current = requestAnimationFrame(draw);
    // the event is identified by its position in the story
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );
  return canvas;
}

function Node({ at, label, sub, on, tone, children }: { at: P; label: string; sub?: string; on?: boolean; tone?: string; children: React.ReactNode }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} className={`sn ${on ? "on" : ""} ${tone ?? ""}`}>
      <circle r={30} className="sn-disc" />
      <g className="sn-icon">{children}</g>
      <text y={50} className="sn-label">
        {label}
      </text>
      {sub && (
        <text y={66} className="sn-sub">
          {sub}
        </text>
      )}
    </g>
  );
}

const f3 = (x: number | undefined) => (x === undefined ? "…" : x.toFixed(3));

export function Lane({
  side,
  title,
  about,
  focus,
  event,
  seq,
  snap,
  prev,
  tally,
  scale,
  fast,
  change,
}: {
  side: StorySide;
  title: string;
  about: string;
  focus: Focus;
  event?: StoryEvent;
  seq: number;
  snap?: Snap;
  prev?: Snap;
  tally: SideTally;
  scale: number;
  fast: boolean;
  change?: string;
}) {
  const canvas = useGrains(event, side, seq, prev, snap, fast);
  const mine = event?.kind === "flow" && event.side === side ? event : undefined;
  const refused = mine?.step === "refused";
  const stopped = snap?.state === "Paused";
  const limit = snap?.limit ?? 0;
  const level = Math.max(0, Math.min(1, (snap?.canSpend ?? 0) / scale));
  const mark = Math.max(0, Math.min(1, limit / scale));
  const boxW = 148;
  const boxH = 96;
  const lost = snap && tally.first ? snap.spent - snap.earned - (tally.first.spent - tally.first.earned) : 0;

  const stats: { label: React.ReactNode; value: string; tone?: string }[] =
    focus === "sales"
      ? [
          { label: "Customers served", value: String(tally.served) },
          { label: "Turned away", value: String(tally.turnedAway), tone: tally.turnedAway ? "coral" : undefined },
          { label: <Term k="limit" />, value: f3(snap?.limit), tone: side === "kibble" ? "saffron" : undefined },
        ]
      : focus === "loss"
        ? [
            { label: "Lost so far", value: f3(Math.max(0, lost)), tone: lost > 0.0005 ? "coral" : undefined },
            { label: "Payments refused", value: String(tally.refused) },
            { label: <Term k="exposure" />, value: f3(snap?.exposure), tone: snap?.exposure === 0 ? "mint" : undefined },
          ]
        : [
            { label: "Thief spent", value: f3(tally.stolen), tone: tally.stolen > 0 ? "coral" : "mint" },
            { label: "Attempts blocked", value: String(tally.blocked) },
            { label: <Term k="exposure" />, value: f3(snap?.exposure), tone: snap?.exposure === 0 ? "mint" : undefined },
          ];

  return (
    <article className={`lane ${side} ${stopped ? "stopped" : ""}`} aria-label={title}>
      <header className="lane-top">
        <div>
          <p className="lane-kind">
            <i aria-hidden="true" /> {side === "kibble" ? "Kibble" : "Fixed limit"}
          </p>
          <h3>{title}</h3>
        </div>
        <StatePill state={snap?.state} />
      </header>
      <p className="lane-about">{about}</p>

      <div className="lane-scene">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Money moving between the customer, the cash box, the supplier${side === "kibble" ? " and the owner's vault" : ""}`}>
          <g className="lane-wires">
            <path d={`M${AT.customer[0] + 30} ${AT.customer[1] + 10} L${AT.box[0] - boxW / 2} ${AT.box[1] - 18}`} />
            <path d={`M${AT.box[0] + boxW / 2} ${AT.box[1] - 18} L${AT.supplier[0] - 30} ${AT.supplier[1] + 10}`} />
            {side === "kibble" && <path d={`M${AT.box[0] + boxW / 2} ${AT.box[1] + 22} L${AT.vault[0] - 30} ${AT.vault[1] - 10}`} />}
            {focus === "theft" && <path className="danger" d={`M${AT.thief[0] + 30} ${AT.thief[1] - 10} L${AT.box[0] - boxW / 2} ${AT.box[1] + 22}`} />}
          </g>

          <Node at={AT.customer} label={focus === "theft" ? "Customers" : "Customer"} on={mine?.step === "sale" || mine?.step === "refund"}>
            <circle cy={-6} r={6.5} />
            <path d="M-12 13c1.5-8 6-11 12-11s10.5 3 12 11" />
          </Node>
          <Node at={AT.supplier} label="Supplier" on={mine?.step === "buy"} tone={mine?.step === "buy" && mine.by !== "agent" ? "coral" : ""}>
            <rect x={-11} y={-11} width={22} height={8} rx={2} />
            <rect x={-11} y={2} width={22} height={8} rx={2} />
            <path d="M-6 -7h.01M-6 6h.01" />
          </Node>
          {side === "kibble" ? (
            <Node at={AT.vault} label="Owner's vault" sub={f3(snap?.saved)} on={mine?.step === "earned"} tone="mint">
              <circle r={12} />
              <circle r={3.5} />
              <path d="M0 -12v4M0 8v4M-12 0h4M8 0h4" />
            </Node>
          ) : (
            <Node at={AT.vault} label="No vault" sub="profit stays in the box" tone="off">
              <path d="M-10 -10l20 20M10 -10l-20 20" />
            </Node>
          )}
          {focus === "theft" && (
            <Node at={AT.thief} label={mine?.by === "tricked" ? "Attacker" : "Thief"} sub="has the agent's key" on={Boolean(mine && mine.by !== "agent")} tone="coral">
              <path d="M-14 -4c5 -5 23 -5 28 0c0 8 -8 10 -11 5c-1 -2 -5 -2 -6 0c-3 5 -11 3 -11 -5z" />
            </Node>
          )}

          <g transform={`translate(${AT.box[0] - boxW / 2} ${AT.box[1] - boxH / 2})`} className={`sbox ${refused ? "hit" : ""} ${stopped ? "shut" : ""}`}>
            <clipPath id={`clip-${side}`}>
              <rect width={boxW} height={boxH} rx={12} />
            </clipPath>
            <rect width={boxW} height={boxH} rx={12} className="sbox-bg" />
            <g clipPath={`url(#clip-${side})`}>
              <motion.rect
                width={boxW}
                height={boxH}
                className="sbox-fill"
                initial={false}
                animate={{ y: boxH * (1 - level) }}
                transition={{ type: "spring", stiffness: 60, damping: 16 }}
              />
            </g>
            <rect width={boxW} height={boxH} rx={12} className="sbox-edge" />
            <motion.g className="sbox-mark" initial={false} animate={{ y: boxH * (1 - mark) }} transition={{ type: "spring", stiffness: 60, damping: 16 }}>
              <path d={`M-9 0h18M${boxW - 9} 0h18`} />
            </motion.g>
            <text x={boxW / 2} y={50} className="sbox-num">
              {f3(snap?.canSpend)}
            </text>
            <text x={boxW / 2} y={72} className="sbox-label">
              {stopped ? "locked" : "can spend now"}
            </text>
            <text x={boxW / 2} y={-12} className="sbox-title">
              Cash box
            </text>
            <text x={boxW / 2} y={boxH + 20} className="sbox-label">
              {side === "kibble" ? "earned limit" : "limit"} {f3(snap?.limit)}
            </text>
          </g>
        </svg>
        <canvas ref={canvas} aria-hidden="true" />
        <AnimatePresence>
          {change && (
            <motion.p
              key={change}
              className={`lane-flash ${change}`}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {change === "Paused" ? "The wallet stopped this agent by itself" : change === "Braked" ? "The wallet hits the brakes" : change === "Watch" ? "Strike: now on watch" : `Now ${change}`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <dl className="lane-stats">
        {stats.map((s, i) => (
          <div key={i}>
            <dt>{s.label}</dt>
            <dd className={s.tone}>{s.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
