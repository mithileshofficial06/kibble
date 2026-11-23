"use client";

import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useReducer, useRef } from "react";
import { repoUrl } from "@/lib/env";
import { amt, useDeployment, useDrawers } from "@/lib/kibble";
import { Odometer } from "./Odometer";

/*
 * The hero tells run 2 on Aevum testnet in one number: agent A's earned limit.
 * It climbs as sales clear (0.200 → 0.260), then the key is stolen, the attacker's
 * buys hit the cost ceiling, and the drawer pauses itself: exposure 0.251 → 0.000.
 */

type Phase = "earn" | "hijack" | "paused";
type Bar = { id: number; h: number; kind: "sale" | "attack" };
type State = { phase: Phase; limit: string; bars: Bar[]; pulse: number; loop: number };
type Act = { t: "sale" | "attack" | "hijack" | "paused" } | { t: "limit"; v: string } | { t: "reset" };

const START: State = { phase: "earn", limit: "0.200", bars: [], pulse: 0, loop: 0 };
const END: State = {
  phase: "paused",
  limit: "0.260",
  bars: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: i + 1, h: saleHeight(i + 1), kind: "sale" as const })),
    ...[13, 14, 15].map((id) => ({ id, h: 1, kind: "attack" as const })),
  ],
  pulse: 0,
  loop: 0,
};

function saleHeight(i: number) {
  return 0.34 + (((i * 37) % 23) / 23) * 0.3 + i * 0.012;
}

function reducer(s: State, a: Act): State {
  switch (a.t) {
    case "sale": {
      const id = s.bars.length + 1;
      return { ...s, bars: [...s.bars, { id, h: saleHeight(id), kind: "sale" }], pulse: s.pulse + 1 };
    }
    case "attack":
      return { ...s, bars: [...s.bars, { id: s.bars.length + 1, h: 1, kind: "attack" }], pulse: s.pulse + 1 };
    case "limit":
      return { ...s, limit: a.v };
    case "hijack":
      return { ...s, phase: "hijack" };
    case "paused":
      return { ...s, phase: "paused" };
    case "reset":
      return { ...START, loop: s.loop + 1 };
  }
}

/** [delay before, action] */
const SCRIPT: [number, Act][] = (() => {
  const s: [number, Act][] = [];
  const limits: Record<number, string> = { 4: "0.218", 8: "0.239", 12: "0.260" };
  for (let i = 1; i <= 12; i++) {
    s.push([i === 1 ? 900 : 480, { t: "sale" }]);
    if (limits[i]) s.push([0, { t: "limit", v: limits[i] }]);
  }
  s.push([1100, { t: "hijack" }]);
  for (let i = 0; i < 3; i++) s.push([i === 0 ? 900 : 750, { t: "attack" }]);
  s.push([1000, { t: "paused" }]);
  return s;
})();
const HOLD = 5200;

function useReplay(active: boolean) {
  const [state, dispatch] = useReducer(reducer, START);
  const i = useRef(0);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (i.current >= SCRIPT.length) {
        timer = setTimeout(() => {
          i.current = 0;
          dispatch({ t: "reset" });
          next();
        }, HOLD);
        return;
      }
      const [delay, act] = SCRIPT[i.current];
      timer = setTimeout(() => {
        i.current += 1;
        dispatch(act);
        next();
      }, delay);
    };
    next();
    return () => clearTimeout(timer);
  }, [active]);
  return state;
}

const STEPS: { key: Phase; n: string; title: string; text: string }[] = [
  { key: "earn", n: "01", title: "Earn", text: "Each sale that clears raises the limit." },
  { key: "hijack", n: "02", title: "Hijack", text: "A stolen key starts overbuying." },
  { key: "paused", n: "03", title: "Paused", text: "The wallet stops itself in 4 s." },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const reduce = useReducedMotion() ?? false;
  const meterRef = useRef<HTMLDivElement>(null);
  const inView = useInView(meterRef, { amount: 0.3 });
  const live = useReplay(inView && !reduce);
  const s = reduce ? END : live;
  const danger = s.phase !== "earn";

  // A little depth: the number drifts against the pointer.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const numX = useTransform(sx, (v) => v * -18);
  const numY = useTransform(sy, (v) => v * -10);
  const auraX = useTransform(sx, (v) => v * 40);
  const auraY = useTransform(sy, (v) => v * 30);
  const onMove = (e: React.PointerEvent) => {
    if (reduce) return;
    mx.set(e.clientX / window.innerWidth - 0.5);
    my.set(e.clientY / window.innerHeight - 0.5);
  };

  return (
    <section className={`k-hero ${danger ? "danger" : ""}`} onPointerMove={onMove}>
      <div className="k-grain" aria-hidden="true" />
      <Nav />

      <div className="k-stage">
        <motion.aside
          className="k-rail"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          <span className="k-rail-n">K—01</span>
          <span className="k-rail-text">Earned spending limits for AI agents · QDay Aevum · Chain 44005</span>
        </motion.aside>

        <div className="k-head">
          <motion.p className="k-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <span className="k-dot" aria-hidden="true" /> A wallet contract for AI agents
          </motion.p>
          <h1 className="k-title">
            <Line delay={0.1}>Don&apos;t give your agent</Line>
            <Line delay={0.2}>a budget.</Line>
            <Line delay={0.34}>
              Let it <em>earn</em> one.
            </Line>
          </h1>
        </div>

        <div className="k-meter" ref={meterRef}>
          <motion.div
            className="k-aura"
            aria-hidden="true"
            style={{ x: auraX, y: auraY }}
            animate={{ scale: [1, 1.07, 1] }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            key={s.pulse}
          />
          <div className="k-meter-label" aria-hidden="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={s.phase === "paused" ? "exp" : "lim"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                {s.phase === "paused" ? "Agent A · hijack exposure · tUSD8" : "Agent A · earned limit · tUSD8"}
              </motion.span>
            </AnimatePresence>
          </div>

          <motion.div className="k-number" style={{ x: numX, y: numY }} aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              {s.phase === "paused" ? (
                <motion.span
                  key={`z-${s.loop}`}
                  className="k-number-in zero"
                  initial={{ opacity: 0, filter: "blur(18px)", scale: 1.08 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                  exit={{ opacity: 0, filter: "blur(18px)" }}
                  transition={{ duration: 0.9, ease: EASE }}
                >
                  0.000
                </motion.span>
              ) : (
                <motion.span
                  key={`l-${s.loop}`}
                  className="k-number-in"
                  initial={{ opacity: 0, filter: "blur(18px)", y: 30 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  exit={{ opacity: 0, filter: "blur(18px)", scale: 0.94 }}
                  transition={{ duration: 0.9, ease: EASE, delay: s.loop === 0 ? 0.5 : 0 }}
                >
                  <Odometer value={s.limit} />
                </motion.span>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {s.phase === "paused" && (
                <motion.em
                  key={`p-${s.loop}`}
                  className="k-paused"
                  initial={{ opacity: 0, x: -20, rotate: -4 }}
                  animate={{ opacity: 1, x: 0, rotate: -4 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}
                >
                  Paused.
                </motion.em>
              )}
            </AnimatePresence>
          </motion.div>

          <Bars state={s} />

          <div className="k-compare">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={s.phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                {s.phase === "earn" && "Same traffic on a fixed limit: stuck at 0.050, forever."}
                {s.phase === "hijack" && "Attacker buys 0.050 every 2 s. Each one hits the cost ceiling."}
                {s.phase === "paused" && "Overbought 0.000. The fixed-limit twin overbought 0.100 and kept going."}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="sr-only">
            Replay of testnet run 2: agent A&apos;s earned limit rises from 0.200 to 0.260 over twelve sales. When its key is stolen, every
            purchase hits the cost ceiling and the wallet pauses itself in four seconds. Hijack exposure drops to 0.000, while a fixed-limit
            agent overbought 0.100 and kept running.
          </p>
        </div>

        <motion.div className="k-intro" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.55, ease: EASE }}>
          <p>
            Kibble grows an agent&apos;s spending limit from sales that actually clear, and pulls it back the moment spending stops paying off,
            or a stolen key starts buying. No human has to be watching.
          </p>
          <div className="k-ctas">
            <Link href="/live" className="k-btn">
              <span>See it live</span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link href="/docs" className="k-link">
              How it works
            </Link>
          </div>
        </motion.div>

        <motion.ol className="k-steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}>
          {STEPS.map((st) => {
            const idx = STEPS.findIndex((x) => x.key === s.phase);
            const me = STEPS.findIndex((x) => x.key === st.key);
            return (
              <li key={st.key} className={me === idx ? "on" : me < idx ? "done" : undefined}>
                <span className="k-step-n">{st.n}</span>
                <span className="k-step-t">{st.title}</span>
                <span className="k-step-x">{st.text}</span>
                <span className="k-step-bar" aria-hidden="true" />
              </li>
            );
          })}
        </motion.ol>
      </div>

      <LiveLine />
    </section>
  );
}

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="k-line">
      <motion.span
        className="k-line-in"
        initial={{ y: "110%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 1, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** One thin bar per sale; the attacker's buys shoot up, hit the cost ceiling and fall back. */
function Bars({ state }: { state: State }) {
  return (
    <div className="k-bars" aria-hidden="true">
      <AnimatePresence>
        {state.phase !== "earn" && (
          <motion.div
            key={`ceil-${state.loop}`}
            className="k-ceiling"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <span>cost ceiling</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="k-bars-row" key={state.loop}>
        {state.bars.map((b) =>
          b.kind === "sale" ? (
            <motion.span
              key={b.id}
              className="k-bar"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: b.h }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            />
          ) : (
            <span key={b.id} className="k-bar-slot">
              <motion.span
                className="k-bar attack"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0, 1.05, 0.58, 0.58] }}
                transition={{ duration: 0.9, times: [0, 0.35, 0.6, 1], ease: "easeOut" }}
              />
              <motion.span
                className="k-x"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, type: "spring", stiffness: 500, damping: 18 }}
              >
                ×
              </motion.span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function Nav() {
  return (
    <motion.nav className="k-nav" aria-label="Main" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
      <Link href="/" className="k-brand">
        kibble<span aria-hidden="true">.</span>
      </Link>
      <div className="k-nav-links">
        <Link href="/live">Live</Link>
        <Link href="/playground">Playground</Link>
        <Link href="/docs">How it works</Link>
        <a href={repoUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
      <Link href="/live" className="k-nav-cta">
        Open app
      </Link>
    </motion.nav>
  );
}

/** The actual chain, right now, in one quiet line. */
function LiveLine() {
  const dep = useDeployment();
  const live = useDrawers(dep.data);
  const d = live.data?.drawers;
  const receipts = d ? Object.values(d).reduce((t, v) => t + Number(v?.receiptCount ?? 0n), 0) : undefined;
  return (
    <motion.div className="k-live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }}>
      <span className="k-live-tag">
        <span className="k-dot" aria-hidden="true" /> Live on Aevum testnet
      </span>
      <span>
        Agent A limit <b>{d?.A ? amt(d.A.limitT) : "…"}</b> · {d?.A?.state ?? "…"}
      </span>
      <span>
        Owner vault <b>{live.data ? amt(live.data.vault) : "…"}</b> tUSD8
      </span>
      <span>
        <b>{receipts ?? "…"}</b> receipts on chain
      </span>
      <Link href="/live" className="k-live-go">
        Open the live view →
      </Link>
    </motion.div>
  );
}
