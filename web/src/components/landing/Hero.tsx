"use client";

import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import { amt, useDeployment, useDrawers } from "@/lib/kibble";
import { Odometer } from "./Odometer";

/*
 * The hero replays testnet run 2 on Aevum: two agents with the same traffic and the same attack.
 * Kibble agent A's limit grows with cleared sales (0.200 → 0.260). Then its key is stolen: every
 * buy hits the cost ceiling and the wallet pauses it after 4 s. The fixed-limit twin pays 0.100
 * to the attacker and carries on.
 */

type Phase = "earn" | "hijack" | "paused";
type Bar = { id: number; h: number; kind: "sale" | "attack" };
type State = {
  phase: Phase;
  limit: string;
  delta: { id: number; text: string } | null;
  bars: Bar[];
  fixedLost: string;
  loop: number;
  seek: number;
};
type Act =
  | { t: "sale" }
  | { t: "attack"; fixedLost?: string }
  | { t: "limit"; v: string }
  | { t: "phase"; p: Phase }
  | { t: "reset" }
  | { t: "set"; s: State };

const START: State = { phase: "earn", limit: "0.200", delta: null, bars: [], fixedLost: "0.000", loop: 0, seek: 0 };

function saleHeight(i: number) {
  return 0.3 + (((i * 37) % 23) / 23) * 0.22 + i * 0.022;
}

function reducer(s: State, a: Act): State {
  switch (a.t) {
    case "sale": {
      const id = s.bars.length + 1;
      return { ...s, bars: [...s.bars, { id, h: saleHeight(id), kind: "sale" }] };
    }
    case "attack":
      return {
        ...s,
        bars: [...s.bars, { id: s.bars.length + 1, h: 1, kind: "attack" }],
        fixedLost: a.fixedLost ?? s.fixedLost,
      };
    case "limit": {
      const d = Number(a.v) - Number(s.limit);
      const text = `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`;
      return { ...s, limit: a.v, delta: { id: (s.delta?.id ?? 0) + 1, text } };
    }
    case "phase":
      return { ...s, phase: a.p };
    case "reset":
      return { ...START, loop: s.loop + 1, seek: s.seek };
    case "set":
      return a.s;
  }
}

/** [delay before, action] */
const SCRIPT: [number, Act][] = (() => {
  const s: [number, Act][] = [];
  const limits: Record<number, string> = { 3: "0.209", 6: "0.218", 9: "0.239", 12: "0.260" };
  for (let i = 1; i <= 12; i++) {
    s.push([i === 1 ? 1100 : 560, { t: "sale" }]);
    if (limits[i]) s.push([120, { t: "limit", v: limits[i] }]);
  }
  s.push([1200, { t: "phase", p: "hijack" }]);
  s.push([1300, { t: "attack", fixedLost: "0.050" }]);
  s.push([900, { t: "attack", fixedLost: "0.100" }]);
  s.push([900, { t: "attack" }]);
  s.push([1000, { t: "phase", p: "paused" }]);
  s.push([450, { t: "limit", v: "0.000" }]);
  return s;
})();
const HOLD = 6500;
const AT: Record<Phase, number> = {
  earn: 0,
  hijack: SCRIPT.findIndex(([, a]) => a.t === "phase" && a.p === "hijack"),
  paused: SCRIPT.findIndex(([, a]) => a.t === "phase" && a.p === "paused"),
};
const sum = (from: number, to: number) => SCRIPT.slice(from, to).reduce((t, [d]) => t + d, 0);
/** How long each phase lasts, for the story bars. */
const DURATION: Record<Phase, number> = {
  earn: sum(0, AT.hijack + 1),
  hijack: sum(AT.hijack + 1, AT.paused + 1),
  paused: sum(AT.paused + 1, SCRIPT.length) + HOLD,
};
const END: State = SCRIPT.reduce((s, [, a]) => reducer(s, a), START);

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
  }, [active, state.seek]);

  /** Jump to the start of a phase; the loop carries on from there. */
  const jump = (p: Phase) => {
    const n = p === "earn" ? 0 : AT[p] + 1;
    i.current = n;
    const base = { ...START, loop: state.loop + 1, seek: state.seek + 1 };
    dispatch({ t: "set", s: SCRIPT.slice(0, n).reduce((s, [, a]) => reducer(s, a), base) });
  };

  return { state, jump };
}

const STEPS: { key: Phase; n: string; title: string; caption: string }[] = [
  { key: "earn", n: "01", title: "Earn", caption: "Every sale that clears raises how much the agent is allowed to spend." },
  { key: "hijack", n: "02", title: "Hijack", caption: "Someone steals the agent's key and starts buying. Each buy hits the cost ceiling and is refused." },
  { key: "paused", n: "03", title: "Paused", caption: "Four seconds in, the wallet pauses the agent on its own. Its spending limit drops to zero." },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  // Only the browser knows this: render like the server first, then switch (no hydration mismatch).
  const prefersReduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && prefersReduced;
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inView = useInView(panelRef, { amount: 0.3 });
  // Entrance plays when the section scrolls into view (the intro sits above it).
  const seen = useInView(sectionRef, { once: true, amount: 0.2 });
  const show = seen || reduce;
  const on = <T,>(v: T) => (show ? v : undefined);
  const { state: live, jump } = useReplay(inView && !reduce);
  const s = reduce ? END : live;
  const step = STEPS.find((x) => x.key === s.phase)!;

  // Depth: the number and the glow drift against the pointer.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 16 });
  const sy = useSpring(my, { stiffness: 50, damping: 16 });
  const numX = useTransform(sx, (v) => v * -16);
  const numY = useTransform(sy, (v) => v * -10);
  const glowX = useTransform(sx, (v) => v * 60);
  const glowY = useTransform(sy, (v) => v * 40);
  const onMove = (e: React.PointerEvent) => {
    if (reduce) return;
    mx.set(e.clientX / window.innerWidth - 0.5);
    my.set(e.clientY / window.innerHeight - 0.5);
  };

  const sales = s.bars.filter((b) => b.kind === "sale").length;

  return (
    <section ref={sectionRef} id="replay" className="k-hero" data-phase={s.phase} onPointerMove={onMove}>
      <div className="k-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="k-grain" aria-hidden="true" />
      <div className="k-vignette" aria-hidden="true" />

      <div className="k-stage">
        <motion.aside className="k-rail" aria-hidden="true" initial={{ opacity: 0 }} animate={on({ opacity: 1 })} transition={{ delay: 0.8, duration: 1 }}>
          <span className="k-rail-n">K—01</span>
          <span className="k-rail-text">Earned spending limits for AI agents · QDay Aevum · Chain 44005</span>
        </motion.aside>

        {/* ------------------------------------------------ left: the pitch */}
        <div className="k-left">
          <motion.p className="k-eyebrow" initial={{ opacity: 0, y: 10 }} animate={on({ opacity: 1, y: 0 })} transition={{ duration: 0.7, ease: EASE }}>
            <span className="k-dot" aria-hidden="true" /> A wallet contract for AI agents
          </motion.p>
          <h2 className="k-title">
            <Words show={show} text="Don't give your agent a budget." delay={0.1} />
            <span className="k-title-2">
              <Words show={show} text="Let it" delay={0.45} />{" "}
              <span className="k-earn">
                <Words show={show} text="earn" delay={0.55} className="k-earn-word" />
                <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                  <motion.path
                    d="M3 14 C 50 4, 110 18, 197 8"
                    initial={{ pathLength: 0 }}
                    animate={on({ pathLength: 1 })}
                    transition={{ duration: 0.8, delay: 1.2, ease: EASE }}
                  />
                </svg>
              </span>{" "}
              <Words show={show} text="one." delay={0.65} />
            </span>
          </h2>

          <motion.p className="k-sub" initial={{ opacity: 0, y: 14 }} animate={on({ opacity: 1, y: 0 })} transition={{ duration: 0.8, delay: 0.8, ease: EASE }}>
            AI agents now pay for things by themselves. Kibble is the wallet that decides how much: an agent may only spend what its sales have
            earned. If it starts losing money, or its key gets stolen, the wallet stops it. No human has to be watching.
          </motion.p>

          <motion.div className="k-ctas" initial={{ opacity: 0, y: 14 }} animate={on({ opacity: 1, y: 0 })} transition={{ duration: 0.8, delay: 0.95, ease: EASE }}>
            <Link href="/live" className="k-btn">
              <span>See it live</span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link href="/docs" className="k-link">
              How it works
            </Link>
          </motion.div>

          <motion.dl className="k-facts" initial={{ opacity: 0 }} animate={on({ opacity: 1 })} transition={{ delay: 1.2, duration: 0.8 }}>
            <Fact run={show} to={4} suffix=" s" label="to pause a hijacked agent" />
            <Fact run={show} to={0} decimals={3} label="overbought by the attacker" />
            <Fact run={show} to={105} label="tests, on a live testnet" />
          </motion.dl>
        </div>

        {/* ------------------------------------------------ right: the replay */}
        <motion.div
          ref={panelRef}
          className="k-panel"
          initial={{ opacity: 0, y: 30 }}
          animate={on({ opacity: 1, y: 0 })}
          transition={{ duration: 1, delay: 0.35, ease: EASE }}
        >
          <i className="k-crop tl" aria-hidden="true" />
          <i className="k-crop tr" aria-hidden="true" />
          <i className="k-crop bl" aria-hidden="true" />
          <i className="k-crop br" aria-hidden="true" />

          <div className="k-panel-top">
            <span className="k-panel-tag">
              <span className="k-rec" aria-hidden="true" /> Replay · testnet run 2
            </span>
            <button type="button" className="k-replay" onClick={() => jump("earn")} disabled={reduce}>
              ↻ Replay
            </button>
          </div>

          <ol className="k-story" aria-label="Steps">
            {STEPS.map((st, idx) => {
              const cur = STEPS.findIndex((x) => x.key === s.phase);
              const cls = idx === cur ? "on" : idx < cur ? "done" : "";
              return (
                <li key={st.key} className={cls}>
                  <button type="button" onClick={() => jump(st.key)} disabled={reduce} aria-current={idx === cur ? "step" : undefined}>
                    <span className="k-story-track">
                      <span
                        key={idx === cur ? `${s.loop}-${s.seek}` : "x"}
                        className="k-story-fill"
                        style={idx === cur && !reduce ? { animationDuration: `${DURATION[st.key]}ms` } : undefined}
                      />
                    </span>
                    <span className="k-story-n">{st.n}</span>
                    <span className="k-story-t">{st.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="k-caption" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={s.phase} initial="hide" animate="show" exit="out">
                {step.caption.split(" ").map((w, k) => (
                  <motion.span
                    key={k}
                    variants={{
                      hide: { opacity: 0, y: 10, filter: "blur(6px)" },
                      show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: k * 0.03, duration: 0.4 } },
                      out: { opacity: 0, y: -6, transition: { duration: 0.18 } },
                    }}
                  >
                    {w}{" "}
                  </motion.span>
                ))}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="k-meter">
            <motion.div className="k-glow" aria-hidden="true" style={{ x: glowX, y: glowY }} />
            <p className="k-meter-label">
              <span>Kibble agent</span> can spend up to <span className="k-unit">tUSD8</span>
            </p>
            <motion.div className="k-number" style={{ x: numX, y: numY }}>
              <span className="k-number-in" data-pour-target>
                <Odometer value={s.limit} />
              </span>
              <AnimatePresence>
                {s.delta && (
                  <motion.span
                    key={`${s.delta.id}-${s.loop}`}
                    className={`k-delta ${s.delta.text.startsWith("−") ? "down" : ""}`}
                    initial={{ opacity: 0, y: 16, scale: 0.8 }}
                    animate={{ opacity: [0, 1, 1, 0], y: [16, 0, -6, -22], scale: 1 }}
                    transition={{ duration: 1.8, times: [0, 0.15, 0.7, 1] }}
                  >
                    {s.delta.text}
                  </motion.span>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {s.phase === "paused" && (
                  <motion.span
                    key={`strike-${s.loop}`}
                    className="k-strike"
                    aria-hidden="true"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1, opacity: [1, 1, 0.25] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, times: [0, 0.35, 1], ease: EASE }}
                  />
                )}
              </AnimatePresence>
              <AnimatePresence>
                {s.phase === "paused" && (
                  <motion.em
                    key={`p-${s.loop}`}
                    className="k-paused"
                    initial={{ opacity: 0, x: -20, rotate: -5 }}
                    animate={{ opacity: 1, x: 0, rotate: -5 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.7 }}
                  >
                    <Lock /> Paused.
                  </motion.em>
                )}
              </AnimatePresence>
            </motion.div>

            <Bars state={s} />
            <div className="k-legend" aria-hidden="true">
              <span>
                <i className="sale" /> a sale that cleared <b>{sales}</b>
              </span>
              <span className={s.phase === "earn" ? "dim" : ""}>
                <i className="attack" /> attacker&apos;s buy, refused <b>{s.bars.length - sales}</b>
              </span>
            </div>
          </div>

          <Compare s={s} />
        </motion.div>
      </div>

      <LiveLine show={show} />
    </section>
  );
}

/** Kibble and the fixed-limit twin, side by side, under the same traffic and attack. */
function Compare({ s }: { s: State }) {
  const attacked = s.phase !== "earn";
  return (
    <div className="k-compare">
      <div className="k-compare-head">
        <span>Same traffic, same attack</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={attacked ? "lost" : "limit"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {attacked ? "Lost to the attacker" : "Spending limit"}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="k-row kibble">
        <span className="k-who">
          <i /> Kibble agent
        </span>
        <span className="k-val">
          <Odometer value={attacked ? "0.000" : s.limit} />
        </span>
        <span className={`k-pill ${s.phase === "paused" ? "safe" : attacked ? "warn" : "up"}`}>
          {s.phase === "earn" ? "↑ grows with sales" : s.phase === "hijack" ? "refusing every buy" : "paused itself"}
        </span>
      </div>
      <div className="k-row fixed">
        <span className="k-who">
          <i /> Fixed-limit agent
        </span>
        <span className="k-val">
          <Odometer value={attacked ? s.fixedLost : "0.050"} />
        </span>
        <span className={`k-pill ${attacked ? "bad" : "flat"}`}>{attacked ? "still spending" : "— never changes"}</span>
      </div>
    </div>
  );
}

/** One bar per sale; each one sends a spark up to the number. The attacker's buys bounce off the ceiling. */
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
            <span key={b.id} className="k-bar-slot">
              <motion.span
                className="k-bar"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: b.h }}
                transition={{ type: "spring", stiffness: 240, damping: 20 }}
              />
              <motion.span
                className="k-spark"
                initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: [0, 1, 1, 0], x: [0, -14, -40, -70], y: [0, -60, -120, -150], scale: [0.6, 1, 0.8, 0.3] }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </span>
          ) : (
            <span key={b.id} className="k-bar-slot">
              <motion.span
                className="k-bar attack"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0, 1.05, 0.52, 0.52] }}
                transition={{ duration: 0.9, times: [0, 0.35, 0.62, 1], ease: "easeOut" }}
              />
              <motion.span
                className="k-x"
                initial={{ opacity: 0, scale: 0.3, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.32, type: "spring", stiffness: 500, damping: 16 }}
              >
                ×
              </motion.span>
              <motion.span
                className="k-ring"
                initial={{ opacity: 0.9, scale: 0.2 }}
                animate={{ opacity: 0, scale: 2.4 }}
                transition={{ delay: 0.3, duration: 0.7, ease: "easeOut" }}
              />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function Words({ text, delay, className, show }: { text: string; delay: number; className?: string; show: boolean }) {
  return (
    <>
      {text.split(" ").map((w, i, all) => (
        <Fragment key={i}>
          <span className={`k-word ${className ?? ""}`}>
            <motion.span
              className="k-word-in"
              initial={{ y: "115%", rotate: 6 }}
              animate={show ? { y: "0%", rotate: 0 } : undefined}
              transition={{ duration: 0.9, delay: delay + i * 0.06, ease: EASE }}
            >
              {w}
            </motion.span>
          </span>
          {i < all.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/** A count-up stat. */
function Fact({ to, label, run, suffix = "", decimals = 0 }: { to: number; label: string; run: boolean; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLElement>(null);
  const from = to === 0 ? 0.25 : 0;
  useEffect(() => {
    const el = ref.current;
    if (!el || !run) return;
    const c = animate(from, to, {
      duration: 1.8,
      delay: 1.3,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = v.toFixed(decimals) + suffix),
    });
    return () => c.stop();
  }, [from, to, decimals, suffix, run]);
  return (
    <div className="k-fact">
      <dt>
        <span ref={ref}>
          {from.toFixed(decimals)}
          {suffix}
        </span>
      </dt>
      <dd>{label}</dd>
    </div>
  );
}

function Lock() {
  return (
    <svg className="k-lock" viewBox="0 0 24 24" aria-hidden="true">
      <motion.rect x="5" y="11" width="14" height="10" rx="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.8 }} />
      <motion.path d="M8 11V8a4 4 0 0 1 8 0v3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 1.2 }} />
    </svg>
  );
}

/** The actual chain, right now, in one quiet line. */
function LiveLine({ show }: { show: boolean }) {
  const dep = useDeployment();
  const live = useDrawers(dep.data);
  const d = live.data?.drawers;
  const receipts = d ? Object.values(d).reduce((t, v) => t + Number(v?.receiptCount ?? 0n), 0) : undefined;
  return (
    <motion.div className="k-live" initial={{ opacity: 0 }} animate={show ? { opacity: 1 } : undefined} transition={{ delay: 1.4, duration: 0.8 }}>
      <span className="k-live-tag">
        <span className="k-dot" aria-hidden="true" /> Live on Aevum testnet now
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
