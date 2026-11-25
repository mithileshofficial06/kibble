"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoryEvent } from "@kibble/sdk";
import { Arrow, EASE, Title } from "@/components/ui";
import { FOCUS, type Focus } from "@/components/story/plan";
import { StoryPlayer } from "@/components/story/StoryPlayer";
import { STORIES } from "@/stories";

/**
 * Trim a recording for the tour: the opening, a few events of each kind, every event where a wallet
 * changes its mind, the closing rounds and the end.
 */
function trim(events: StoryEvent[], perKind: number): StoryEvent[] {
  const seen = new Map<string, number>();
  const state: Record<string, string> = {};
  const out: StoryEvent[] = [];
  let scenes = 0;
  for (const e of events) {
    if (e.kind === "scene") {
      scenes++;
      seen.clear();
      out.push(e);
      continue;
    }
    if (e.kind !== "flow") {
      out.push(e);
      continue;
    }
    const key = `${scenes}|${e.side}|${e.step}|${e.by}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const changed = e.snap && state[e.side] && state[e.side] !== e.snap.state;
    if (e.snap) state[e.side] = e.snap.state;
    if (n <= perKind || changed) out.push(e);
  }
  return out;
}

const STEPS = ["The idea", "It earns", "It loses", "It's hacked", "You're in charge"];

const PARTS = [
  { icon: <path d="M16 4v6M9 10h14v12H9zM12.5 15h.01M19.5 15h.01M13 19h6" />, name: "The agent", text: "An AI that works and pays for things by itself." },
  { icon: <path d="M4 11h24v15H4zM4 11l3-6h18l3 6M16 16v5" />, name: "The cash box", text: "Holds its money. The agent can't open it. It can only ask." },
  {
    icon: (
      <>
        <circle cx="16" cy="16" r="11" />
        <circle cx="16" cy="16" r="3.5" />
        <path d="M16 5v3M16 24v3M5 16h3M24 16h3" />
      </>
    ),
    name: "Your vault",
    text: "Profit is moved here. The agent can't reach it.",
  },
  {
    icon: (
      <>
        <circle cx="16" cy="10" r="5" />
        <path d="M6 27c1-8 5-11 10-11s9 3 10 11" />
      </>
    ),
    name: "You",
    text: "You set one number: the most you'd lose in a week.",
  },
];

export function TourSteps({ onFilm }: { onFilm?: () => void }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const go = useCallback((n: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    top.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);
  const next = useCallback(() => go(step + 1), [go, step]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [go, step]);

  const tours = useMemo(
    () => [
      { id: "sales-rush" as const, title: "Let it *earn.*", text: "Two sellers, the same customers. Watch the limits.", events: trim(STORIES["sales-rush"].events, 30) },
      { id: "bad-strategy" as const, title: "When it *loses.*", text: "Now the supplier charges more than the agent sells for.", events: trim(STORIES["bad-strategy"].events, 5) },
      { id: "hijack" as const, title: "When it's *hacked.*", text: "Someone gets hold of the agent's key.", events: trim(STORIES.hijack.events, 8) },
    ],
    [],
  );

  return (
    <main className={`shell tour ${step >= 1 && step <= 3 ? "staged" : ""}`} ref={top}>
      <nav className="tour-steps" aria-label="Tour steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="tour-body"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {step === 0 && (
            <>
              <Title text="AI agents spend money. Who decides how *much?*" className="ph-title tour-title" />
              <p className="ph-lede">
                Most people give an agent a fixed limit, like 50 a day. That&apos;s a guess. A good agent runs out, a losing agent keeps wasting it, and a
                thief gets it every day. <strong>Kibble makes the agent earn its limit instead.</strong>
              </p>
              <div className="tour-parts">
                {PARTS.map((p, i) => (
                  <motion.div key={p.name} className="tour-part" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 + i * 0.12, ease: EASE }}>
                    <svg viewBox="0 0 32 32" aria-hidden="true">
                      {p.icon}
                    </svg>
                    <h3>{p.name}</h3>
                    <p>{p.text}</p>
                  </motion.div>
                ))}
              </div>
              <div className="row">
                <button type="button" className="btn big" onClick={next}>
                  Start the tour <Arrow />
                </button>
                <span className="fine">Three short stories, about two minutes.</span>
                {onFilm && (
                  <button type="button" className="linklike" onClick={onFilm}>
                    Watch the film instead
                  </button>
                )}
              </div>
            </>
          )}

          {step >= 1 && step <= 3 && (
            <>
              <div className="tour-head">
                <Title text={tours[step - 1].title} className="tour-title small" />
                <p className="ph-lede">{tours[step - 1].text}</p>
              </div>
              <StoryPlayer
                key={tours[step - 1].id}
                events={tours[step - 1].events}
                focus={FOCUS[tours[step - 1].id] as Focus}
                source={`${STORIES[tours[step - 1].id].source}, ${STORIES[tours[step - 1].id].recorded}; repeats are cut.`}
              />
            </>
          )}

          {step === 4 && (
            <>
              <Title text="You stay in *charge.*" className="ph-title tour-title" />
              <div className="tour-parts three">
                <div className="tour-part">
                  <h3>One button stops it</h3>
                  <p>You or your guardian can freeze the agent at any time. A thief then gets nothing.</p>
                </div>
                <div className="tour-part">
                  <h3>Two keys restart it</h3>
                  <p>Restarting takes your signature and your guardian&apos;s, so one stolen key isn&apos;t enough.</p>
                </div>
                <div className="tour-part">
                  <h3>Lowering is instant, raising waits</h3>
                  <p>You can always tighten the rules at once. Loosening waits, and the guardian can cancel it.</p>
                </div>
              </div>
              <div className="tour-honest">
                <span className="card-label">What it can&apos;t do</span>
                <p>
                  A patient thief who takes tiny amounts isn&apos;t always paused. The loss is limited, but you should still turn on alerts. We measured it:{" "}
                  <a href="https://github.com/mithileshofficial06/kibble/blob/main/docs/attacks.md" target="_blank" rel="noreferrer">
                    what a capable attacker gets
                  </a>
                  .
                </p>
              </div>
              <div className="row">
                <Link className="btn big" href="/playground">
                  Try it yourself <Arrow />
                </Link>
                <Link className="btn big ghost" href="/live">
                  See the live agents
                </Link>
                <Link className="btn big ghost" href="/connect">
                  Connect your own
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {step > 0 && (
        <div className="tour-foot">
          <button type="button" className="btn ghost" onClick={() => go(step - 1)}>
            Back
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" className="btn" onClick={next}>
              Next: {STEPS[step + 1].toLowerCase()} <Arrow />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
