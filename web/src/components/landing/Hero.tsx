"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useReducer, useRef } from "react";
import aevum from "../../../../deployments/44005.json";
import { repoUrl } from "@/lib/env";
import { amt, short, useDeployment, useDrawers } from "@/lib/kibble";
import { Odometer } from "./Odometer";
import { Printer } from "./Printer";
import { HOLD_MS, SCRIPT, SCRIPT_MS, apply, finalDesk, initialDesk, type Action, type DeskState, type Phase } from "./script";

const EXPLORER = "https://explorer-test.qday.info";

type Msg = { t: "step"; a: Action } | { t: "reset" };
function reducer(s: DeskState, m: Msg): DeskState {
  if (m.t === "reset") return initialDesk(s.loop + 1);
  return { ...apply(s, m.a), step: s.step + 1 };
}

/** Plays the script on a loop while the desk is on screen. */
function useReplay(active: boolean) {
  const [desk, dispatch] = useReducer(reducer, undefined, () => initialDesk());
  const step = useRef(0);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (step.current >= SCRIPT.length) {
        timer = setTimeout(() => {
          step.current = 0;
          dispatch({ t: "reset" });
          timer = setTimeout(next, 900);
        }, HOLD_MS);
        return;
      }
      const [delay, a] = SCRIPT[step.current];
      timer = setTimeout(() => {
        step.current += 1;
        dispatch({ t: "step", a });
        next();
      }, delay);
    };
    next();
    return () => clearTimeout(timer);
  }, [active]);

  return desk;
}

/** With reduced motion there's no replay: the desk shows the outcome. */
const FINAL = finalDesk();

const BANNER: Record<Phase, { tag: string; text: string }> = {
  boot: { tag: "Loading", text: "Feeding paper…" },
  normal: { tag: "Normal traffic", text: "Both agents sell summaries and buy one model call per sale." },
  attack: { tag: "Agent key stolen", text: "The attacker overbuys 0.050 from the real supplier, every 2 s." },
  result: { tag: "Same code · same traffic · same attack", text: "Only one of them needed a human." },
};

export function Hero() {
  const reduce = useReducedMotion() ?? false;
  const deskRef = useRef<HTMLDivElement>(null);
  const inView = useInView(deskRef, { amount: 0.25 });
  const replayed = useReplay(inView && !reduce);
  const desk = reduce ? FINAL : replayed;
  const section = useRef<HTMLElement>(null);
  const frame = useRef(0);

  // The desk lamp follows the pointer.
  const onMove = (e: React.PointerEvent) => {
    if (reduce || frame.current) return;
    const { clientX, clientY } = e;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--lx", `${clientX - r.left}px`);
      el.style.setProperty("--ly", `${clientY - r.top}px`);
    });
  };

  const progress = Math.min(1, SCRIPT.slice(0, desk.step).reduce((t, [d]) => t + d, 0) / SCRIPT_MS);
  const banner = BANNER[desk.phase];

  return (
    <section ref={section} className="ld-hero" onPointerMove={onMove}>
      <div className="ld-lamp" aria-hidden="true" />
      <div className="ld-mat" aria-hidden="true" />

      <LandingNav />

      <div className="ld-grid">
        <div className="ld-copy">
          <motion.p
            className="ld-eyebrow"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="ld-eyebrow-no">No. 0001</span>
            Spending limits that AI agents have to earn
          </motion.p>

          <h1 className="ld-title">
            <Reveal delay={0.15}>Same agent.</Reveal>
            <Reveal delay={0.27}>Same attack.</Reveal>
            <Reveal delay={0.39}>
              One wallet{" "}
              <span className="ld-said">
                <em>said no.</em>
                <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                  <motion.path
                    d="M4 16 C 60 6, 120 22, 180 12 S 270 8, 296 14"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: 1.05, ease: [0.65, 0, 0.35, 1] }}
                  />
                </svg>
              </span>
            </Reveal>
          </h1>

          <motion.p className="ld-lede" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
            Kibble gives an AI agent a spending limit it earns from sales that actually clear. When spending stops paying for itself, or a
            stolen key starts buying, the wallet brakes on its own. No human has to be watching.
          </motion.p>

          <motion.div className="ld-ctas" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.75 }}>
            <Link href="/live" className="ld-btn primary">
              Open the live desk <span aria-hidden="true">→</span>
            </Link>
            <Link href="/playground" className="ld-btn coupon">
              <span className="scissors" aria-hidden="true">✂</span> Try the playground
            </Link>
          </motion.div>

          <motion.p className="ld-fine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
            The tapes replay the hijack from testnet run 2 on QDay Aevum (chain 44005), with that run&apos;s numbers.{" "}
            <a href={`${EXPLORER}/address/${aevum.factory}`} target="_blank" rel="noreferrer">
              Factory on the explorer ↗
            </a>
          </motion.p>
        </div>

        <div ref={deskRef} className="ld-desk" aria-label="Replay: a fixed limit and Kibble under the same attack">
          <p className="sr-only">
            Both agents serve six sales. Then the agent key is stolen and the attacker overbuys 0.050 every two seconds. The fixed-limit drawer
            pays twice (0.100) and stays Healthy, refilling every window. The Kibble drawer refuses at the cost ceiling and pauses itself after
            four seconds; its exposure drops from 0.251 to zero.
          </p>
          <div className={`ld-banner ${desk.phase}`} aria-hidden="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={desk.phase}
                className="ld-banner-row"
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -18, opacity: 0 }}
                transition={{ duration: 0.28 }}
              >
                <span className="ld-banner-tag">{banner.tag}</span>
                <span className="ld-banner-text">{banner.text}</span>
              </motion.div>
            </AnimatePresence>
            <span className="ld-banner-bar" style={{ transform: `scaleX(${progress})` }} />
          </div>

          <div className="ld-printers" aria-hidden="true">
            <Printer
              side={desk.L}
              loop={desk.loop}
              kind="fixed"
              plate="A′ · Fixed limit"
              drawer="Drawer A′ · fixed"
              address={short(aevum.drawers.A_FIXED)}
              enterDelay={0.35}
            />
            <Printer
              side={desk.R}
              loop={desk.loop}
              kind="kibble"
              plate="A · Kibble"
              drawer="Drawer A · earned"
              address={short(aevum.drawers.A)}
              enterDelay={0.5}
            />
          </div>
        </div>
      </div>

      <LiveStrip />
      <Ticker />
    </section>
  );
}

function Reveal({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="ld-reveal">
      <motion.span
        className="ld-reveal-in"
        initial={{ y: "105%", rotate: 3 }}
        animate={{ y: "0%", rotate: 0 }}
        transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function LandingNav() {
  return (
    <motion.nav
      className="ld-nav"
      aria-label="Main"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Link href="/" className="ld-brand">
        <svg viewBox="0 0 24 28" aria-hidden="true">
          <path d="M3 1h18v23l-3-2-3 2-3-2-3 2-3-2-3 2z" />
          <path d="M7 7h10M7 11h10M7 15h6" />
        </svg>
        Kibble
      </Link>
      <div className="ld-nav-links">
        <Link href="/live">Live desk</Link>
        <Link href="/playground">Playground</Link>
        <Link href="/docs">How it works</Link>
        <a href={repoUrl} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>
      <Link href="/live" className="ld-nav-cta">
        <span className="ld-live-dot" aria-hidden="true" /> Live on Aevum
      </Link>
    </motion.nav>
  );
}

/** Real numbers from the chain, right now. */
function LiveStrip() {
  const dep = useDeployment();
  const live = useDrawers(dep.data);
  const d = live.data?.drawers;
  const receipts = d ? Object.values(d).reduce((t, v) => t + Number(v?.receiptCount ?? 0n), 0) : undefined;
  const cells: { k: string; v: string | undefined; sub?: string }[] = [
    { k: "Owner vault", v: live.data ? amt(live.data.vault) : undefined, sub: "tUSD8 · the agent key can't reach it" },
    { k: "Kibble A · earned limit", v: d?.A ? amt(d.A.limitT) : undefined, sub: d?.A?.state },
    { k: "Kibble B · bad strategy", v: d?.B ? amt(d.B.maxLossNow) : undefined, sub: d?.B ? `${d.B.state} · exposure` : undefined },
    { k: "Receipts on chain", v: receipts?.toString(), sub: "across 5 drawers" },
  ];
  return (
    <motion.div className="ld-strip" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.1, duration: 0.6 }}>
      <div className="ld-strip-title">
        <span className="ld-live-dot" aria-hidden="true" />
        <span>
          Live from
          <br />
          Aevum testnet
        </span>
      </div>
      {cells.map((c) => (
        <div key={c.k} className="ld-strip-cell">
          <span className="k">{c.k}</span>
          <span className="v">{c.v === undefined ? <span className="ld-skel" /> : <Odometer value={c.v} />}</span>
          <span className="s">{c.sub ?? " "}</span>
        </div>
      ))}
      <Link href="/live" className="ld-strip-go">
        Open the desk →
      </Link>
    </motion.div>
  );
}

const TICKS = [
  "Paid 0.010 to the supplier",
  "Refused 0.500: above the approval threshold",
  "B paused itself 65 s after the price jump",
  "A paused 4 s into the hijack",
  "Earned limit 0.200 → 0.260",
  "Receipt #13 signed by the owner",
  "The vault was never reachable from the agent key",
  "105 tests · 128k invariant calls",
];

function Ticker() {
  const row = (
    <>
      {TICKS.map((t) => (
        <span key={t}>
          {t}
          <i aria-hidden="true">■</i>
        </span>
      ))}
    </>
  );
  return (
    <div className="ld-ticker" aria-hidden="true">
      <div className="ld-ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}
