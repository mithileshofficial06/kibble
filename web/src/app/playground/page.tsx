"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Story, StoryEvent } from "@kibble/sdk";
import { Arrow, PageHead, Reveal, SecHead } from "@/components/ui";
import { FOCUS, type Focus } from "@/components/story/plan";
import { StoryPlayer } from "@/components/story/StoryPlayer";
import { STORIES } from "@/stories";

type Beat = { title: string; about: string; drawers: string[]; estSeconds: number };
type Job = { id: number; beat: string; startedAt: number; expectedSeconds?: number; finishedAt?: number; ok?: boolean; lines: string[]; events: StoryEvent[]; eventCount: number };
type Status = {
  enabled: boolean;
  running: boolean;
  job?: Job;
  cooldownEndsAt: number | null;
  runsLeftToday: number;
  fuelRuns?: number | null;
  fuelLow?: boolean;
  beats: Record<string, Beat>;
};

/** "about 5 min" / "about 40 s" */
function about(seconds: number) {
  return seconds >= 90 ? `about ${Math.round(seconds / 60)} min` : `about ${Math.max(5, Math.round(seconds / 5) * 5)} s`;
}

/** 1:05 */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Time-based progress for a run: elapsed against the expected length (the last real run of that demo). */
function RunProgress({ job }: { job: Job }) {
  const done = job.finishedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  const elapsed = ((done ? job.finishedAt! : now) - job.startedAt) / 1000;
  const expected = job.expectedSeconds ?? 0;
  const over = !done && expected > 0 && elapsed > expected;
  // Never shows full until it is: a run that takes longer than usual parks at 95%.
  const frac = done ? 1 : expected > 0 ? Math.min(0.95, elapsed / expected) : 0.05;
  const label = done
    ? `${job.ok ? "Finished" : "Stopped"} in ${clock(elapsed)}`
    : over
      ? `${clock(elapsed)} elapsed · taking a little longer than last time`
      : `${clock(elapsed)} elapsed · ${expected > 0 ? `${about(expected - elapsed)} left` : "running"}`;
  return (
    <div className={`run-progress ${done ? (job.ok ? "done" : "bad") : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-valuetext={label}>
      <div className="run-progress-bar">
        <span style={{ transform: `scaleX(${frac})` }} />
      </div>
      <span className="run-progress-label">{label}</span>
    </div>
  );
}

const CARDS: { id: keyof typeof STORIES; title: string; about: string; icon: React.ReactNode }[] = [
  {
    id: "sales-rush",
    title: "A busy day",
    about: "Customers keep coming. Which agent can serve them all, and whose limit grows?",
    icon: <path d="M4 26l8-9 6 5 10-14M21 8h7v7" />,
  },
  {
    id: "bad-strategy",
    title: "A losing day",
    about: "Every sale starts losing money. One agent keeps paying. The other is stopped by its wallet.",
    icon: <path d="M4 8l8 9 6-5 10 14M21 26h7v-7" />,
  },
  {
    id: "hijack",
    title: "A stolen key",
    about: "A page tricks the AI, then a thief uses its key. How much does each wallet give away?",
    icon: (
      <>
        <circle cx="11" cy="16" r="6" />
        <path d="M17 16h12M25 16v5M21 16v3" />
      </>
    ),
  },
];

/** Watch a recorded run at once, or run it for real on the testnet and watch it as it happens. */
export default function PlaygroundPage() {
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ mode: "replay"; id: keyof typeof STORIES; key: number } | { mode: "live" } | null>(null);
  const events = useRef<{ job: number; list: StoryEvent[] }>({ job: -1, list: [] });
  const stage = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["playground"],
    queryFn: async (): Promise<Status> => {
      const since = events.current.list.length;
      const s = (await (await fetch(`/api/playground?since=${since}`)).json()) as Status;
      if (s.job) {
        if (s.job.id !== events.current.job) {
          // a different run: fetch its events from the start
          events.current = { job: s.job.id, list: [] };
          if (since > 0) {
            const again = (await (await fetch("/api/playground?since=0")).json()) as Status;
            if (again.job) events.current = { job: again.job.id, list: again.job.events };
            return again;
          }
        }
        events.current = { job: s.job.id, list: [...events.current.list, ...s.job.events] };
      }
      return s;
    },
    refetchInterval: (q) => (q.state.data?.running ? 1_500 : 10_000),
  });
  const s = status.data;
  const running = Boolean(s?.job && s.job.finishedAt === undefined);
  const coolingFor = s?.cooldownEndsAt ? Math.max(0, Math.ceil((s.cooldownEndsAt - Date.now()) / 1000)) : 0;
  const canRun = Boolean(s?.enabled && !s.running && coolingFor <= 0 && s.runsLeftToday > 0 && s.fuelRuns !== 0);

  function show() {
    setTimeout(() => stage.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
  function watch(id: keyof typeof STORIES) {
    setView({ mode: "replay", id, key: Date.now() });
    show();
  }
  async function start(beat: string) {
    setError(null);
    const r = await fetch("/api/playground", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beat }) });
    if (!r.ok) {
      setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
      return;
    }
    setView({ mode: "live" });
    await status.refetch();
    show();
  }

  // a run already going on when you arrive
  useEffect(() => {
    if (running && !view) setView({ mode: "live" });
  }, [running, view]);

  const story: Story | undefined = view?.mode === "replay" ? STORIES[view.id] : undefined;

  return (
    <main className="shell">
      <PageHead
        n="K—04"
        rail="Try it · no wallet needed"
        eyebrow="No wallet needed"
        title="Press a button. Watch the wallet *decide.*"
        lede="Watch two agents go through the same day. One has a fixed limit, the other has Kibble. Pick a story, and see the money move."
        aside={
          <Link href="/tour" className="btn ghost">
            New here? Take the tour
          </Link>
        }
      />

      <section className="stack">
        <SecHead n="01" title="Pick a *story.*" note="A replay takes about a minute and starts at once." />
        <div className="beats">
          {CARDS.map((c, i) => {
            const b = s?.beats[c.id];
            return (
              <Reveal key={c.id} className={`card beat ${view?.mode === "replay" && view.id === c.id ? "on" : ""}`} delay={i * 0.1}>
                <svg className="beat-icon" viewBox="0 0 32 32" aria-hidden="true">
                  {c.icon}
                </svg>
                <h2>{c.title}</h2>
                <p className="fine" style={{ fontSize: 15, lineHeight: 1.6 }}>
                  {c.about}
                </p>
                <div className="beat-acts">
                  <button className="btn" type="button" onClick={() => watch(c.id)}>
                    Watch it <Arrow />
                  </button>
                  {s?.enabled && b && (
                    <button className="beat-live" type="button" disabled={!canRun} onClick={() => void start(c.id)}>
                      Run it for real, {about(b.estSeconds)}
                    </button>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
        {s?.enabled && (
          <p className="fine">
            “Run it for real” sends real transactions on Aevum testnet with demo agents.{" "}
            {s.running ? "A run is going on now." : coolingFor > 0 ? `Ready again in ${coolingFor} s.` : `${s.runsLeftToday} runs left today.`}{" "}
            {s.running && view?.mode !== "live" && (
              <button type="button" className="linklike" onClick={() => (setView({ mode: "live" }), show())}>
                Watch it live
              </button>
            )}
          </p>
        )}
      </section>

      {s?.enabled && s.fuelLow && (
        <p className="notice bad">
          The demo wallets are low on testnet gas: about {s.fuelRuns} {s.fuelRuns === 1 ? "run" : "runs"} left. Replays always work.
        </p>
      )}
      {error && (
        <p className="notice bad" role="alert">
          {error}
        </p>
      )}

      <div ref={stage} className="story-anchor">
        {story && view?.mode === "replay" && (
          <section className="stack">
            <SecHead n="02" title={story.title.replace(/(\w+)$/, "*$1.*")} note="Same customers, same attack, two kinds of wallet." />
            <StoryPlayer
              key={view.key}
              events={story.events}
              focus={FOCUS[story.id] as Focus}
              source={`${story.source}, ${story.recorded}. Run it for real above to see it happen on the testnet.`}
            />
          </section>
        )}
        {view?.mode === "live" && s?.job && (
          <section className="stack">
            <SecHead n="02" title="The run, *live.*" note={`${s.beats[s.job.beat]?.title ?? s.job.beat}, on Aevum testnet.`} />
            <RunProgress job={s.job} />
            {s.job.finishedAt !== undefined && !s.job.ok && <p className="notice bad">This run stopped early. The details are in the technical log below.</p>}
            <StoryPlayer key={s.job.id} live events={events.current.job === s.job.id ? events.current.list : []} focus={(FOCUS[s.job.beat] ?? "sales") as Focus} />
            <details className="card terminal tech">
              <summary>Technical log</summary>
              <pre tabIndex={0}>{s.job.lines.length ? s.job.lines.join("\n") : "Starting…"}</pre>
            </details>
          </section>
        )}
      </div>
      {!s && status.error && <p className="fine">Couldn&apos;t reach the server. Replays still work.</p>}
    </main>
  );
}
