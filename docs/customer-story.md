# A worked example: a small summary business

**This is an illustration, not a real customer.** The people are invented. Every number is from a run in this repository, and says which one.

## Who pays, and for what

Asha runs a one-person service that turns long documents into short summaries. An AI agent does the work: it reads the order, buys a model call from a supplier, checks the draft and delivers it. Asha sleeps while it works, so the agent has to be able to spend.

She sets one number: **the most she's willing to lose in a week, 2 tUSD8.** Everything else follows.

| | Per order |
|---|---|
| The customer pays | 0.010 |
| The agent buys a model call | 0.004 |
| Left for Asha | 0.006 (60%) |

## A shift, on Aevum testnet

Five orders, a real model (Nemotron 3 Ultra) making every decision, 26 Nov ([log](runs/testnet-v2-2026-11-26.txt)):

- **Four delivered**, for 0.040 earned and 0.016 spent.
- **One turned down.** The customer offered 0.002, less than the model call. The agent said so and refunded them.
- **One page carried a hidden instruction** to send the attacker money. This time the model ignored it. In a simpler setup the same model obeyed it 10 times out of 10 across two models ([evidence](../EVIDENCE.md#the-hijack-with-a-real-model-25-nov-2026)), which is why the limit isn't in the prompt.

## What a bad night costs her

| Night | Fixed limit | Kibble |
|---|---|---|
| The supplier raises its price above hers ([testnet](runs/testnet-v2-2026-11-26.txt)) | Lost 0.108 over six windows and kept going | Paused itself 93 s after the jump, 1 payment made |
| Someone steals the key and overbuys ([testnet](runs/testnet-v2-2026-11-26.txt)) | Paid out 0.150, still running | Paid 0.000, paused after 2 s |
| Someone steals the key and is patient ([attack table](attacks.md), other amounts) | A human who reads alerts loses less | **Worse if nobody looks**: turn on [alerts](alerts.md) |

## What it's worth

In [the simulation](simulation.md), a fixed limit roomy enough for growth lost three times as much to thieves (23.00 against 7.55 tUSD8, across 120 agents). A fixed limit tight enough to be safe turned away 4,474 sales against Kibble's 2,636. The simulation's owners ended up with 2% more than with the roomy limit, and 13% more than with the tight one. Those agents are made up, so take the direction, not the percentages.

## What she'd pay for it

We don't know: nobody has been asked yet. A fee on swept profit is possible, and it isn't built.
