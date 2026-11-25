// What the 3D scene shows right now. Plain mutable state (read every frame) plus a small cue bus, so nothing
// re-renders React while the film plays.
import type { Vector3 } from "three";
import type { Snap, StoryEvent, StorySide } from "@kibble/sdk";

export type Cue =
  | { kind: "sale" | "buy" | "theft" | "refused" | "refund" | "vault" | "served" | "turned" | "arrive"; side: StorySide; by?: "agent" | "tricked" | "thief"; small?: boolean }
  | { kind: "say"; side: StorySide; who: "agent" | "box"; text: string; tone?: "ok" | "no"; ms?: number }
  | { kind: "state"; side: StorySide; to: string };

export type SideView = { state: string; can: number; limit: number; saved: number; exposure: number };
export type Shot = "open" | "agent" | "guess" | "box" | "sale" | "vault" | "limit" | "both" | "fixed" | "kibble" | "thief" | "locked" | "keys" | "end";

const blank = (): SideView => ({ state: "Healthy", can: 0, limit: 0, saved: 0, exposure: 0 });

export class Stage {
  sides: Record<StorySide, SideView> = { fixed: blank(), kibble: blank() };
  /** tUSD8 that fills a box to the brim. */
  scale = 0.36;
  thief = 0;
  keys = 0;
  /** 0 calm, 1 danger: tints the light. */
  mood = 0;
  /** Numbers on the boxes are shown only when they come from a recorded run. */
  numbers = false;
  /** How much each side is lit. */
  lit: Record<StorySide, number> = { fixed: 1, kibble: 1 };
  shot: Shot = "open";
  /** The side of the last event, for narrow screens that can only frame one. */
  follow: StorySide = "kibble";
  /** Where each label belongs, in world space. */
  pins = new Map<string, (out: Vector3) => void>();
  private subs = new Set<(c: Cue) => void>();

  on(fn: (c: Cue) => void) {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }
  cue(c: Cue) {
    if ("side" in c) this.follow = c.side;
    for (const fn of this.subs) fn(c);
  }
  snap(side: StorySide, s: Snap | undefined) {
    if (!s) return;
    Object.assign(this.sides[side], { state: s.state, can: s.canSpend, limit: s.limit, saved: s.saved, exposure: s.exposure });
  }
}

const f3 = (x: number) => x.toFixed(3);

/** Act out one recorded event. `fast` trims the words and the grains. */
export function act(stage: Stage, e: StoryEvent, fast = false) {
  if (e.kind === "scene") return;
  if (e.kind !== "flow") {
    stage.snap("fixed", e.fixed);
    stage.snap("kibble", e.kibble);
    return;
  }
  const side = e.side;
  const was = { ...stage.sides[side] };
  const say = (who: "agent" | "box", text: string, tone?: "ok" | "no") => !fast && stage.cue({ kind: "say", side, who, text, tone, ms: 1500 });
  const small = fast;
  switch (e.step) {
    case "sale":
      stage.cue({ kind: "arrive", side, small });
      stage.cue({ kind: "sale", side, small });
      break;
    case "buy":
      if (e.by === "agent") {
        say("agent", `May I pay ${f3(e.amount)}?`);
        say("box", "Yes", "ok");
        stage.cue({ kind: "buy", side, small });
        // the recording has no snapshot here; take the payment out of what's shown
        stage.sides[side].can = Math.max(0, stage.sides[side].can - e.amount);
      } else {
        say("box", `${f3(e.amount)} gone`, "no");
        stage.cue({ kind: "theft", side, by: e.by, small });
      }
      break;
    case "refused":
      if (e.by === "agent") say("agent", `May I pay ${f3(e.amount)}?`);
      say("box", "No", "no");
      stage.cue({ kind: "refused", side, by: e.by, small });
      break;
    case "refund":
      stage.cue({ kind: "refund", side, small });
      stage.cue({ kind: "turned", side });
      break;
    case "closed":
      stage.cue({ kind: "arrive", side, small });
      stage.cue({ kind: "turned", side });
      break;
    case "earned":
      stage.cue({ kind: "served", side });
      if (side === "kibble" && e.snap && e.snap.saved > was.saved) stage.cue({ kind: "vault", side, small });
      break;
  }
  if (e.snap) {
    stage.snap(side, e.snap);
    if (e.snap.state !== was.state) stage.cue({ kind: "state", side, to: e.snap.state });
  }
}
