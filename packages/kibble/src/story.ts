// What happened in a demo run, as plain events the app can animate. Pure: no chain access.
import type { Hex } from "viem";
import type { DrawerView } from "./client";
import type { ReasonName, StateName } from "./types";

export type StorySide = "fixed" | "kibble";
/** Who asked for the money: the agent doing its job, the agent fooled by a page, or someone with its key. */
export type StoryActor = "agent" | "tricked" | "thief";

export type Snap = {
  state: StateName;
  /** tUSD8 as plain numbers, for display only. */
  limit: number;
  canSpend: number;
  exposure: number;
  strikes: number;
  earned: number;
  spent: number;
  /** The owner's vault (Kibble) or the money kept in the box (fixed). */
  saved: number;
};

export type FlowStep = "sale" | "buy" | "refused" | "refund" | "earned" | "closed";

export type StoryEvent =
  | { kind: "scene"; at: number; title: string; text: string }
  | { kind: "flow"; at: number; side: StorySide; step: FlowStep; by: StoryActor; amount: number; to?: "supplier" | "stranger"; why?: ReasonName; tx?: Hex; snap?: Snap }
  | { kind: "start"; at: number; fixed: Snap; kibble: Snap }
  | { kind: "round"; at: number; n: number; fixed: Snap; kibble: Snap }
  | { kind: "end"; at: number; fixed: Snap; kibble: Snap };

export type Story = {
  id: string;
  title: string;
  /** Where the events come from, shown to the viewer. */
  source: string;
  recorded: string;
  onChain: boolean;
  events: StoryEvent[];
};

export const num = (v: bigint) => Number(v) / 1e6;

export function snapOf(v: DrawerView, vault: bigint): Snap {
  return {
    state: v.state,
    limit: num(v.limitT),
    canSpend: num(v.allowance),
    exposure: num(v.maxLossNow),
    strikes: Number(v.strikes),
    earned: num(v.lifetimeValue),
    spent: num(v.lifetimeSpend),
    saved: v.mode === "FIXED" ? num(v.reserve) : num(vault),
  };
}

const m = (x: number) => x.toFixed(3);

/** Why a payment was refused, in a few words. */
export function shortWhy(why: ReasonName | undefined): string {
  switch (why) {
    case "OverCeiling":
      return "it would spend more than it earned";
    case "NeedsApproval":
      return "an amount this big needs the owner's signature";
    case "OverUnknownBudget":
      return "this address isn't on the approved list";
    case "OverAllowance":
      return "the spending money is used up";
    case "OverSupplierPayment":
    case "OverSupplierWindow":
      return "it's over this supplier's cap";
    case "StatePaused":
      return "the agent is paused";
    case "DuplicateBill":
      return "this bill was already paid";
    default:
      return "the wallet's rules don't allow it";
  }
}

/** One plain sentence for an event. `prev` is the side's last known state, to notice changes. */
export function say(e: StoryEvent): string {
  if (e.kind === "scene") return e.text;
  if (e.kind === "round") return `The round closes. Kibble's limit is ${m(e.kibble.limit)}; the fixed limit is ${m(e.fixed.limit)}.`;
  if (e.kind === "start") return "Before anything happens.";
  if (e.kind === "end") return "That's the run.";
  const a = m(e.amount);
  switch (e.step) {
    case "sale":
      return `A customer pays ${a} into the cash box.`;
    case "buy":
      if (e.by === "thief") return `The thief spends ${a} of the owner's money. The fixed limit allows it.`;
      if (e.by === "tricked") return `The fooled agent sends ${a} to the attacker.`;
      return `The agent asks to pay the supplier ${a}. Allowed.`;
    case "refused":
      if (e.by === "thief") return `The thief asks for ${a}. Refused: ${shortWhy(e.why)}.`;
      if (e.by === "tricked") return `The fooled agent tries to send ${a} to the attacker. Refused: ${shortWhy(e.why)}.`;
      return `The agent asks for ${a}. Refused: ${shortWhy(e.why)}.`;
    case "refund":
      return `The customer gets ${a} back.`;
    case "earned":
      return `The customer confirms the work. The ${a} counts as earned.`;
    case "closed":
      return "A customer arrives, but this agent is paused and takes no orders.";
  }
}

export type SideTally = {
  snap?: Snap;
  first?: Snap;
  served: number;
  turnedAway: number;
  refused: number;
  stolen: number;
  /** Refused attempts by the thief or a fooled agent. */
  blocked: number;
  pausedAt?: number;
};

export type StoryState = { scene?: { title: string; text: string }; fixed: SideTally; kibble: SideTally; rounds: { n: number; fixed: number; kibble: number }[]; ended: boolean };

const side = (): SideTally => ({ served: 0, turnedAway: 0, refused: 0, stolen: 0, blocked: 0 });

/** Everything known after the first `count` events. */
export function storyState(events: StoryEvent[], count: number): StoryState {
  const s: StoryState = { fixed: side(), kibble: side(), rounds: [], ended: false };
  const put = (k: StorySide, snap: Snap | undefined, i: number) => {
    if (!snap) return;
    const t = s[k];
    if (t.snap && t.snap.state !== "Paused" && snap.state === "Paused") t.pausedAt = i;
    if (snap.state !== "Paused") t.pausedAt = undefined;
    t.first ??= snap;
    t.snap = snap;
  };
  for (let i = 0; i < Math.min(count, events.length); i++) {
    const e = events[i];
    if (e.kind === "scene") s.scene = { title: e.title, text: e.text };
    else if (e.kind === "start" || e.kind === "round" || e.kind === "end") {
      put("fixed", e.fixed, i);
      put("kibble", e.kibble, i);
      if (e.kind === "round") s.rounds.push({ n: e.n, fixed: e.fixed.limit, kibble: e.kibble.limit });
      else if (e.kind === "end") s.ended = true;
    } else {
      const t = s[e.side];
      if (e.step === "earned") t.served++;
      if (e.step === "closed" || e.step === "refund") t.turnedAway++;
      if (e.step === "refused") {
        t.refused++;
        if (e.by !== "agent") t.blocked++;
      }
      if (e.step === "buy" && e.by !== "agent") t.stolen += e.amount;
      put(e.side, e.snap, i);
    }
  }
  return s;
}
