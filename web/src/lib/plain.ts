// Plain words for people who have never seen Kibble. Technical names stay available as hints.
import type { DrawerView } from "@kibble/sdk";

export const TERMS = {
  box: { word: "Cash box", hint: "Each agent's own contract (a “drawer”). It holds the money. The agent can only ask it to pay." },
  limit: { word: "Spending limit", hint: "The most the agent may hold to spend (T). With Kibble it's earned: profit raises it, losses lower it." },
  canSpend: { word: "Can spend now", hint: "The spending money left in the box (the allowance)." },
  exposure: { word: "A thief could take", hint: "The most someone with the agent's key could take from the owner right now (maxLossNow). 0 while paused." },
  vault: { word: "Owner's vault", hint: "Profit is moved here automatically. The agent's key can never reach it." },
  round: { word: "Round", hint: "The wallet judges the agent once per round (a “window”): 2 minutes in this demo, a day in real use." },
  ceiling: { word: "Cost ceiling", hint: "How much of its earnings the agent may spend. Learned from its own first rounds." },
  strikes: { word: "Strikes", hint: "Asking for more than the cost ceiling allows is a strike. Three strikes pause the agent." },
  approval: { word: "Needs your signature above", hint: "Payments above this need the owner to sign (the approval threshold)." },
  stranger: { word: "Stranger budget", hint: "The most the agent may ever pay to addresses that aren't on its approved list." },
  runway: { word: "Advance", hint: "Money the owner lends the agent for a set time, for spending before it earns (a runway grant)." },
  guardian: { word: "Guardian", hint: "A second key you control. It can stop the agent and cancel risky changes, and is needed to restart it." },
} as const;
export type TermKey = keyof typeof TERMS;

/** What a state means, in a few words. */
export const STATE_WORDS: Record<string, string> = {
  Learning: "New: learning its normal costs",
  Healthy: "Working normally",
  Watch: "On watch",
  Braked: "Braked",
  Paused: "Stopped",
  Revoked: "Shut down for good",
};

type Why = Pick<DrawerView, "mode" | "state" | "strikes" | "lifetimeValue" | "lifetimeSpend" | "limitT" | "allowance">;
const m = (v: bigint) => (Number(v) / 1e6).toFixed(3);

/** One sentence: why is it in this state? `last` is the contract's own reason for the last change, if known. */
export function whyState(v: Why, last?: string): string {
  const profit = v.lifetimeValue - v.lifetimeSpend;
  if (v.mode === "FIXED") {
    if (v.state === "Paused") return "Stopped by its owner. A fixed limit never stops an agent by itself.";
    if (profit < 0n) return `It has lost ${m(-profit)} and is still paying. A fixed limit doesn't notice losses.`;
    return `It may spend ${m(v.limitT)} every round, whatever happens.`;
  }
  switch (v.state) {
    case "Learning":
      return "The wallet is watching its first rounds to learn what its work normally costs.";
    case "Healthy":
      return profit > 0n ? `It has made ${m(profit)} so far, so its limit can keep growing.` : "It's working normally and hasn't overspent.";
    case "Watch":
      return last ? `${last}. It gets less spending money until it has two clean rounds.` : "After a strike, a loss or a restart, it gets less spending money until it has two clean rounds.";
    case "Braked":
      return last ? `${last}. Its spending money isn't refilled until it makes a profit.` : "It kept overspending or losing, so its spending money isn't refilled until it makes a profit.";
    case "Paused":
      if (v.strikes >= 3n) return "It tried to spend more than it earned, three times. Its wallet stopped it.";
      return last ? `${last}.` : "Stopped by its owner, its guardian or a safety rule.";
    default:
      return "Shut down for good. Its money went back to the owner's vault.";
  }
}
