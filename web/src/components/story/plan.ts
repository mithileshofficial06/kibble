import type { Snap, StoryEvent, StorySide } from "@kibble/sdk";

export type Focus = "sales" | "loss" | "theft";
export const FOCUS: Record<string, Focus> = { "sales-rush": "sales", "bad-strategy": "loss", hijack: "theft" };

export type Beat = { ms: number; fast: boolean; change?: { side: StorySide; to: string } };

const BASE: Record<string, number> = { scene: 3600, start: 500, round: 2400, end: 400, sale: 800, buy: 850, earned: 900, refused: 1200, refund: 700, closed: 500 };

/**
 * How long each event stays on screen. The first few of a kind play slowly; repeats are fast-forwarded;
 * a wallet changing its mind always gets time to be seen.
 */
export function planStory(events: StoryEvent[]): Beat[] {
  const seen = new Map<string, number>();
  const state: Partial<Record<StorySide, string>> = {};
  const out: Beat[] = [];
  for (const e of events) {
    if (e.kind === "scene") {
      seen.clear();
      out.push({ ms: BASE.scene, fast: false });
      continue;
    }
    if (e.kind !== "flow") {
      for (const k of ["fixed", "kibble"] as const) state[k] = e[k].state;
      out.push({ ms: BASE[e.kind], fast: false });
      continue;
    }
    const key = `${e.side}|${e.step}|${e.by}|${e.why ?? ""}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const was = state[e.side];
    const now = e.snap?.state;
    if (now) state[e.side] = now;
    if (was && now && was !== now) {
      out.push({ ms: 2600, fast: false, change: { side: e.side, to: now } });
      continue;
    }
    const fast = n > (e.step === "refused" ? 3 : 2);
    out.push({ ms: fast ? 110 : BASE[e.step], fast });
  }
  return out;
}

/** The latest snapshot of a side at `count`, or the next one to come (so nothing starts blank). */
export function snapAt(events: StoryEvent[], count: number, side: StorySide): Snap | undefined {
  const get = (e: StoryEvent) => (e.kind === "flow" ? (e.side === side ? e.snap : undefined) : e.kind === "scene" ? undefined : e[side]);
  for (let i = Math.min(count, events.length) - 1; i >= 0; i--) {
    const s = get(events[i]);
    if (s) return s;
  }
  for (let i = count; i < events.length; i++) {
    const s = get(events[i]);
    if (s) return s;
  }
  return undefined;
}
