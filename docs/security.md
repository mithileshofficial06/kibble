# Security notes and threat model

Testnet only. **Not audited by anyone outside the project.** Everything here can be re-run from the repo.

## What Kibble protects, and from whom

| We assume | So that |
|---|---|
| The agent key can be stolen, and the model can be talked into anything | The key holds no money and can only *ask*; the drawer decides |
| The owner and the guardian are two different, safe keys | Loosening waits and can be cancelled; resuming needs both |
| Approved suppliers and acceptors are chosen by the owner | Each has its own caps, but a bad one can take what those caps allow |
| tUSD8 behaves like a normal ERC-20 with EIP-3009 | No fee on transfer, no hooks. Its issuer can freeze or upgrade it; Kibble can't protect against that |
| Validators may nudge timestamps by seconds | Windows and holds are minutes to days |

| Attacker | What stops them | What they can still do |
|---|---|---|
| Stolen agent key, loud | Cost ceiling, strikes, pause | Refused; at most `maxLossNow` |
| Stolen agent key, quiet | Allowance, drawdown brake, [alerts](alerts.md) | Drip the slack; use the stranger budget; skim the gap to the ceiling ([measured](attacks.md)) |
| Prompt injection | The same limits: the prompt isn't trusted | Whatever the agent key can do |
| Key thief with money of their own | One sale backs its spend once; no refund of a sale that backs spending | Lose their own money |
| Bad approved supplier | Per-payment and per-window caps, ceiling | Overcharge up to those caps |
| Dishonest agent owner | — | **Buy from their own agent** to look busy. The drawer page shows who paid, but one person can use many wallets |
| Agent that takes orders and vanishes | Income hold; the owner can refund before it clears | Customers depend on the owner until then |
| Stolen owner key | Guardian can freeze, revoke, and cancel queued changes; withdrawals elsewhere wait | Withdraw to `home`; tighten; approve payments from the allowance |
| Stolen owner **and** guardian keys | Nothing | Everything |
| The web assistant or its model | Holds no key; proposals are checked in code and signed by the owner | Give wrong explanations |
| The Playground | Scripted model, daily limits, test wallets | Use up the demo's test gas |

## Automated checks

**Tests:** 181 in total. 175 run locally (unit, fuzz, attack and 10 invariants over 128,000 calls) and 6 on a fork of Aevum with the real tUSD8; see the count in [EVIDENCE.md](../EVIDENCE.md).

**Coverage** (`forge coverage`, without the invariant, attack, fork and benchmark suites, so a floor):

| Contract | Lines | Branches |
|---|---|---|
| KibbleFactory | 100% | 100% |
| KibbleVault | 100% | 89% |
| KibbleCore | 100% | 95% |
| KibbleAdmin | 100% | 100% |
| KibbleDrawer | 100% | 100% |

KibbleAdmin was the weak spot (46% of branches); [`KibbleAdmin.t.sol`](../contracts/test/KibbleAdmin.t.sol) now covers every owner and guardian path: each setting's bounds, the queue, and every bad signature on the two-key resume. [`KibbleEdges.t.sol`](../contracts/test/KibbleEdges.t.sol) covers the rare states: unexplained outflows, income while paused, rolling drawdown, bad set-ups.

**Slither 0.11.6** (`slither . --filter-paths "lib|test|mocks|Checkout" --exclude-informational --exclude-optimization`): 44 results, and none that we consider exploitable. We went through every high and medium one:

| Finding | Why it stands |
|---|---|
| 11 × high, uninitialized state | False positive: the drawer is a clone, so state is set in `initialize` (guarded, and locked on the implementation; tested in `KibbleErrorsTest`). Slither looks at `KibbleCore` and `KibbleAdmin` on their own |
| 1 × medium, reentrancy in `buyWithAuthorization` | The only external call is to tUSD8, fixed by the factory, which has no hooks. The bill is recorded right after it; payments update state before they transfer |
| 4 × medium, unused return | The third value of `ECDSA.tryRecover` (error detail). The error code itself is checked |
| 4 × medium, strict equality | Counters and zero checks, not balances |
| 2 × medium, divide before multiply | Intended: whole windows, and rounding down in the owner's favour |
| 1 × medium, write after write | Intended: what's left of `_unplaced` is swept, then cleared |
| 1 × medium, uninitialized local | A loop counter that starts at 0 |
| 20 × low | Timestamps (windows and deadlines), event order, one zero check |

## Found by us and fixed

- **Refund loophole** and two related gaps in the cost ceiling, 25 Nov: [what, how, and the tests](../EVIDENCE.md#the-refund-loophole-found-and-fixed).

## Found by us and not fixed

- **The drip, the stranger budget, the skim, and vanishing with orders** ([numbers](attacks.md)). The first two can be switched off by the owner; the last two need a human.
- **Small attempts aren't strikes.** Below the activity floor, over-ceiling payments are refused but don't pause the agent ([simulation](simulation.md)).
- **One buyer can be many wallets**, so a track record is activity, not proof of customers.
