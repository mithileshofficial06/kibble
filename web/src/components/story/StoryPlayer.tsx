"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { say, storyState, type StoryEvent, type StoryState } from "@kibble/sdk";
import { SideCards } from "@/components/three/SideCards";
import { act, Stage } from "@/components/three/stage";
import { useCan3D } from "@/components/three/useCan3D";
import { useNetwork } from "@/lib/network";
import { Lane } from "./Lane";
import { planStory, snapAt, type Focus } from "./plan";

const World = dynamic(() => import("@/components/three/World"), { ssr: false, loading: () => <div className="film-load">Setting the stage…</div> });

const COPY: Record<Focus, { fixed: [string, string]; kibble: [string, string] }> = {
  sales: {
    fixed: ["The seller with a fixed limit", "The same spending limit every round, however well it does."],
    kibble: ["The seller with Kibble", "Its limit grows when it earns."],
  },
  loss: {
    fixed: ["The losing seller, fixed limit", "It sells for less than it pays. Nobody checks."],
    kibble: ["The losing seller, with Kibble", "The same losing business. The wallet checks every payment."],
  },
  theft: {
    fixed: ["The hacked seller, fixed limit", "Whoever has the key can spend the limit, every round."],
    kibble: ["The hacked seller, with Kibble", "Whoever has the key still has to ask the wallet."],
  },
};

const f3 = (x: number) => x.toFixed(3);
const lostBy = (t: StoryState["fixed"]) => (t.snap && t.first ? Math.max(0, t.snap.spent - t.snap.earned - (t.first.spent - t.first.earned)) : 0);

/** What just happened, in numbers the run produced. */
export function verdict(focus: Focus, s: StoryState): { line: string; more: string } {
  const { fixed: f, kibble: k } = s;
  if (focus === "sales") {
    const grew = k.first && k.snap ? k.snap.limit - k.first.limit : 0;
    return {
      line:
        f.turnedAway > k.turnedAway
          ? `The fixed limit ran out and turned away ${f.turnedAway} customer${f.turnedAway === 1 ? "" : "s"}. Kibble served ${k.turnedAway === 0 ? "everyone" : `all but ${k.turnedAway}`}.`
          : `Both served ${k.served} customers.`,
      more:
        k.first && k.snap
          ? grew > 0.0004
            ? `Kibble's limit grew from ${f3(k.first.limit)} to ${f3(k.snap.limit)}, because it earned it. The fixed limit stayed at ${f3(f.snap?.limit ?? 0)}.`
            : `Kibble's limit is ${f3(k.snap.limit)}. It grows when rounds close with a profit.`
          : "",
    };
  }
  if (focus === "loss") {
    return {
      line: `The fixed agent lost ${f3(lostBy(f))} and is ${f.snap?.state === "Paused" ? "stopped" : "still paying"}. Kibble lost ${f3(lostBy(k))}${k.snap?.state === "Paused" ? " before its wallet stopped it" : ""}.`,
      more: "Nobody pressed a button. The wallet saw spending that earnings didn't cover.",
    };
  }
  return {
    line: `The thief spent ${f3(f.stolen)} from the fixed agent and ${f3(k.stolen)} from Kibble.`,
    more:
      k.snap?.state === "Paused"
        ? "Kibble paused itself, so the key is worthless now. A quieter thief, taking tiny amounts, isn't always paused: that's what alerts are for."
        : "Kibble refused the attempts. A quieter thief isn't always paused: that's what alerts are for.",
  };
}

/**
 * Plays a story: a recorded one from start to end, or a live one as its events arrive.
 * `from`/`to` trim it (the tour uses that); `onDone` fires when the last event has been shown.
 */
export function StoryPlayer({
  events,
  focus,
  live = false,
  autoPlay = true,
  source,
  onDone,
  controls = true,
  showVerdict = true,
  run = 0,
}: {
  events: StoryEvent[];
  focus: Focus;
  live?: boolean;
  autoPlay?: boolean;
  source?: string;
  onDone?: () => void;
  controls?: boolean;
  showVerdict?: boolean;
  /** Changes when the story should start over (the 3D world stays up between stories). */
  run?: number;
}) {
  const { net } = useNetwork();
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const done = useRef(onDone);
  done.current = onDone;
  const can3d = useCan3D();
  const stage = useMemo(() => new Stage(), []);
  const [ready, setReady] = useState(false);
  const shownTo = useRef(0);
  const plan = useMemo(() => planStory(events), [events]);
  const total = events.length;
  const finished = total > 0 && count >= total && (!live || events[total - 1].kind === "end");

  useEffect(() => {
    if (!playing || count >= total || (can3d !== false && !ready)) return;
    const cur = count > 0 ? plan[count - 1] : { ms: 350, fast: false };
    // a live run that has fallen behind catches up
    const behind = live && total - count > 8 ? 0.35 : 1;
    const ms = Math.max(60, (cur.ms * behind * (reduce ? 1.4 : 1)) / speed);
    const t = setTimeout(() => setCount((c) => Math.min(total, c + 1)), ms);
    return () => clearTimeout(t);
  }, [playing, count, total, plan, speed, live, reduce, can3d, ready]);

  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => done.current?.(), 1200);
    return () => clearTimeout(t);
  }, [finished]);

  useEffect(() => {
    setCount(0);
    setPlaying(autoPlay);
    // a live run keeps its place: only a new run starts over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // act the new event out on the 3D stage, or rebuild the stage after a jump
  useEffect(() => {
    const from = shownTo.current;
    shownTo.current = count;
    stage.numbers = true;
    stage.mood = focus === "sales" ? 0 : 0.55;
    if (count === from + 1) {
      const e = events[count - 1];
      const b = plan[count - 1];
      act(stage, e, Boolean(b?.fast));
      stage.thief = e.kind === "flow" && e.by === "thief" ? 1 : e.kind === "end" ? 0 : stage.thief;
      if (b?.change) {
        stage.shot = b.change.side === "kibble" ? (b.change.to === "Paused" ? "locked" : "kibble") : "fixed";
        const t = setTimeout(() => void (stage.shot = "both"), 2300);
        return () => clearTimeout(t);
      }
      return;
    }
    for (const k of ["fixed", "kibble"] as const) stage.snap(k, snapAt(events, count, k));
    stage.shot = "both";
    stage.thief = focus === "theft" && events.slice(0, count).some((e) => e.kind === "flow" && e.by === "thief") ? 1 : 0;
  }, [count, events, plan, stage, focus]);

  const event = count > 0 ? events[count - 1] : undefined;
  const beat = count > 0 ? plan[count - 1] : undefined;
  const state = useMemo(() => storyState(events, count), [events, count]);
  const scale = useMemo(() => {
    let max = 0.01;
    for (const e of events) for (const s of e.kind === "scene" ? [] : e.kind === "flow" ? [e.snap] : [e.fixed, e.kibble]) if (s) max = Math.max(max, s.limit, s.canSpend);
    return max * 1.18;
  }, [events]);

  // captions: fast-forwarded stretches get one steady line instead of a flicker
  const v = finished ? verdict(focus, state) : null;
  const caption = v
    ? v.line
    : !event
    ? live
      ? "Getting ready…"
      : ""
    : beat?.fast
      ? event.kind === "flow" && event.by !== "agent"
        ? "The thief keeps trying…"
        : "More of the same, sped up…"
      : beat?.change?.to === "Paused" && event.kind === "flow"
        ? `${say(event)} That's one too many: the wallet stops the agent.`
        : say(event);
  const who = event?.kind === "flow" ? event.side : undefined;
  const scenes = useMemo(() => events.map((e, i) => ({ e, i })).filter((x) => x.e.kind === "scene"), [events]);
  const copy = COPY[focus];
  const explorer = net.hasExplorer && live ? net.chain.blockExplorers?.default.url : undefined;

  return (
    <div className="story">
      <div className="story-caption" aria-live="polite">
        <div className="story-caption-top">
          <span className="card-label">{v ? "What just happened" : (state.scene?.title ?? "Ready")}</span>
          {beat?.fast && <span className="pill">Fast-forward</span>}
          {live && !finished && (
            <span className="pill">
              <span className="pulse live" aria-hidden="true" /> Live
            </span>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={caption}
            className={`${event?.kind === "flow" && event.step === "refused" ? "bad" : ""} ${event?.kind === "scene" ? "scene" : ""}`}
            initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3 }}
          >
            {who && <b className={who}>{who === "fixed" ? "Fixed" : "Kibble"}</b>}
            {caption || " "}
          </motion.p>
        </AnimatePresence>
      </div>

      {can3d === null ? (
        <div className="story-world" />
      ) : can3d ? (
        <div className="story-world">
          <World stage={stage} onReady={() => setReady(true)} />
          <SideCards focus={focus} s={state} />
        </div>
      ) : (
      <div className="story-lanes">
        {(["fixed", "kibble"] as const).map((side) => (
          <Lane
            key={side}
            side={side}
            title={copy[side][0]}
            about={copy[side][1]}
            focus={focus}
            event={event}
            seq={count}
            snap={snapAt(events, count, side)}
            prev={snapAt(events, Math.max(0, count - 1), side)}
            tally={state[side]}
            scale={scale}
            fast={Boolean(beat?.fast)}
            change={beat?.change?.side === side ? beat.change.to : undefined}
          />
        ))}
      </div>
      )}

      {controls && (
        <div className="story-controls">
          {!live && (
            <>
              <button type="button" className="btn small" onClick={() => (finished ? (setCount(0), setPlaying(true)) : setPlaying((p) => !p))}>
                {finished ? "Play again" : playing ? "Pause" : count ? "Continue" : "Play"}
              </button>
              <button type="button" className="btn small ghost" aria-pressed={speed === 2} onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}>
                {speed === 1 ? "1× speed" : "2× speed"}
              </button>
              {scenes.length > 1 &&
                scenes.map(({ e, i }) =>
                  e.kind === "scene" ? (
                    <button key={i} type="button" className="story-jump" aria-current={state.scene?.title === e.title ? "step" : undefined} onClick={() => (setCount(i + 1), setPlaying(true))}>
                      {e.title}
                    </button>
                  ) : null,
                )}
            </>
          )}
          <div className="story-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} aria-label="Progress">
            <span style={{ transform: `scaleX(${total ? count / total : 0})` }} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {v && showVerdict && (
          <motion.div className="story-verdict" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <span className="card-label">What it means</span>
            <p>{v.more}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <details className="story-feed">
        <summary>Every step, in words</summary>
        <ol>
          {events.slice(0, count).map((e, i) =>
            e.kind === "start" || e.kind === "end" ? null : (
              <li key={i} className={e.kind === "flow" ? `${e.side} ${e.step}` : e.kind}>
                {e.kind === "flow" && <b>{e.side === "fixed" ? "Fixed" : "Kibble"}</b>}
                <span>{say(e)}</span>
                {explorer && e.kind === "flow" && e.tx && (
                  <a href={`${explorer}/tx/${e.tx}`} target="_blank" rel="noreferrer">
                    transaction
                  </a>
                )}
              </li>
            ),
          )}
        </ol>
      </details>
      {source && <p className="fine story-source">{source}</p>}
    </div>
  );
}
