# DoraHacks submission: Aevum Builder Challenge #1

Text to paste into the BUIDL form. Nothing here is submitted automatically. Deadline: **11 Dec 2026, 08:00 UTC** (16:00 HKT).

## Fields

**Project name**
Kibble

**Tagline** (one line)
The earned spending limit for AI agents: a wallet contract that makes an agent earn its budget, and brakes it on its own.

**Short description** (about 250 characters)
Kibble gives every AI agent a locked tUSD8 drawer on Aevum. The agent's key holds no money; it spends from a small allowance that refills only from real sales, profit goes to the owner's vault, and overspending pauses the agent with no human watching.

**Links**
- GitHub: https://github.com/mithileshofficial06/kibble
- Live app: https://kibble-two-pi.vercel.app
- Demo video: *(YouTube link, unlisted; add after upload)*
- Contracts on the explorer (verified): https://explorer-test.qday.info/address/0x296a2e00c0b934dfea4384572972cd4e46322afe
- Transactions to check: https://github.com/mithileshofficial06/kibble/blob/main/EVIDENCE.md#transactions-to-check-on-the-explorer

**Tags**
AI agents, agentic payments, stablecoin, spending limits, smart contracts, security, Aevum, tUSD8

**Team**
Solo: Mithilesh

## Description (paste as the main project description)

### The problem

AI agents now pay for model calls, data and other agents' work on their own. Owners protect them with a fixed limit, say $50 a day. A fixed limit is a guess, and it fails three ways:

- a **good agent** hits the cap and turns customers away;
- a **losing agent** spends the full limit every day until someone reads an alert;
- a **hijacked agent** (stolen key, or a prompt injection) hands the attacker the whole limit, every day.

A prompt that says "stay within budget" is not a guard. The limit has to live in the wallet, and it has to follow how the agent actually performs.

### The solution

Kibble is a wallet contract that makes the agent **earn** its spending limit.

1. **A locked box per agent.** All the agent's money sits in its drawer contract. The agent's key holds nothing: it can only ask the drawer to pay, and only suppliers the owner allowed, within caps.
2. **An earned limit.** The agent spends from a small allowance capped at a limit T. The allowance refills only from verified value: sales that cleared, or work an approved client signed off. Profit grows T; a loss shrinks it.
3. **Profit goes home.** Everything above the allowance is swept to the owner's vault, which the agent can never reach.
4. **The wallet brakes the agent by itself.** Spending more than it earned walks the agent Healthy → Watch → Braked → Paused. No human has to be watching.
5. **One number.** The owner sets only the most they'll lose in a week; everything else is derived or learned in the first windows.

The worst case is never a guess: `maxLossNow()` returns, on chain at any moment, the most a stolen key could take.

### Tested on Aevum testnet

Two agents with the same code and the same customers, one with a fixed limit and one with Kibble, all on Aevum testnet in tUSD8 (26 Nov 2026):

| Run | Fixed limit | Kibble |
|---|---|---|
| A busy day | same limit every round (0.050) | the limit grew 0.279 → 0.291; 0.080 swept to the owner's vault |
| A losing day | lost 0.153, still paying | stopped itself 70 s after the price jump |
| A stolen key | the thief overbought 0.150, still Healthy | the thief got 0.000; the drawer locked in 2 s |

Every step is a transaction you can open on the explorer: drawer created, sale, gasless buy, payment with receipt, refusal, pause, sweep to the vault, two-key resume ([list](https://github.com/mithileshofficial06/kibble/blob/main/EVIDENCE.md#transactions-to-check-on-the-explorer)). Anyone can run the three demos from the [Playground](https://kibble-two-pi.vercel.app/playground).

### How it uses Aevum

- **tUSD8** for all money. Its EIP-2612 `permit` and EIP-3009 support power a pay-per-request API: a buyer with no gas pays a seller's drawer with one signature, bound to the bill so it can't be reused.
- **Smart contracts on Aevum** (Shanghai EVM): a factory, one drawer per agent (EIP-1167 clones), an admin module and the owner's vault, **verified on the Aevum explorer**.
- **Spending limits and a scoped agent key**: the drawer is the limit; the key can only ask its own drawer to pay.
- **On-chain history**: a `TrackRecord` event at every window close, ready for ERC-8004 once a registry opens.
- Built from the **Aevum Starter Kit**. Post-quantum on the roadmap: an ML-DSA guardian for the vault once QDay's precompile ships.

### Safety, trust and controls

Least privilege (the agent key holds nothing; allowed suppliers only, capped per payment and per window; at most 1 tUSD8 for life to anyone else), owner approval above a threshold (EIP-712), instant freeze and revoke by the owner or a guardian, raises wait 24 hours and the guardian can cancel, two-key resume, pay-once per bill. Prompt injection was tested with real models. Every payment leaves a receipt and every refusal an event.

### Quality

181 tests (unit, fuzz, attack, invariant and fork tests on the real tUSD8), 10 invariants checked over 128,000 random calls, 100% line coverage of the Kibble contracts, Slither. A TypeScript SDK (`KibbleAgent.pay`, `paidFetch`), a command-line tool (`pnpm kibble new | try | status | freeze | resume`), Discord alerts and an owner's assistant.

### Who it's for, and what's next

Teams whose agents buy model calls, data and services, and sellers who want agents as paying customers. Plan: the contracts stay open source; revenue from a hosted control room for teams with many agents (alerts, approvals, reports) and a small fee on sweeps to the owner's vault, taken only from profit. Before mainnet (February): an external audit, many agents per owner with one total loss budget, signed attestations for off-chain revenue, the SDK on npm, and ERC-8004 history.

### Technologies

Solidity 0.8.24, Foundry, OpenZeppelin, Slither; QDay Aevum testnet and tUSD8; TypeScript, viem, pnpm; Next.js 16, React 19, RainbowKit and wagmi, React Three Fiber; Vercel. Demo film made with Remotion.

## Checklist against "How to submit"

| Requirement | Where |
|---|---|
| Open-source codebase | https://github.com/mithileshofficial06/kibble (MIT) |
| Aevum integration evidence | Verified contracts and the transaction list above |
| Live deployment | https://kibble-two-pi.vercel.app |
| Short demo | The film (YouTube link above) |
| Project documentation (problem, architecture, workflows, technologies) | The README, with flowcharts, environment variables, addresses, code examples and the judging-criteria map |
| No malicious code | Test keys only; no keys in the repository |

## If Kibble is in the top 5 (Demo Day, 15 Dec 2026, 06:00 UTC)

A 3 to 5 minute live call. On Vercel, "Run it for real" is switched off, so for the live part run the local server with the demo keys (`KIBBLE_PLAYGROUND=on`, see [deploy.md](deploy.md)) or show `pnpm kibble try` in a terminal. Keep the film ready as a backup.
