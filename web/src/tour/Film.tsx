"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { storyState } from "@kibble/sdk";
import { SideCards } from "@/components/three/SideCards";
import { Stage } from "@/components/three/stage";
import { Arrow } from "@/components/ui";
import { STORIES } from "@/stories";
import { buildCues, captionAt, CHAPTERS, HUD0, TOTAL, type Hud } from "./director";

const World = dynamic(() => import("@/components/three/World"), { ssr: false, loading: () => <div className="film-load">Setting the stage…</div> });

/**
 * The self-running film. One clock: the narration when it can sound, otherwise a silent timer (browsers
 * refuse sound before a visitor has touched the page). Everything on stage follows that clock.
 */
export function Film({ onSteps }: { onSteps: () => void }) {
  const stage = useMemo(() => new Stage(), []);
  const cues = useMemo(() => buildCues(), []);
  const [hud, setHud] = useState<Hud>(HUD0);
  const [playing, setPlaying] = useState(true);
  const [sound, setSound] = useState<"on" | "off" | "blocked">("off");
  const [caption, setCaption] = useState<{ text: string; key: string } | null>(null);
  const [chapter, setChapter] = useState(1);
  const [idle, setIdle] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const audio = useRef<HTMLAudioElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const clock = useRef({ t: 0, last: 0, next: 0, playing: false, sounding: false });
  const root = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<Hud> | ((h: Hud) => Partial<Hud>)) => setHud((h) => ({ ...h, ...(typeof p === "function" ? p(h) : p) })), []);

  /** Jump: rebuild the state by running every cue before t without the show. */
  const seek = useCallback(
    (t: number) => {
      const c = clock.current;
      c.t = Math.max(0, Math.min(TOTAL, t));
      c.next = 0;
      let h: Hud = HUD0;
      const hudNow = (p: Partial<Hud> | ((x: Hud) => Partial<Hud>)) => void (h = { ...h, ...(typeof p === "function" ? p(h) : p) });
      while (c.next < cues.length && cues[c.next].t <= c.t + 0.001) cues[c.next++].run({ stage, instant: true, hud: hudNow });
      setHud(h);
      if (audio.current) audio.current.currentTime = c.t;
    },
    [cues, stage],
  );

  const play = useCallback(async () => {
    const c = clock.current;
    if (c.t >= TOTAL - 0.1) seek(0);
    c.playing = true;
    c.last = performance.now();
    setPlaying(true);
    const a = audio.current;
    if (!a) return;
    a.currentTime = c.t;
    try {
      await a.play();
      c.sounding = true;
      setSound((s) => (a.muted ? s : "on"));
    } catch {
      c.sounding = false;
      setSound("blocked");
    }
  }, [seek]);

  const pause = useCallback(() => {
    clock.current.playing = false;
    clock.current.sounding = false;
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const toggleSound = useCallback(async () => {
    const a = audio.current;
    if (!a) return;
    if (sound === "on") {
      a.muted = true;
      setSound("off");
      return;
    }
    a.muted = false;
    a.currentTime = clock.current.t;
    try {
      if (clock.current.playing) {
        await a.play();
        clock.current.sounding = true;
      }
      setSound("on");
    } catch {
      setSound("blocked");
    }
  }, [sound]);

  // it starts by itself, once there is something to see
  useEffect(() => {
    if (!ready) return;
    seek(0);
    void play();
    const a = audio.current;
    return () => a?.pause();
  }, [ready, seek, play]);

  useEffect(() => {
    let raf = 0;
    let lastCap = "";
    let lastCh = 0;
    const tick = () => {
      const c = clock.current;
      const now = performance.now();
      if (c.playing) {
        const a = audio.current;
        if (c.sounding && a && !a.paused && a.readyState >= 2) c.t = a.currentTime;
        else c.t = Math.min(TOTAL, c.t + Math.min(0.25, (now - c.last) / 1000));
        let guard = 0;
        while (c.next < cues.length && cues[c.next].t <= c.t && guard++ < 60) cues[c.next++].run({ stage, instant: false, hud: patch });
        if (c.t >= TOTAL - 0.02) {
          c.playing = false;
          c.sounding = false;
          setPlaying(false);
        }
      }
      c.last = now;
      if (bar.current) bar.current.style.transform = `scaleX(${c.t / TOTAL})`;
      const cap = captionAt(c.t);
      if ((cap?.key ?? "") !== lastCap) {
        lastCap = cap?.key ?? "";
        setCaption(cap);
      }
      const ch = CHAPTERS.reduce((n, x) => (c.t >= x.from - 0.01 ? x.n : n), 1);
      if (ch !== lastCh) {
        lastCh = ch;
        setChapter(ch);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cues, patch, stage]);

  // controls step back while you watch
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3200);
    };
    wake();
    const el = root.current;
    el?.addEventListener("pointermove", wake);
    el?.addEventListener("pointerdown", wake);
    el?.addEventListener("focusin", wake);
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (clock.current.playing) pause();
        else void play();
        wake();
      }
      if (e.key === "ArrowRight") seek(clock.current.t + 5);
      if (e.key === "ArrowLeft") seek(clock.current.t - 5);
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener("pointermove", wake);
      el?.removeEventListener("pointerdown", wake);
      el?.removeEventListener("focusin", wake);
      window.removeEventListener("keydown", key);
    };
  }, [pause, play, seek]);

  const tally = useMemo(() => storyState(hud.shown, hud.shown.length), [hud.shown]);
  const ended = hud.end && !playing;

  return (
    <div ref={root} className={`film ${idle && playing ? "idle" : ""} ${hud.end ? "over" : ""}`}>
      <h1 className="sr-only">Kibble, the film: how an AI agent earns its spending limit</h1>
      <audio ref={audio} src="/tour/tour.mp3" preload="auto" />
      <World stage={stage} onReady={onReady} />
      {!ready && <div className="film-load">Setting the stage…</div>}
      <div className="film-shade" aria-hidden="true" />

      <div className="film-top">
        <AnimatePresence mode="wait">
          <motion.p key={chapter} className="film-chapter" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <b>{String(chapter).padStart(2, "0")}</b>
            {CHAPTERS[chapter - 1].title}
          </motion.p>
        </AnimatePresence>
        <span className="film-src">{hud.illustration ? "How it works" : `Recorded run · local copy of Aevum testnet · ${STORIES["sales-rush"].recorded}`}</span>
      </div>

      <AnimatePresence>
        {hud.focus && (
          <motion.div key="cards" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <SideCards focus={hud.focus} s={tally} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hud.alert && (
          <motion.div className="film-phone" initial={{ opacity: 0, y: 60, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <p>
              <i aria-hidden="true" /> Your agent spent more than usual
            </p>
            <span className={hud.pressed ? "pressed" : ""}>{hud.pressed ? "Stopped" : "Stop this agent"}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!hud.end && (
        <div className="film-caption" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {caption && (
              <motion.p key={caption.key} initial="a" animate="b" exit="c">
                {caption.text.split(" ").map((w, i) => (
                  <motion.span
                    key={i}
                    variants={{
                      a: { opacity: 0, y: 12, filter: "blur(6px)" },
                      b: { opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: i * 0.045, duration: 0.42 } },
                      c: { opacity: 0, transition: { duration: 0.14 } },
                    }}
                  >
                    {w}{" "}
                  </motion.span>
                ))}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {hud.end && (
          <motion.div className="film-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
            <motion.p className="film-end-t" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}>
              Don&apos;t give your agent a budget. <br />
              Let it <em>earn</em> one.
            </motion.p>
            <motion.div className="row" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5 }}>
              <Link className="btn big" href="/playground">
                Try it yourself <Arrow />
              </Link>
              <Link className="btn big ghost" href="/live">
                See the live agents
              </Link>
              <button type="button" className="btn big ghost" onClick={() => (seek(0), void play())}>
                Watch again
              </button>
            </motion.div>
            <p className="film-honest">
              Testnet only, not audited. What a patient attacker can still take is{" "}
              <a href="https://github.com/mithileshofficial06/kibble/blob/main/docs/attacks.md" target="_blank" rel="noreferrer">
                measured here
              </a>
              .
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sound !== "on" && !ended && (
          <motion.button type="button" className="film-sound" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onClick={() => void toggleSound()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
            </svg>
            Turn on the voice
          </motion.button>
        )}
      </AnimatePresence>

      <div className="film-controls">
        <button type="button" className="film-btn" onClick={() => (playing ? pause() : void play())} aria-label={playing ? "Pause" : "Play"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {playing ? <path d="M8 5v14M16 5v14" /> : <path d="M7 5l12 7-12 7z" />}
          </svg>
        </button>
        <nav className="film-chapters" aria-label="Chapters">
          {CHAPTERS.slice(0, 6).map((c) => (
            <button key={c.n} type="button" aria-current={c.n === chapter ? "step" : undefined} className={c.n < chapter ? "done" : ""} onClick={() => (seek(c.from), void play())}>
              {c.title}
            </button>
          ))}
        </nav>
        {sound === "on" && (
          <button type="button" className="film-btn" onClick={() => void toggleSound()} aria-label="Mute">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 010 7" />
            </svg>
          </button>
        )}
        <button type="button" className="film-steps" onClick={onSteps}>
          Step by step instead
        </button>
        <span className="film-bar" aria-hidden="true">
          <span ref={bar} />
        </span>
      </div>
    </div>
  );
}
