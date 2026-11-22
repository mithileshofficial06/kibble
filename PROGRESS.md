# Progress

## Current state (22 Nov 2026, day 7 of 26)

Done, committed and pushed:
- **Contracts** (all v5.1 must-ship and should-ship items): drawer in both modes, vault, factory, earned T, cost ceiling, strikes with cooldown, brake ladder, rolling drawdown, learning period + `maxWeeklyLoss`, work credits (V1), `maxLossNow` (V3), income on fulfilment + refunds (V4), runway grants (V5), `TrackRecord` events (V6), approval, receipts, pay-once, freeze/revoke, tighten/queue/cancel, two-key `resumeNow`, gasless EIP-3009 buying.
- **Tests:** 97 Kibble tests (unit, 10 invariants over 128k calls, fuzz, hijack, 3 fork tests on real tUSD8). All green.
- **SDK** (`@kibble/sdk`) and **agents**: setup, sale loop with supplier verification, five scenarios, injection page with a Claude summarizer.
- **Docs:** README (judges box, API, platform findings, limits), EVIDENCE.md.

Not done:
- **Aevum testnet deployment.** All seven demo wallets have 0 tQDAY and 0 tUSD8. Needs the Discord faucet (1 tQDAY + 5 tUSD8 per address) and/or the web faucet. The owner needs about 60 tUSD8 and the buyer about 20 for the full demo.
- **UI** (`web/` still shows the kit's checkout). Waiting for the user's direction.
- Demo video, outside test agents, DoraHacks submission.

## Next steps
1. Fund the wallets, then `RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents setup-demo`, run the scenarios on testnet, and put the addresses and tx hashes in README + EVIDENCE.md (commit `deployments/44005.json`).
2. Dashboard (split screen, time-lapse, scoreboard, receipts, controls) once the user gives the UI direction.
3. Public playground relayer with limits (report section 13.3).
4. Record the video; dry run from a logged-out browser; submit by 10 Dec.
