# What a capable attacker gets

`make attacks` runs these against the real contracts ([`KibbleAttacks.t.sol`](../contracts/test/sim/KibbleAttacks.t.sol)). The attacker holds the stolen agent key, has money of their own, and **secretly owns the approved supplier**, which is the worst case.

The comparison is tilted against Kibble on purpose:

- **Fixed, well run:** a limit 25% above real demand, a supplier cap, loss alerts, and a human who freezes it. Shown with a fast human (1 window after the attack starts) and a slow one (5 windows).
- **Kibble:** nobody reacts, for 20 windows.

Amounts are tUSD8. The agent has done 25 honest windows first: Kibble's earned limit is 3.4, the fixed limit is 0.6.

| Attack | Fixed, fast human: attacker's net | Fixed, slow human: attacker's net | Kibble, no human: attacker's net | Kibble: owner's loss | `maxLossNow` at the start | Kibble ends |
|---|---|---|---|---|---|---|
| Overbuy flat out | 0.500 | 2.500 | **0.000** | 0.000 | 3.368 | Paused |
| Overbuy in the learning period | 0.500 | 2.000 | **0.000** | 0.000 | 2.000 | Paused |
| Fake sale, overspend, refund it | 0.600 | 3.000 | **loses money** | gains | 3.368 | Watch |
| Fake sales, never refunded | loses money | loses money | loses money | gains | 3.368 | Healthy |
| Wash sales to grow T, then grab | loses money | loses money | loses money | gains | 3.368 | Watch |
| Slow drip inside the slack | 0.050 | 0.250 | **1.000** | 1.000 | 3.368 | Healthy |
| Pay the attacker directly | 0.000 | 0.000 | **1.000** | 1.000 | 3.368 | Healthy |
| Skim while business goes on | 0.120 | 0.600 | **3.650** | gains 10.750 | 3.368 | Healthy |
| Take real orders, spend, vanish | 0.600 | 3.000 | **4.150** | gains 5.850 | 3.368 | Healthy |

## Where Kibble is clearly better

Loud attacks. An attacker who grabs what they can gets nothing and the agent pauses itself, with no human. Faking sales costs the attacker more than it yields, because the money goes to the owner.

## Where Kibble, left alone, is worse

- **Slow drip.** The slack (0.05 a window) is spendable with no sales, and it is too small to count as activity, so it never becomes a strike.
- **Paying the attacker directly.** The stranger budget allows 1 tUSD8 for life, by design. The fixed side allows nothing.
- **The skim.** While real sales keep coming, an attacker can take the room between the agent's real cost share and its ceiling, window after window. The owner still makes money, so nothing on chain looks wrong. `skimBps()` shows the size of the gap.
- **Take orders and vanish.** The attacker takes real customers' orders, spends against them at their own supplier, and delivers nothing. The customers' money ends up with the owner, so the owner isn't out of pocket, but **the customers are** until the owner refunds them.

The last two can pass `maxLossNow` over time, because new customer money refills the allowance. `maxLossNow` is the bound on what can be taken from the owner **now**, and every attack without new customer money stayed inside it (asserted in the tests).

## What the owner can do about it

Two settings, both lowered instantly with `tighten`:

| Attack | Default | Strict (`Slack` 0, `UnknownBudget` 0) |
|---|---|---|
| Slow drip inside the slack | 1.000 | 0.050 (one payment, from unused room) |
| Pay the attacker directly | 1.000 | 0.000 |
| Skim while business goes on | 3.650 | 2.700 |
| Overbuy flat out | 0.000 | 0.000 |

Strict costs an agent with no sales yet its first purchase: it has to sell before it buys. For the skim and for vanishing with orders, the answer is a human: [alerts](alerts.md) on refunds, supplier concentration and undelivered orders, per-supplier caps, and approved suppliers you actually know.
