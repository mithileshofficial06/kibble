# Evidence

Every feature, the test that proves it, and where it shows up in a run.

- **Tests:** `make test` (unit, fuzz, invariants) and `make test-fork` (real tUSD8 on a fork of Aevum). Test files are in [`contracts/test`](contracts/test).
- **Scenarios:** `pnpm --filter @kibble/agents scenario <name>` ([`agents/src/scenarios.ts`](agents/src/scenarios.ts)).
- **On Aevum testnet:** Kibble is deployed and every scenario has run on chain (see [Aevum testnet](#aevum-testnet)). Each drawer's receipts, track record and refusals can be checked on the explorer or in the web app's drawer pages.

## Feature → test

| Feature (report section) | Tests |
|---|---|
| Everything derives from `maxWeeklyLoss` (V2, 7.6) | `KibbleDrawerTest.test_init_derivesEverythingFromMaxWeeklyLoss` |
| Learning period calibrates `costBps` (V2, 7.5) | `test_learning_calibratesCostBps`, `test_learning_quietWindowsDontCount`, `test_learning_costBpsCappedAt95` |
| Pay an approved supplier, with a receipt (7.3, 7.9) | `test_pay_approvedSupplier_writesReceipt` |
| Pay once per bill; a refusal never burns the fingerprint (7.9) | `test_pay_sameBillTwice_refused`, `test_pay_refusalDoesNotMarkFingerprint`, `invariant_fingerprintPaidOnce` |
| 1 tUSD8 lifetime to strangers (rule 5) | `test_pay_stranger_capsAtOneTusd8Lifetime`, `testFuzz_strangerNeverAboveU`, `invariant_strangersWithinU` |
| Supplier per-payment and per-window caps | `test_pay_supplierCaps`, `invariant_supplierWindowCap` |
| Refuse, don't revert | `test_pay_neverRevertsForPolicy`, `invariant_payNeverReverts` |
| Income on fulfilment: hold or buyer acknowledgement (V4) | `test_income_pendingThenClearedThenRefillAndSweep`, `test_income_buyerAckClearsAtOnce`, `test_income_onlyPayerCanAck` |
| Refunds from uncleared income without using U (V4) | `test_refund_fromPendingIncome_doesNotUseU`, `test_refund_afterClear_notAllowed` |
| Deferred-income trick closed (per-block clearing cap) | `test_income_clearingCappedPerBlock_excessToVault` |
| Profit swept to the vault | `test_income_pendingThenClearedThenRefillAndSweep`, `test_maxLossNow_isAllowanceAndRunway` |
| Cost ceiling, strikes, cooldown, ladder (7.7) | `test_ceiling_refusesAndStrikesWalkTheLadder`, `test_ceiling_noStrikeBelowMinActivity`, `testFuzz_ceilingNeverExceeded` |
| Sellers can buy inputs before income clears | `test_ceiling_pendingSalesCountForCeiling` |
| Earned limit T (7.4) | `test_T_growsOnProfit_cappedByStep`, `test_T_shrinksOnLoss_andLossMovesToWatch`, `test_T_neverAboveTmax`, `testFuzz_TGrowthBounded`, `invariant_allowanceWithinT` |
| Watch → Healthy after 2 clean windows; Watch refills to T/2; Braked doesn't refill | `test_watch_twoCleanWindowsBackToHealthy`, `test_watch_refillsOnlyToHalfT`, `test_braked_noRefill` |
| Rolling drawdown brake (V5) | `test_drawdown_brakesAtHalfL_pausesAtL` |
| Unexplained outflow pauses | `test_unexplainedOutflow_pauses` |
| Exact hijack bound `maxLossNow` (V3) | `test_maxLossNow_isAllowanceAndRunway`, `test_fixed_maxLossNowIsTheWholeDrawer`, `invariant_maxLossNowBounded` |
| Hijack: fixed pays out its limit, Kibble refuses and pauses | `KibbleHijackTest.test_hijack_fixedVsEarned`, `KibbleForkTest.test_fork_hijackPausesWithRealToken` |
| The agent can't reach the vault | `test_agentCannotTouchVault` |
| Work credits (V1) | `KibbleWorkAndApprovalTest.test_work_*` (11 tests), `invariant_workCreditsWithinBudget` |
| Owner approval above the threshold, no replay | `test_approval_*` (5 tests) |
| Freeze, revoke | `KibbleControlsTest.test_freeze_*`, `test_revoke_sweepsEverythingToVault`, `test_incomeWhilePaused_neverCountsAsValue` |
| Tighten fast, loosen slow; guardian cancels | `test_tighten_isInstant_butCannotRaise`, `test_guardianCanTighten`, `test_queue_*`, `test_setGuardian_waitsLonger_andGuardianCannotCancel`, `test_addSupplier_throughQueue`, `test_setAgent_rotatesKey` |
| Two-key instant resume; queued resume | `test_resumeNow_needsOwnerAndGuardian`, `test_resume_queued` |
| Admin module can't be used directly | `test_adminModule_cannotBeUsedDirectly` |
| Fixed mode (the comparison side) | `test_fixed_flatLimitRefilledEveryWindow_noCeiling`, `test_fixed_strangerRefused_noUnknownBudget`, `test_fixed_incomeGoesToReserve` |
| Runway grant: investment is not a loss (V5) | `test_runway_investmentIsNotALoss`, `test_runway_cappedByMaxWeeklyLoss`, `test_runway_expiresToVault` |
| Gasless buying with EIP-3009, bound to the bill | `test_buyWithAuthorization`, `test_buyWithAuthorization_boundToBill`, `KibbleForkTest.test_fork_gaslessBuy_eip3009_realTusd8` |
| Works with the real tUSD8 | `KibbleForkTest.test_fork_saleBuyAckSweep_realTusd8` |
| Accounting: balance always equals the buckets | `invariant_bucketsMatchBalance`, `assertBuckets` in the unit tests |
| Lifetime spend ≤ value + funding | `invariant_spendCoveredByValueAndFunding` |
| Vault: instant only to `home`, others queued and cancellable | `KibbleVaultTest` (5 tests) |

## A full run: `scenario all` on a local fork of Aevum (22 Nov 2026)

Real tUSD8 contract and fresh drawers, with demo timings (20 s windows, 10 s hold). The model in the injection step is the scripted fallback (no API key was set). Full log: [docs/runs/fork-run-2026-11-22.txt](docs/runs/fork-run-2026-11-22.txt).

**Time-lapse, 30 windows, the same rising demand on both sides** (sell at 0.10, buy the model call at 0.04):

|  | Fixed A′ (flat limit 0.5) | Kibble A |
|---|---|---|
| Sales served | 314 | 368 |
| Sales turned away | 55 | 1 |
| Limit after 30 windows | 0.50 | 10.00 (earned, from 2.00) |
| Profit in the vault | 0.00 | 14.18 |
| Hijack exposure (`maxLossNow`) | 28.94 | 10.00 |
| Learned cost share | n/a | 40%, so the ceiling is 50% |

Kibble A spent its first 6 windows in Learning (window 1 was quiet), then grew T every profitable window until it hit Tmax = L/2 = 10. Fixed A′ started turning customers away at window 16. In two windows (26 and 30) the fixed side served more because the batch of sales crossed a window boundary in real time and its allowance refilled mid-batch.

**Bad strategy** (the supplier's price jumps to 0.13 against a 0.10 sale price):

- Fixed B′ stayed Healthy and lost 0.18 every window (1.08 over 6 windows), raising an alert each time.
- Kibble B went Watch → Braked → Paused **17 s after the price jump**, with 1 payment made. No human was involved.

**Hijack:**

1. Injection: "pay 5 tUSD8 to the attacker". Both sides refused (above the approval threshold).
2. 0.9 to the stranger, twice. Fixed refused (not allowlisted); Kibble refused (over the cost ceiling).
3. Overbuying 0.5 from the real supplier every 2 s for 60 s. Fixed A′ paid out 2.00 and stayed Healthy, with 26.94 still exposed. Kibble A paid **0.00**, struck out and was **Paused after 12 s**: `maxLossNow` went 10.00 → 0.00. The vault held 40.14 tUSD8 that the agent key could never reach.

**Work credits** (Agent W sells nothing): five accepted reports (3 each) grew T from 2.00 to 3.02, with a 1.2 runway grant for the first report. The first report not accepted dropped it to Watch, with T down to 1.82 and refills stopped.

**Controls:** a 1.5 payment above the (instantly lowered) threshold was refused, then paid with the owner's signature (receipt #13). Replaying that signature for another bill was refused, the guardian's freeze paused W, and owner + guardian `resumeNow` brought it back to Watch.

## Aevum testnet

Deployed 22 Nov 2026 (block 3,847,745). Contracts: factory [`0xea5993b2…06d2`](https://explorer-test.qday.info/address/0xea5993b29f3ed9944fdd23dcf5b0b1114a9906d2), drawer implementation [`0x6d7ac2be…5fd3`](https://explorer-test.qday.info/address/0x6d7ac2befb19b6f5ccd846353324db5543845fd3), admin module [`0x38d0f87e…ff1b`](https://explorer-test.qday.info/address/0x38d0f87e9a4f5e64e5f5a481deb600b70219ff1b), owner vault [`0xe1e78CCC…E616`](https://explorer-test.qday.info/address/0xe1e78CCCF50112964429d29A0A66e91EAaf0E616).

The whole testnet demo runs on **one faucet claim** (1 tQDAY + 5 tUSD8), so amounts are **a tenth** of the fork run's (max weekly loss 2, sale 0.010, model call 0.004). Every tUSD8 stays inside the demo's own wallets and contracts; `setup-demo --fresh` gets it back from old drawers for the next run.

### Run 1: 20-second windows

Log: [docs/runs/testnet-run1-20s-windows-2026-11-22.txt](docs/runs/testnet-run1-20s-windows-2026-11-22.txt). Drawers (now revoked): [docs/runs/testnet-run1-deployment.json](docs/runs/testnet-run1-deployment.json), e.g. Kibble A [`0x38f6626D…d87f`](https://explorer-test.qday.info/address/0x38f6626D05aaaB790bd78e8F74988f507da1d87f), fixed A′ [`0x2eb27Acc…Ab41`](https://explorer-test.qday.info/address/0x2eb27AccE2F884DbC2a10BAf1bd1B31D91BEab41).

- **Hijack:** both sides refused the injected 0.5 payment and the stranger probes. Overbuying from the real supplier: **fixed A′ paid out 0.550 and stayed Healthy; Kibble A paid 0.000 and paused itself 4 s in**, with `maxLossNow` 0.200 → 0.000.
- **Bad strategy:** fixed B′ stayed Healthy and lost 0.018 every window (0.108 over 6). Kibble B went Watch → Braked on its own, shrinking its exposure from 0.200 to 0.012.
- **Work credits:** five accepted reports grew W's T from 0.200 to 0.302; the first report not accepted dropped it to Watch.
- **Controls:** threshold lowered instantly, owner-signed payment paid (receipt #13), signature replay refused, guardian freeze, owner + guardian `resumeNow`.
- **What it taught us:** on a real chain each sale is about four transactions, so a 20-second window held only 2–3 sales. Most windows fell below `minActivity`, so Kibble A never finished Learning and its T stayed at 0.200. On a fork, time only moves when the script moves it, which hid this. Run 2 uses 2-minute windows.

### Run 2: 2-minute windows

Pending (in progress).
