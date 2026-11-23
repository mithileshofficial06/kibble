/**
 * The hero's replay: the hijack from testnet run 2 (docs/runs/testnet-run2-2026-11-22.txt),
 * printed as two receipt tapes. Every number here is from that run.
 */

export type Tone = "in" | "out" | "attack" | "paid" | "refused" | "note";
export type Line = { id: number; label: string; amount?: string; tone: Tone; stamp?: boolean };
export type Tally = { rows: [string, string][]; verdict: string };
export type SideState = {
  lines: Line[];
  limit: string;
  exposure: string;
  state: "LEARNING" | "HEALTHY" | "PAUSED";
  led: "ok" | "warn" | "bad";
  paused: boolean;
  tally: Tally | null;
};
export type Phase = "boot" | "normal" | "attack" | "result";
export type DeskState = { L: SideState; R: SideState; phase: Phase; step: number; loop: number; nextId: number };

type SideKey = "L" | "R";
export type Action =
  | { t: "print"; side: SideKey | "both"; line: Omit<Line, "id"> }
  | { t: "side"; side: SideKey; patch: Partial<SideState> }
  | { t: "phase"; phase: Phase };

const MAX_LINES = 16;

export function initialDesk(loop = 0): DeskState {
  return {
    L: { lines: [], limit: "0.050", exposure: "0.578", state: "HEALTHY", led: "ok", paused: false, tally: null },
    R: { lines: [], limit: "0.200", exposure: "0.200", state: "LEARNING", led: "ok", paused: false, tally: null },
    phase: "boot",
    step: 0,
    loop,
    nextId: 1,
  };
}

export function apply(s: DeskState, a: Action): DeskState {
  switch (a.t) {
    case "phase":
      return { ...s, phase: a.phase };
    case "side":
      return { ...s, [a.side]: { ...s[a.side], ...a.patch } };
    case "print": {
      const sides: SideKey[] = a.side === "both" ? ["L", "R"] : [a.side];
      let next = { ...s };
      for (const k of sides) {
        const line = { ...a.line, id: next.nextId };
        next = { ...next, nextId: next.nextId + 1, [k]: { ...next[k], lines: [line, ...next[k].lines].slice(0, MAX_LINES) } };
      }
      return next;
    }
  }
}

/** [delay in ms before the action, action] */
export type Step = [number, Action];

const attackLine = { label: "Supplier ×5 · attacker", amount: "−0.050", tone: "attack" as const };

function build(): Step[] {
  const s: Step[] = [];
  const at = (delay: number, a: Action) => s.push([delay, a]);
  // Kibble A's earned limit and hijack exposure as sales clear (windows 8–10 of run 2).
  const earned: Record<number, [string, string]> = { 2: ["0.218", "0.212"], 4: ["0.239", "0.224"], 6: ["0.260", "0.251"] };

  at(600, { t: "phase", phase: "normal" });
  for (let k = 1; k <= 6; k++) {
    at(k === 1 ? 500 : 480, { t: "print", side: "both", line: { label: `Sale #${k} · summary`, amount: "+0.010", tone: "in" } });
    at(360, { t: "print", side: "both", line: { label: "Model call", amount: "−0.004", tone: "out" } });
    if (k === 3) at(0, { t: "side", side: "R", patch: { state: "HEALTHY" } });
    if (earned[k]) at(0, { t: "side", side: "R", patch: { limit: earned[k][0], exposure: earned[k][1] } });
  }

  at(1100, { t: "phase", phase: "attack" });
  // Attempt 1
  at(1000, { t: "print", side: "both", line: attackLine });
  at(520, { t: "print", side: "L", line: { label: "Paid", amount: "✓ 0.050", tone: "paid" } });
  at(0, { t: "side", side: "L", patch: { exposure: "0.528" } });
  at(0, { t: "print", side: "R", line: { label: "Over cost ceiling", amount: "✕", tone: "refused", stamp: true } });
  at(0, { t: "side", side: "R", patch: { led: "warn" } });
  // Attempt 2
  at(1400, { t: "print", side: "both", line: attackLine });
  at(520, { t: "print", side: "L", line: { label: "Paid", amount: "✓ 0.050", tone: "paid" } });
  at(0, { t: "side", side: "L", patch: { exposure: "0.478" } });
  at(0, { t: "print", side: "R", line: { label: "Over cost ceiling", amount: "✕", tone: "refused" } });
  // Kibble pauses itself.
  at(900, { t: "print", side: "R", line: { label: "paused itself after 4 s — no human", tone: "note" } });
  at(250, { t: "side", side: "R", patch: { paused: true, state: "PAUSED", led: "bad", exposure: "0.000" } });
  // The fixed drawer only stops at its window cap, and refills next window.
  at(1200, { t: "print", side: "L", line: attackLine });
  at(520, { t: "print", side: "L", line: { label: "window cap hit — refills next window", tone: "note" } });

  at(1000, { t: "phase", phase: "result" });
  at(250, {
    t: "side",
    side: "L",
    patch: {
      tally: {
        rows: [["Overbought", "0.100"], ["State", "still Healthy"], ["Exposure", "0.478 ↻"]],
        verdict: "Keeps paying until a human notices.",
      },
    },
  });
  at(300, {
    t: "side",
    side: "R",
    patch: {
      tally: {
        rows: [["Overbought", "0.000"], ["State", "Paused in 4 s"], ["Exposure", "0.000"]],
        verdict: "Stopped itself. Nobody was watching.",
      },
    },
  });
  return s;
}

export const SCRIPT: Step[] = build();
/** How long the result stays on the desk before the tapes are torn off. */
export const HOLD_MS = 6500;
export const SCRIPT_MS = SCRIPT.reduce((t, [d]) => t + d, 0);

/** The end state, for reduced motion: no replay, just the outcome. */
export function finalDesk(): DeskState {
  return SCRIPT.reduce((s, [, a]) => apply(s, a), initialDesk());
}
