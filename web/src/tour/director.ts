// The film's script: which cue fires when. Times come from the narration (timeline.json), and what happens in
// the comparisons comes from the recorded runs (src/stories).
import type { Story, StoryEvent } from "@kibble/sdk";
import { act, type Shot, type Stage } from "@/components/three/stage";
import type { Focus } from "@/components/story/plan";
import { STORIES } from "@/stories";
import timeline from "./timeline.json";

export const TOTAL = timeline.total;
export const SCENES = timeline.scenes;
export const CHAPTERS = [
  { n: 1, title: "The problem" },
  { n: 2, title: "The idea" },
  { n: 3, title: "A busy day" },
  { n: 4, title: "A losing day" },
  { n: 5, title: "A stolen key" },
  { n: 6, title: "You're in charge" },
  { n: 7, title: "The end" },
].map((c) => ({ ...c, from: SCENES.find((s) => s.chapter === c.n)!.from }));

/** What the overlay shows. `shown` is the recorded events acted out so far in this chapter. */
export type Hud = { focus: Focus | null; shown: StoryEvent[]; alert: boolean; pressed: boolean; end: boolean; illustration: boolean };
export const HUD0: Hud = { focus: null, shown: [], alert: false, pressed: false, end: false, illustration: true };

type Ctx = { stage: Stage; instant: boolean; hud: (p: Partial<Hud> | ((h: Hud) => Partial<Hud>)) => void };
export type FilmCue = { t: number; run: (c: Ctx) => void };

const scene = (id: string) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Seconds (in the whole film) at which the nth `word` of a scene is spoken. */
function at(id: string, word: string, nth = 1, off = 0): number {
  const s = scene(id);
  let n = 0;
  for (const w of s.words) if (norm(w.w) === norm(word) && ++n === nth) return s.from + w.t + off;
  throw new Error(`"${word}" #${nth} isn't in ${id}`);
}

export function buildCues(): FilmCue[] {
  const cues: FilmCue[] = [];
  const on = (t: number, run: FilmCue["run"]) => cues.push({ t, run });
  const shot = (t: number, s: Shot) => on(t, ({ stage }) => void (stage.shot = s));
  const live = (t: number, run: (s: Stage) => void) => on(t, ({ stage, instant }) => void (instant || run(stage)));
  const from = (id: string) => scene(id).from;

  const first = STORIES["sales-rush"].events.find((e) => e.kind === "start")!;

  // ---------------------------------------------------------------- 1. the problem
  on(0, ({ stage, hud }) => {
    if (first.kind === "start") {
      stage.snap("fixed", first.fixed);
      stage.snap("kibble", first.kibble);
    }
    Object.assign(stage, { thief: 0, keys: 0, mood: 0, numbers: false, scale: 0.36, lit: { fixed: 1, kibble: 1 } });
    hud({ ...HUD0 });
  });
  shot(0, "open");
  shot(1.5, "agent");
  live(at("spend", "spend"), (s) => s.cue({ kind: "buy", side: "kibble" }));
  live(at("spend", "themselves"), (s) => (s.cue({ kind: "buy", side: "kibble" }), s.cue({ kind: "buy", side: "fixed" })));
  on(from("guess"), ({ stage }) => void (stage.lit = { fixed: 1.25, kibble: 0.3 }));
  shot(from("guess"), "guess");
  live(at("guess", "fifty"), (s) => s.cue({ kind: "say", side: "fixed", who: "box", text: "50 a day", ms: 2600 }));
  live(at("guess", "guess"), (s) => s.cue({ kind: "say", side: "fixed", who: "box", text: "a guess", tone: "no", ms: 1800 }));

  // ---------------------------------------------------------------- 2. the idea
  on(from("box"), ({ stage }) => void (stage.lit = { fixed: 0.2, kibble: 1.25 }));
  shot(from("box"), "box");
  live(at("box", "open"), (s) => s.cue({ kind: "refused", side: "kibble", by: "agent" }));
  live(at("box", "ask"), (s) => s.cue({ kind: "say", side: "kibble", who: "agent", text: "May I?", ms: 2200 }));
  shot(from("sale"), "sale");
  live(at("sale", "customer"), (s) => (s.cue({ kind: "arrive", side: "kibble" }), s.cue({ kind: "sale", side: "kibble" })));
  live(at("sale", "asks"), (s) => s.cue({ kind: "say", side: "kibble", who: "agent", text: "May I pay the supplier?", ms: 2400 }));
  live(at("sale", "checks"), (s) => s.cue({ kind: "say", side: "kibble", who: "box", text: "Yes", tone: "ok", ms: 2200 }));
  live(at("sale", "pays", 2), (s) => s.cue({ kind: "buy", side: "kibble" }));
  shot(from("vault"), "vault");
  live(at("vault", "happy"), (s) => s.cue({ kind: "served", side: "kibble" }));
  live(at("vault", "profit"), (s) => s.cue({ kind: "vault", side: "kibble" }));
  live(at("vault", "vault"), (s) => s.cue({ kind: "vault", side: "kibble" }));
  shot(from("limit"), "limit");
  on(at("limit", "good"), ({ stage }) => void Object.assign(stage.sides.kibble, { limit: 0.31, can: 0.28 }));
  on(at("limit", "loss"), ({ stage }) => void Object.assign(stage.sides.kibble, { limit: 0.18, can: 0.16 }));

  // ---------------------------------------------------------------- comparisons, from the recordings
  const open = (id: keyof typeof STORIES, focus: Focus, t: number) =>
    on(t, ({ stage, hud }) => {
      const e = (STORIES[id] as Story).events.find((x) => x.kind === "start");
      if (e?.kind === "start") {
        stage.snap("fixed", e.fixed);
        stage.snap("kibble", e.kibble);
      }
      Object.assign(stage, { numbers: true, lit: { fixed: 1, kibble: 1 }, mood: focus === "sales" ? 0 : 0.55, thief: 0, keys: 0 });
      hud({ focus, shown: e ? [e] : [], illustration: false, alert: false, pressed: false });
    });
  const play = (e: StoryEvent, t: number, fast: boolean) =>
    on(t, ({ stage, instant, hud }) => {
      if (instant) {
        if (e.kind === "flow") stage.snap(e.side, e.snap);
        else if (e.kind !== "scene") {
          stage.snap("fixed", e.fixed);
          stage.snap("kibble", e.kibble);
        }
      } else act(stage, e, fast);
      hud((h) => ({ shown: [...h.shown, e] }));
    });
  /** Spread events over [a, b]; heavier events get more of the time. */
  const spread = (list: StoryEvent[], a: number, b: number, weight: (e: StoryEvent, i: number) => number) => {
    const ws = list.map(weight);
    const sum = ws.reduce((x, y) => x + y, 0);
    let acc = 0;
    list.forEach((e, i) => {
      const w = (ws[i] / sum) * (b - a);
      play(e, a + acc, w < 0.3);
      acc += w;
    });
  };

  // ---------------------------------------------------------------- 3. a busy day
  const busy = from("busy");
  open("sales-rush", "sales", busy);
  shot(busy, "both");
  const sales = STORIES["sales-rush"].events;
  const r1 = sales.findIndex((e) => e.kind === "round");
  const r2 = sales.findIndex((e, i) => e.kind === "round" && i > r1);
  const sw = (e: StoryEvent, i: number) => (i < 9 ? 5 : e.kind === "flow" && e.side === "fixed" && (e.step === "refused" || e.step === "refund") ? 9 : 1);
  spread(sales.slice(1, r1), busy + 2.2, at("busy", "away", 1, 0.2), sw);
  shot(at("busy", "left", 1, -0.1), "fixed");
  play(sales[r1], at("busy", "away", 1, 0.5), false);
  shot(at("busy", "right", 1, -0.2), "kibble");
  spread(sales.slice(r1 + 1, r2), at("busy", "right", 1, 0.1), at("busy", "limit", 2, 0), (e) => (e.kind === "flow" && e.side === "kibble" ? 1.5 : 0.8));
  play(sales[r2], at("busy", "climbing", 1, -0.2), false);
  shot(at("busy", "climbing", 1, 0.1), "limit");
  shot(at("busy", "climbing", 1, 1.1), "both");

  // ---------------------------------------------------------------- 4. a losing day
  const loss = from("loss");
  open("bad-strategy", "loss", loss);
  shot(loss, "both");
  const bad = STORIES["bad-strategy"].events;
  const kib = bad.filter((e) => e.kind === "flow" && e.side === "kibble");
  const fix = bad.filter((e) => e.kind === "flow" && e.side === "fixed");
  const strikes: number[] = [];
  let st = "Healthy";
  kib.forEach((e, i) => {
    if (e.kind === "flow" && e.snap && e.snap.state !== st) {
      st = e.snap.state;
      strikes.push(i);
    }
  });
  // the fixed side loses all the way through
  spread(fix, at("loss", "sale"), scene("loss").from + scene("loss").dur - 1.6, () => 1);
  shot(at("loss", "fixed", 1, -0.2), "fixed");
  // Kibble: its one paid sale, then the three strikes on the words
  spread(kib.slice(0, strikes[0] - 1), at("loss", "price"), at("loss", "person"), () => 1);
  shot(at("loss", "wallet", 1, -0.3), "kibble");
  const words: [string, number][] = [["one", 0], ["two", 1], ["three", 2]];
  words.forEach(([w, n], k) => {
    const i = strikes[n];
    const t = at("loss", w, 1, 0.15);
    play(kib[i - 1], t - 0.75, true); // the customer's payment
    play(kib[i], t, false);
    const next = k < 2 ? strikes[n + 1] - 1 : i + 2;
    spread(kib.slice(i + 1, next), t + 0.15, t + 0.45, () => 1);
  });
  shot(at("loss", "stops", 1, -0.2), "locked");
  spread(kib.slice(strikes[2] + 2), at("loss", "itself", 1, 0.4), scene("loss").from + scene("loss").dur - 1.2, () => 1);
  shot(at("loss", "itself", 1, 0.9), "both");

  // ---------------------------------------------------------------- 5. a stolen key
  open("hijack", "theft", from("thief"));
  shot(from("thief"), "both");
  shot(at("thief", "thief", 1, -0.5), "thief");
  on(at("thief", "thief", 1, -0.35), ({ stage }) => {
    stage.thief = 1;
    stage.mood = 1;
  });
  const hj = STORIES.hijack.events;
  const grab = hj.findIndex((e) => e.kind === "scene" && e.title.startsWith("3"));
  const before = hj.slice(1, grab);
  before.forEach((e) => {
    // the trick and the small probes happened first in the recording: count them, quietly
    on(from("grab") - 0.4, ({ stage, hud }) => {
      if (e.kind === "flow") stage.snap(e.side, e.snap);
      hud((h) => ({ shown: [...h.shown, e] }));
    });
  });
  const hf = hj.slice(grab + 1).filter((e) => e.kind === "flow" && e.side === "fixed");
  const hk = hj.slice(grab + 1).filter((e) => e.kind === "flow" && e.side === "kibble");
  const stop = hk.findIndex((e) => e.kind === "flow" && e.snap?.state === "Paused");
  shot(from("grab"), "fixed");
  spread(hf, at("grab", "spends"), at("grab", "right", 1, 3.2), (e) => (e.kind === "flow" && e.step === "buy" ? 9 : 0.5));
  shot(at("grab", "right", 1, -0.2), "kibble");
  const beats = [at("grab", "grab"), at("grab", "wall"), at("grab", "refused", 1), at("grab", "refused", 2)];
  hk.slice(0, stop).forEach((e, i) => play(e, beats[Math.min(i, beats.length - 1)] + 0.05, false));
  shot(at("grab", "box", 1, -0.5), "locked");
  play(hk[stop], at("grab", "locks"), false);
  spread(hk.slice(stop + 1), at("grab", "thief", 2), scene("grab").from + scene("grab").dur - 0.8, () => 1);
  shot(at("grab", "nothing", 1, -0.4), "both");
  play(hj[hj.length - 1], scene("grab").from + scene("grab").dur - 0.5, false);

  // ---------------------------------------------------------------- 6. you're in charge
  on(from("honest"), ({ stage }) => {
    stage.thief = 0;
    stage.mood = 0.2;
  });
  shot(from("honest"), "both");
  on(at("honest", "alerts", 1, -0.2), ({ hud }) => hud({ alert: true, focus: null, illustration: true }));
  on(at("honest", "freezes", 1, -0.2), ({ stage, hud }) => {
    stage.numbers = false;
    stage.sides.fixed.state = "Paused";
    stage.sides.fixed.exposure = 0;
    hud({ pressed: true });
  });
  on(from("keys"), ({ stage, hud }) => {
    stage.keys = 1;
    stage.lit = { fixed: 0.25, kibble: 1.25 };
    hud({ alert: false, pressed: false });
  });
  shot(from("keys"), "keys");
  on(at("keys", "guardians"), ({ stage }) => void (stage.keys = 2));
  on(at("keys", "guardians", 1, 0.75), ({ stage }) => {
    stage.sides.kibble.state = "Watch";
    stage.mood = 0;
  });

  // ---------------------------------------------------------------- 7. the end
  on(from("end"), ({ stage }) => {
    stage.keys = 0;
    stage.lit = { fixed: 0.5, kibble: 1.3 };
    Object.assign(stage.sides.kibble, { state: "Healthy", limit: 0.31, can: 0.31 });
  });
  shot(from("end"), "end");
  for (let i = 0; i < 9; i++) live(from("end") + 0.5 + i * 0.85, (s) => (s.cue({ kind: "sale", side: "kibble" }), s.cue({ kind: "vault", side: "kibble" })));
  on(at("end", "earn", 1, 0.5), ({ hud }) => hud({ end: true }));

  return cues.map((c, i) => ({ ...c, i })).sort((a, b) => a.t - b.t || a.i - b.i);
}

/** The caption at time t. */
export function captionAt(t: number): { text: string; key: string } | null {
  for (let k = SCENES.length - 1; k >= 0; k--) {
    const s = SCENES[k];
    if (t < s.from) continue;
    const u = t - s.from;
    let cur: { t: number; text: string } | null = null;
    for (const c of s.captions) if (u >= c.t - 0.12) cur = c;
    return cur ? { text: cur.text, key: `${s.id}-${cur.t}` } : null;
  }
  return null;
}
