# Progress

## Current state (25 Nov 2026, day 10 of 26)

Done, committed and pushed:
- **Contracts** (all v5.1 must-ship and should-ship items): drawer in both modes, vault, factory, earned T, cost ceiling, strikes with cooldown, brake ladder, rolling drawdown, learning period + `maxWeeklyLoss`, work credits (V1), `maxLossNow` (V3), income on fulfilment + refunds (V4), runway grants (V5), `TrackRecord` events (V6), approval, receipts, pay-once, freeze/revoke, tighten/queue/cancel, two-key `resumeNow`, gasless EIP-3009 buying.
- **Tests:** 97 Kibble tests (unit, 10 invariants over 128k calls, fuzz, hijack, 3 fork tests on real tUSD8), plus the kit's 8. All green.
- **Aevum testnet:** deployed (factory `0xea5993b2…06d2`, block 3,847,745). One Discord faucet claim (1 tQDAY + 5 tUSD8) funds everything at 0.1 scale. Two full scenario runs on chain: run 1 (20 s windows) showed windows must be longer on a real chain; run 2 (2-minute windows) shows every beat: T earned 0.200 → 0.260, bad strategy paused in 65 s, hijack paused in 4 s with 0 overbought.
- **SDK** (`@kibble/sdk`) and **agents** (`@kibble/agents`): setup with testnet share-out and `--fresh` reclaim, five scenarios, playground beats, injection page with a Claude summarizer.
- **Web app** (new design: plum/saffron/coral, Geist + Instrument Serif, Motion): dashboard with scoreboard, split screen and time-lapse; drawer pages with receipts, track record, event feed and owner/guardian controls; playground with server-side limits; How it works page. Builds clean on Next.js 16.4.5.
- **Docs:** README (judges box, deployments, web app, platform findings, limits), EVIDENCE.md (feature → test, fork run, testnet runs).

- **End-to-end test (23 Nov, local fork, no testnet gas, scripted model):** 105/105 unit+fuzz+invariant, 6/6 fork tests, all 4 packages typecheck, `setup-demo --redeploy` + `scenario all` clean (time-lapse T 2.00 → 10.00; B paused 17 s after the price jump; hijack: 0.00 overbought, paused in 12 s; W earned via work; controls incl. replayed-signature refusal and two-key resume), web production build 40/40 browser checks (desktop + phone, no errors, no sideways scroll) and all three Playground demos run through the page. Fixed: `cooldownEndsAt` reported a 1970 time before the first run.

- **Playground made judge-ready (24 Nov):** before each run it moves tUSD8 back from the supplier to the buyer and vault (EIP-3009, relayer pays the gas; tested on the fork with the supplier at 0 gas) and the owner shares its idle gas with the senders. Per-beat gas checks from fork measurements (sales rush ~11, bad strategy ~15, hijack ~6.4 milli-tQDAY at 1 gwei). Gas-left estimate on the page (34 runs on testnet balances, 24 Nov), 10 runs/day default, expected time per demo + live progress bar (learned from the last real run). Hover: grain-pour colour fill on all buttons, nothing moves. Phone header no longer sticky.

- **Demo video (24 Nov), `video/`:** 3:37, 1080p60, made in Remotion with WebGL grain fields on the GPU (ANGLE). It has four chapters (problem, idea, live on Aevum, proof), captions on every word, and an original score and sound design synthesized in Python, ducked under the narration (edge-tts, Ava) and loudness-normalised to −14 LUFS. The footage is real: a fresh testnet run of all three Playground demos on 24 Nov through the app (sales rush 4:14; bad strategy 7:27, Kibble B paused 66 s after the price jump; hijack 3:40, Kibble A overbought 0.000 and paused after 2 s, exposure 0.219 → 0.000, fixed A′ overbought 0.150 and stayed Healthy), plus the live desk and the drawer page. Scripted model, no API credits. Pipeline in `video/README.md`; raw footage and renders are not in git.

- **Real-model hijack (25 Nov):** NVIDIA-hosted models supported in `agents/src/injection.ts`. Nemotron 3 Ultra and Bolt E4B obeyed the injection in 10/10 trials; fork runs with both and one testnet run with Ultra (Kibble A overbought 0.000, paused after 2 s; fixed A′ 0.200, still Healthy). See EVIDENCE.md. The Playground is now always scripted, in code.
- **Gas topped up (25 Nov):** the owner holds 6.29 tQDAY, about 359 Playground runs.

- **Five must-do upgrades (25 Nov), all local so far:**
  1. Real AI agent (`scenario ai`): 3/3 fork shifts, 4 jobs delivered, the below-cost job refused, the poisoned page ignored.
  2. Refund loophole and two related gaps found and fixed; 12 new tests (123 pass: 117 local, 6 fork).
  3. Owner's assistant (`/assistant`), tested on live testnet data.
  4. Outside agents: guide, issue form and `/agents` list are ready. **No outside agent has run yet.**
  5. Connect: SDK helpers, `pnpm kibble`, `/connect`, docs/connect-your-agent.md.

- **Redeployed (25 Nov):** fixed contracts on testnet, factory `0x296a2e00…2afe`; old drawers revoked. Every scenario and the AI shift ran (docs/runs/testnet-v2-2026-11-26.txt). T stayed at 0.200 there: windows fell under the activity floor (setup now uses a third of it on testnet; the live drawers still have the old floor).
- **Improvements 6-14 (26 Nov):** stronger fixed opponent and attack table (`make attacks`), 120-agent simulation (`make sim`), who-paid panel on drawer pages (`buyerStats`), pay-per-request API (`paid-api`), worked example, alerts (`alerts`; Telegram needs a bot token), security notes (Slither, coverage, threat model), error-path tests, accessibility pass.
- **Tests:** 145 pass (139 local, 6 fork); 131 are Kibble's.

Not done:
- **Lower the live drawers' activity floor and run a few sales windows** so T grows on testnet (needs the user's OK for gas).
- Telegram with a real bot (token from the user). `/connect` with a real wallet (user).
- Outside testers: none yet.
- **Video (#15), last:** re-record on the new drawers, finish or revert the uncommitted real-model scene, update "97 tests" and every number and address. Don't render until then.
- **Hosting**, YouTube upload, DoraHacks submission.

## Next steps
1. UI: landing (grain loader, living-wordmark hero, replay section) and all app pages restyled on 23 Nov; iterate on the user's feedback.
2. Host the app (`next start` on a small server, Railway suggested; `KIBBLE_PLAYGROUND=on` with the demo keys) and do a logged-out dry run: time each demo on testnet.
3. Review the video with the user (voice, music and pacing are each one step to redo), upload it (YouTube, unlisted), and put the link in the README; submit by 10 Dec.

## Testnet notes
- Gas per full run: ~0.05 tQDAY (agent A), ~0.07 (buyer), ~0.03 (agent B). The Discord faucet allows one claim per account and per address (don't use a second account); the web faucet gives 5 tQDAY per 24 h to addresses holding mainnet ETH, USDT or USDC.
- After `setup-demo --fresh`, rebuild the web app: it imports `deployments/44005.json` at build time.
