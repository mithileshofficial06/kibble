# kibble

**The earned spending limit for AI agents.** On QDay Aevum testnet (chain 44005), in tUSD8.

> ### For judges, in 60 seconds
> - **The idea:** a fixed limit ("$50 a day") is a guess that treats a winning, a losing and a hijacked agent the same. Kibble makes the agent **earn** its budget: it spends from a small allowance capped at a limit **T** that refills only from **verified value**, meaning cleared sales or work an approved client signed off. Profit is swept to a vault the agent can't call. **The wallet brakes the agent**: overspending walks it Healthy → Watch → Braked → Paused, with no human watching.
> - **The owner sets one number**, the most they'll lose in a week. Everything else is derived or learned in the first windows.
> - **The exact hijack bound**, live on chain as `maxLossNow()`: *the allowance (≤ T) plus any runway the owner granted.* Paying strangers comes out of that allowance and is capped at 1 tUSD8 for life. Overspending is refused and pauses the agent. The vault is never reachable.
> - **Same contract, two modes**: `FIXED` is the comparison side of the split screen and `EARNED` is Kibble, so the comparison is fair.
> - **Proof:** 109 Kibble tests in Foundry (unit, fuzz, attack and fork tests), including 10 invariants checked over 128,000 random calls and 3 tests against the real tUSD8 on a fork. There are also five scripted demo scenarios ([EVIDENCE.md](EVIDENCE.md)).
> - **Live on Aevum testnet:** factory [`0x296a2e00…2afe`](https://explorer-test.qday.info/address/0x296a2e00c0b934dfea4384572972cd4e46322afe), five demo drawers and an owner vault, with every scenario run on chain ([Deployments](#deployments), [EVIDENCE.md](EVIDENCE.md#aevum-testnet)). The web app shows the split screen, each drawer's receipts and track record, the owner controls, and a no-wallet playground.
> - Also covered, as every rival does: approved suppliers with caps, owner approval for big payments, a receipt for every payment, pay-once per bill, and instant freeze.

---

## Contents

- [The problem](#the-problem)
- [How Kibble works](#how-kibble-works)
- [Architecture](#architecture)
- [What a hijacker can take](#what-a-hijacker-can-take)
- [Run it](#run-it)
- [Demo scenarios](#demo-scenarios)
- [The web app](#the-web-app)
- [Contract API](#contract-api)
- [Platform findings (Aevum)](#platform-findings-aevum)
- [Known limits](#known-limits)
- [Roadmap](#roadmap)
- [Credits and license](#credits-and-license)

## The problem

Agents now pay for model calls, data and other agents' services on their own. Owners protect them with a **fixed limit**, which fails three ways:

| Agent | With a fixed limit and alerts |
|---|---|
| Losing | Keeps spending up to the limit every day until a human reads the alert |
| Winning | Hits the cap and turns customers away until someone raises it by hand |
| Hijacked | The attacker spends the full limit, every day, until a human reacts |

A prompt that says "stay within budget" is not enforcement. In March 2025 the AIXBT agent lost about 55 ETH after an attacker queued prompts that made it send funds. The limit has to live in the wallet, and it has to move with how the agent actually performs.

## How Kibble works

A shop with a cash drawer and a safe:

1. **The drawer** (`KibbleDrawer`, one per agent) holds all the agent's money. The agent's key holds nothing: it can only ask the drawer to pay.
2. **Small float.** The agent spends from an allowance capped at **T**.
3. **Verified value refills it**:
   - **sales income**: a buyer pays the drawer for a bill, and the income clears after a hold or when the buyer acknowledges delivery. Uncleared income can fund a refund for its own bill.
   - **accepted work** (for agents that sell nothing): an approved acceptor signs `WorkAccepted(jobId, value, deadline)`, which releases budget the owner set aside. Work credits can't create money; they only decide how fast the owner's budget is released.
4. **Profit goes to the safe.** Everything above the allowance is swept to the owner's `KibbleVault`.
5. **The limit is earned.** At each window close, profit grows T by min(`maxStep`, profit × `growthBps`), and a loss shrinks T by the loss.
6. **Cost ceiling.** Window spend (plus earlier spend still resting on uncleared sales) can't exceed `(value + pending sales) × costBps + unused room from the last window + slack`. **One sale backs its spend once**, and the agent key can't refund a sale its spending rests on. A payment over it is refused and counts as a strike, at most one per cooldown.
7. **The wallet brakes the agent.** Strikes or drawdown walk the ladder: 1 strike → **Watch** (refills to T/2), 2 → **Braked** (no refills), 3, or weekly drawdown ≥ L → **Paused**. Two clean windows bring it back to Healthy.
8. **One owner setting**: `maxWeeklyLoss` = L. From it: Tmax = L/2, Tstart = min(2, L/10), approval threshold = L/10, Braked at drawdown L/2, Paused at L. A **learning period** (5 demo windows, 7 by default) measures the agent's real cost share and sets `costBps` to that share plus 10 points (at most 95%).
9. **Tighten fast, loosen slow.** Lowering anything is instant. Raising anything, adding a supplier or acceptor, or resuming waits 24 h (2 min in the demo), and the guardian can cancel it. Owner and guardian together can `resumeNow` at once.
10. **Refuse, don't revert.** A policy refusal returns `false` and emits `Refused(fp, reason)`, so strikes persist.

Plus the basics every rival has: approved suppliers with per-payment and per-window caps, **1 tUSD8 lifetime** to anyone else, owner EIP-712 approval above a threshold, a stored and emitted receipt for every payment, pay-once per bill (`fp = keccak256(payee, amount, billRef)`), and freeze or revoke by the owner or guardian.

## Architecture

```
 buyers / requesters                                        owner + guardian
   │ buy(billRef) / EIP-3009 gasless buy                     │ maxWeeklyLoss, suppliers, acceptors,
   │ ackDelivery / creditWork(signed WorkAccepted)           │ approvals, freeze, revoke, resume
   ▼                                                         │
 ┌───────────────────────────────────────────────┐           │
 │ KibbleDrawer (EIP-1167 clone, one per agent)  │◀──────────┘
 │  pending income → cleared value               │   unknown selectors are delegatecalled to
 │  allowance ≤ T · work budget · runway         │── KibbleAdmin (owner/guardian functions)
 │  ceiling · ladder · U · caps · fp · receipts  │
 └───────────────────────────────────────────────┘─── sweep ──▶ KibbleVault (one per owner)
   ▲ pay / payWithApproval / refund / sync          tUSD8                instant only to `home`
   │                                                  ▼                  (the guardian); any other
 agent key (holds 0 tokens)                   approved suppliers         address waits 24 h
                                              (≤ 1 tUSD8 ever to strangers)
```

| Contract | What it is |
|---|---|
| [`KibbleDrawer`](contracts/src/KibbleDrawer.sol) | Per-agent drawer. `pay`, `payWithApproval`, `refund`, `buy`, `buyWithAuthorization`, `ackDelivery`, `creditWork`, `sync`, views. Deployed as minimal clones by the factory |
| [`KibbleAdmin`](contracts/src/KibbleAdmin.sol) | Owner and guardian functions (funding, freeze, revoke, tighten, queue/execute/cancel, resumeNow). The drawer delegatecalls it, so callers see one address. Split out to stay under the 24 KB contract limit |
| [`KibbleCore`](contracts/src/KibbleCore.sol) | Shared storage, events and the sync / window / ladder machinery |
| [`KibbleVault`](contracts/src/KibbleVault.sol) | Owner's safe. Instant withdrawals only to `home`; any other address waits and can be cancelled |
| [`KibbleFactory`](contracts/src/KibbleFactory.sol) | Creates vaults and drawers; `defaultConfig(L)` and `demoConfig(L)` |
| [`@kibble/sdk`](packages/kibble/src) | Merged ABI, typed data (approvals, work, resume), `payOnce` (pay exactly once under retries), plain-words reasons |
| [`agents/`](agents/src) (`@kibble/agents`) | Setup, supplier, sale loop, injection page with a real-model summarizer (Claude or NVIDIA-hosted), scenario runner, playground beats |
| [`web/`](web/src) | Next.js app: split-screen dashboard, drawer pages (receipts, track record, owner/guardian controls), playground |

### `_sync()`, which runs at the start of every call

1. Balance dropped with no known cause → **Paused** (`UnexplainedOutflow`).
2. New tokens → pending income; clear what passed its hold. At most max(T, last window's value) clears as value per block, and the rest goes straight to the vault.
3. Expire a runway grant (to the vault).
4. Close the window if due: classify it, move T, update learning, the ladder and drawdown; emit `WindowClosed` and `TrackRecord`.
5. Refill the allowance (Learning/Healthy up to T, Watch up to T/2, otherwise none) and sweep everything else to the vault.

## What a hijacker can take

A stolen agent key, or a prompt injection that gets the model to call `pay`:

| | Fixed mode, with alerts | Kibble |
|---|---|---|
| Pay a stranger | Nothing (allowlist) | At most 1 tUSD8, ever |
| Overspend with approved suppliers | Up to the full limit, refilled every window, until a human reacts | Refused at the cost ceiling; 3 strikes → **Paused**, automatically |
| Reach the savings | Everything sits in the drawer the limit refills from | Profit is already in the vault |
| Fake its own earnings | n/a | Work credits need an approved acceptor that is never the agent key; self-sent income is the attacker's own money |
| Raise the ceiling with a fake sale, then refund it | n/a | Refund refused while spending rests on that sale. Left to clear, the money goes to the owner ([how we found this](EVIDENCE.md#the-refund-loophole-found-and-fixed)) |
| Pay a bill twice, raise limits, unpause, withdraw | Blocked | Blocked |

**The exact bound** (the `maxLossNow()` view, shown live):

```
maxLossNow = allowance (≤ T) + active runway          (0 once Paused)
ongoing   ≤ (costBps − learned cost share) × value per window      (the "skim"; skimBps() shows it, 10 points by default)
```

Honest note: an allowlisted fixed vault also pays strangers nothing. Kibble's edge is not the stranger rule. It is that **the wallet pauses the agent** and **the savings are out of reach**.

## Run it

Needs Node 22+, pnpm and Foundry.

```bash
git clone --recursive https://github.com/mithileshofficial06/kibble.git
cd kibble
make install                     # Solidity libs + JS packages
make build && make test          # compile (Shanghai-checked) + unit/fuzz/invariant tests
make test-fork                   # fork tests against the real tUSD8 on Aevum
```

**Run the demo on a local copy of Aevum** (real tUSD8, free balances, time can be fast-forwarded):

```bash
make fork                                     # terminal 1: Aevum fork on 127.0.0.1:8555
pnpm --filter @kibble/agents setup-demo               # terminal 2: deploy Kibble + vault + 5 drawers
pnpm --filter @kibble/agents scenario all             # time-lapse, bad strategy, hijack, work, controls
pnpm --filter @kibble/agents scenario status
```

On a local chain the scripts make throwaway keys. To use your own, put `OWNER_PRIVATE_KEY`, `GUARDIAN_PRIVATE_KEY`, `AGENT_A_PRIVATE_KEY`, `AGENT_B_PRIVATE_KEY`, `SUPPLIER_PRIVATE_KEY`, `BUYER_PRIVATE_KEY` and `RELAYER_PRIVATE_KEY` in a `.env` file **outside the repo** and point `KIBBLE_WALLETS` at it.

**On Aevum testnet:** one Discord faucet claim (1 tQDAY + 5 tUSD8) to the owner is enough. On testnet the demo runs at **one tenth of the amounts** (`KIBBLE_SCALE`, default 0.1 there) with **2-minute windows**, and `setup-demo` shares the owner's gas and tUSD8 out to the other roles:

```bash
RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents setup-demo           # deploy, share out, 5 drawers
RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents scenario all         # ~45 min of real time
RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents setup-demo --fresh   # new drawers; reclaims the old ones' tUSD8
```

`--fresh` on testnet revokes the old drawers, has the vault pay out to its home (the guardian), and returns the guardian's and supplier's tUSD8 to the owner, so one faucet claim covers many runs. The scale is saved in `deployments/<chainId>.json`, so later runs use the same amounts as the drawers.

**The injection beat with a real model:** the hijack scenario can ask a real model to summarize the poisoned page while it holds a `pay` tool. Set `NVIDIA_API_KEY` for an open model on NVIDIA's hosted API (default `nvidia/nemotron-3-ultra-550b-a55b`, `KIBBLE_NVIDIA_MODEL` overrides it) or `ANTHROPIC_API_KEY` for `claude-opus-5-5` (with the server-side refusal fallback). `KIBBLE_LLM=off|auto|claude|nvidia` picks one. Without a key, or with `off`, a scripted naive model obeys the hidden instruction, and the output says which one ran. Malformed pay calls are dropped. The public Playground always uses the scripted model. Either way the contract decides, not the prompt.

On 25 Nov 2026 both NVIDIA-hosted models we tried obeyed the hidden instruction **in all 10 trials** (5 each), and on Aevum testnet Nemotron 3 Ultra asked to pay the attacker and the drawer refused ([EVIDENCE.md](EVIDENCE.md#the-hijack-with-a-real-model-25-nov-2026)). In the fuller AI-agent setup below, the same Nemotron 3 Ultra ignored it in 3 of 3 shifts: a prompt decides how often a model is fooled, and the contract bounds what happens when it is. Claude has not been run.

**A real AI agent at work:** `scenario ai` has the model run Agent A as a business. It reads each customer job, checks its wallet on chain, buys a model call from the supplier through the drawer, and delivers or turns the job down. On the fork it delivered four jobs, turned down the one priced below cost and made a profit, in all three runs ([log](docs/runs/ai-agent-fork-2026-11-25.txt)). It needs a model key.

## The owner's assistant

The app's **Assistant** page answers questions about any drawer ("Why was it paused?", "What could a thief take?") from live chain data, and can **prepare** a protective change: freeze, sync, resume, or lower one setting. It holds no key. Every proposal is checked in code against the chain (it can never raise anything), the owner signs it in their own wallet, and the contract decides. `KIBBLE_ASSISTANT=nvidia|claude` switches the model on, with per-visitor and daily limits; unset, it gives built-in answers with no model. It's tested with Nemotron 3 Ultra; Claude hasn't been run.

## Connect your own agent

```bash
pnpm kibble new --name "My agent" --loss 2   # test keys, vault, drawer, first allowance
pnpm kibble try                              # one sale, one purchase, one refused payment
```

Keys go to `~/.kibble`, never into the repo. Guide: [docs/connect-your-agent.md](docs/connect-your-agent.md). The app's **Connect** page does the same from a wallet, and **Agents** lists every drawer the factory has made.

## Demo scenarios

`pnpm --filter @kibble/agents scenario <name>`:

| Scenario | What it shows |
|---|---|
| `timelapse [windows]` | 30 windows of rising demand through fixed A′ (flat limit 0.5) and Kibble A, with the same traffic on both. Fixed turns customers away at peak; Kibble's T grows and profit fills the vault; exposure stays at the allowance |
| `bad-strategy` | B's supplier price jumps to 0.13 against a 0.10 sale price. Fixed B′ keeps paying and raises alerts; Kibble B goes Watch → Braked → Paused on its own |
| `hijack` | A poisoned page asks the model to pay an attacker (refused on both sides), the attacker probes the stranger budget, then overbuys from the real supplier. Fixed pays out its limit every window; Kibble refuses and pauses, and `maxLossNow` drops to 0 |
| `ai` | A real AI agent works five customer jobs through drawer A: one is priced below cost, one page carries a hidden instruction |
| `work [reports]` | Research agent W sells nothing. Each report a client accepts releases 3 from the owner's work budget; T grows from accepted work alone and stops when reports aren't accepted. The first report runs on a runway grant |
| `controls` | Owner approval above the threshold, signature replay refused, guardian freeze, two-key instant resume |

Results from a full run are in [EVIDENCE.md](EVIDENCE.md).

## The web app

```bash
pnpm --filter web dev            # http://localhost:3000, reads Aevum testnet
```

- **Dashboard** (`/`): the scoreboard for all five drawers (state, T, value, spend, profit, hijack exposure, receipts), the fixed and Kibble agents side by side, and the window-by-window time-lapse from `TrackRecord` events.
- **Drawer page** (`/drawer/<address>`): every number in `snapshot()`, the settings, the last receipts, the track record, and a feed of refusals, state changes and alerts. This is also the public "verify" page for an agent's record. With the owner's or guardian's wallet connected: sync, freeze, revoke, tighten, queue a raise and execute or cancel it, fund the allowance, grant a runway, and sign and submit a two-key `resumeNow`.
- **Playground** (`/playground`): three no-wallet buttons (sales rush, bad strategy, hijack) that the server runs with the demo keys. Off unless `KIBBLE_PLAYGROUND=on`; one run at a time, with a cooldown, a per-IP daily limit and a global daily limit. Paused drawers are reset with an owner + guardian `resumeNow` before each run. Run state is kept in the server process, so host it with `next start`, not serverless functions. Settings are in [`web/.env.example`](web/.env.example).

`NEXT_PUBLIC_NETWORKS=aevum,fork` adds a network switcher; on a local chain the app reads `deployments/<chainId>.json` from the repo. The design is still the starter kit's: styling comes next.

## Contract API

```solidity
// agent (the key holds no tokens)
function pay(address payee, uint256 amount, bytes32 billRef) external returns (bool);
function payWithApproval(address payee, uint256 amount, bytes32 billRef, uint256 deadline, bytes ownerSig) external returns (bool);
function refund(bytes32 billRef) external;                     // from uncleared income; doesn't use U
// buyers, requesters, anyone
function buy(bytes32 billRef, uint256 amount) external;        // after approve()
function buyWithAuthorization(bytes32 billRef, address from, uint256 amount, uint256 validAfter,
                              uint256 validBefore, uint8 v, bytes32 r, bytes32 s) external; // EIP-3009, nonce = saleNonce(billRef)
function ackDelivery(bytes32 billRef) external;                // buyer only: clears income at once
function creditWork(bytes32 jobId, uint256 value, uint256 deadline, bytes sig) external returns (uint256);
function sync() external;
// owner / guardian (KibbleAdmin, same address)
function fundAllowance(uint256) external;  function fundWorkBudget(uint256) external;  function reclaimWorkBudget(uint256) external;
function grantRunway(uint256 amount, uint64 until) external;
function freeze() external;  function revoke() external;
function tighten(Param p, uint256 value) external;             // instant, only lower
function tightenSupplier(address, uint128, uint128) external;  function removeSupplier(address) external;  function removeAcceptor(address) external;
function queue(Action a, bytes data) external returns (bytes32); function execute(bytes32) external;  function cancel(bytes32) external;
function resumeNow(uint256 deadline, bytes ownerSig, bytes guardianSig) external;
// views
function snapshot() external view returns (Snapshot memory);  function maxLossNow() external view returns (uint256);
function skimBps() external view returns (uint256);  function ceilingRoom() external view returns (uint256);
function receipt(uint256 id) external view returns (ReceiptData memory);  function usedFingerprint(bytes32) external view returns (bool);
```

EIP-712 domain: `name "Kibble Drawer"`, `version "1"`, the drawer's address. Types: `PayApproval(address payee,uint256 amount,bytes32 billRef,uint256 deadline,uint256 nonce)`, `WorkAccepted(bytes32 jobId,uint256 value,uint256 deadline)`, `Resume(uint256 nonce,uint256 deadline)`.

Events: `Paid`, `Refused(fp, reason, …)`, `ReceiptIssued`, `StateChanged(from, to, why)`, `Strike`, `WindowClosed`, `TrackRecord(index, value, spend, profit, T, state, strikes)`, `LearningDone`, `Alert` (fixed mode), `Swept`, `IncomePending`, `IncomeCleared`, `Refunded`, `WorkCredited`, `RunwayGranted`, `UnexplainedOutflow`, and the queue and settings events.

**SDK rule for pay-once** (`payOnce` in `@kibble/sdk`): on a timeout, read `usedFingerprint(fp)`. If it's paid, confirm; otherwise resubmit the same `billRef`. A duplicate is refused, never paid twice.

**Gas** (Foundry gas report, local): `pay` with sync and a stored receipt costs about 190–235k (median 234k); `buy` about 180k; `ackDelivery` about 135k; `creditWork` about 150k. At Aevum's ~1 gwei that is about 0.0002 tQDAY per payment.

### Deployments

Aevum testnet (chain 44005), deployed 25 Nov 2026, contracts as of commit `4ddaae6` (block 4,107,399). The deployed code matches this build byte for byte, apart from immutables:

| Contract | Address |
|---|---|
| `KibbleFactory` | [`0x296a2e00c0b934dfea4384572972cd4e46322afe`](https://explorer-test.qday.info/address/0x296a2e00c0b934dfea4384572972cd4e46322afe) |
| `KibbleDrawer` (clone implementation) | [`0x6cfeb32ca3a3b76b303ba07ff003b9f0b8f978b4`](https://explorer-test.qday.info/address/0x6cfeb32ca3a3b76b303ba07ff003b9f0b8f978b4) |
| `KibbleAdmin` | [`0xa3329c3f6f909609559c5494137edc0ffe9bed4f`](https://explorer-test.qday.info/address/0xa3329c3f6f909609559c5494137edc0ffe9bed4f) |
| Demo owner vault | [`0x3a74A0D0847d3247B20f6782197c71B620ab0a72`](https://explorer-test.qday.info/address/0x3a74A0D0847d3247B20f6782197c71B620ab0a72) |
| tUSD8 | [`0x456569838f1d43009A91ebA4263147Afd7233483`](https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483) |

The current demo drawers and roles are in [`deployments/44005.json`](deployments/44005.json); the first version (22 Nov, before the refund-loophole fix, now revoked) is in [`docs/runs/testnet-v1-deployment-2026-11-22.json`](docs/runs/testnet-v1-deployment-2026-11-22.json). Explorer verification on Aevum doesn't work yet, so the source is this repository at the commit above. On a local fork, `pnpm --filter @kibble/agents setup-demo` deploys a fresh set each time.

## Platform findings (Aevum)

Checked on chain on 22 Nov 2026:

- **tUSD8 now supports EIP-2612 `permit` and EIP-3009** (`nonces`, `authorizationState`; EIP-712 domain `"tUSD8"`, version `"2"`). Our 15 Nov check found neither. Kibble uses `receiveWithAuthorization` for gasless buying, with the nonce bound to the bill so a relayer can't reuse a signature.
- **No supported bundler or paymaster.** The organizers say account abstraction is "not required and not supported". The agent uses a plain key with the agent role; the drawer enforces every rule, and the key holds no tokens.
- **No ERC-8004 registry** is open for this challenge. The track record is the `TrackRecord` event emitted at every window close.
- **Shanghai EVM**: compiled with `evm_version = shanghai`; `tools/check-shanghai.mjs` checks the bytecode.
- **1,000-block `eth_getLogs` limit** and **no WebSocket RPC**: read with `getLogsChunked` and poll over HTTPS.
- **Explorer verification is down**: addresses and commit go in this README.
- A local fork reports a gas price around 2,000 gwei (Aevum itself is about 1 gwei), so local demo wallets get large test balances.

## Known limits

- **Refunds after spending need the owner.** If an agent has bought the input for a sale and then can't deliver, its key may not be able to refund that sale; the owner always can, before it clears.
- **The skim.** An attacker who spends at exactly the agent's normal cost share can take at most (costBps − real cost share) × value per window. The learned share and `skimBps()` make it visible; nothing stops it on chain.
- **Approved suppliers and acceptors are trust decisions**, each bounded only by its own caps. An approved payee must be an end recipient: approving a forwarding contract breaks the stranger bound.
- **Only on-chain tUSD8 income counts.** Off-chain revenue would need a signed processor attestation (roadmap).
- **Income on fulfilment** delays when a sale counts, so a fast-growing agent grows T a hold later.
- **Learning assumes the first windows are honest.** A hijack during learning is bounded by Tstart and the stranger budget.
- **The drawdown high-water mark resets once per period** (7 days by default) rather than rolling continuously.
- **Revoke sends uncleared sales to the vault**; refunding those buyers is then up to the owner.
- **Gas** is paid by the agent key (or a relayer) and isn't in the profit and loss.
- **Testnet amounts are a tenth of the design's.** One faucet claim is 5 tUSD8, so on Aevum the demo uses 0.1-scale amounts (L = 2) and 2-minute windows. The logic and the ratios are the same.
- **The playground keeps its limits in memory** and holds the demo keys on the server. Testnet keys only.
- **Not audited.** Testnet only.

## Roadmap

- Agent credit history from `TrackRecord` events, posted to ERC-8004 reputation when a registry opens.
- Signed processor attestations for off-chain revenue.
- Many agents per owner with one total loss budget.
- ML-DSA guardian for the vault once QDay's precompile ships.
- Alerts (Telegram, email) on state changes.

## Credits and license

Based on [Aevum Starter Kit](https://github.com/qday-io/aevum-starter-kit) (MIT, PQA Labs). Third-party licenses are in [NOTICE.md](NOTICE.md). Aevum network notes from the kit are in [docs/starter-kit.md](docs/starter-kit.md).

MIT. See [LICENSE](LICENSE).
