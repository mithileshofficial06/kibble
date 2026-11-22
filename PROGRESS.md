# Progress

## Current state (22 Nov 2026, day 7 of 26)

Done, committed and pushed:
- **Contracts** (all v5.1 must-ship and should-ship items): drawer in both modes, vault, factory, earned T, cost ceiling, strikes with cooldown, brake ladder, rolling drawdown, learning period + `maxWeeklyLoss`, work credits (V1), `maxLossNow` (V3), income on fulfilment + refunds (V4), runway grants (V5), `TrackRecord` events (V6), approval, receipts, pay-once, freeze/revoke, tighten/queue/cancel, two-key `resumeNow`, gasless EIP-3009 buying.
- **Tests:** 97 Kibble tests (unit, 10 invariants over 128k calls, fuzz, hijack, 3 fork tests on real tUSD8), plus the kit's 8. All green.
- **Aevum testnet:** deployed (factory `0xea5993b2…06d2`, block 3,847,745). One Discord faucet claim (1 tQDAY + 5 tUSD8) funds everything at 0.1 scale. Run 1 (20 s windows) is logged; it showed windows must be longer on a real chain. Run 2 uses 2-minute windows.
- **SDK** (`@kibble/sdk`) and **agents** (`@kibble/agents`): setup with testnet share-out and `--fresh` reclaim, five scenarios, playground beats, injection page with a Claude summarizer.
- **Web app** (functional, kit styling): dashboard with scoreboard, split screen and time-lapse; drawer pages with receipts, track record, event feed and owner/guardian controls; playground with server-side limits; How it works page. Builds clean on Next.js 16.4.5.
- **Docs:** README (judges box, deployments, web app, platform findings, limits), EVIDENCE.md (feature → test, fork run, testnet runs).

Not done:
- **UI styling**: waiting for the user's direction. Pages use the kit's CSS classes only.
- **Hosting** the web app (needs a long-running server for the playground) and the demo video.
- The injection beat with a real model needs `ANTHROPIC_API_KEY` (uses the user's API credits). So far the scripted model ran.
- Outside test agents; DoraHacks submission.

## Next steps
1. Styling pass on the web app once the user says how it should look.
2. Host the app (`next start` on a small server; `KIBBLE_PLAYGROUND=on` with the demo keys) and do a logged-out dry run.
3. Optional: a run with `ANTHROPIC_API_KEY` for the real-model injection beat.
4. Record the video; submit by 10 Dec.

## Testnet notes
- Gas per full run: ~0.05 tQDAY (agent A), ~0.07 (buyer), ~0.03 (agent B). Another faucet claim (a different Discord account) adds more if needed.
- After `setup-demo --fresh`, rebuild the web app: it imports `deployments/44005.json` at build time.
