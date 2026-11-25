# Kibble

Earned spending limit for AI agents: a per-agent "drawer" contract, an owner vault and a brake ladder. Entry for DoraHacks QDay Aevum Builder Challenge #1. **Deadline 11 Dec 2026 08:00 UTC** (aim to submit 10 Dec).

- **Design source of truth:** `D:\Projects\3-Ideas-and-Research\qday-ideas\Kibble_Project_Report.md` (v2.0, design v5.1). Older build spec: `Leash_v5_Spec.md` in the same folder.
- **Repo:** https://github.com/mithileshofficial06/kibble (public, branch `main`).

## Layout
- `contracts/src`: `KibbleCore` (storage + sync/window/ladder), `KibbleDrawer` (agent/buyer/requester functions, clone implementation, delegates unknown selectors to `KibbleAdmin`), `KibbleAdmin` (owner/guardian functions), `KibbleVault`, `KibbleFactory`, `KibbleTypes`. `Checkout.sol` is the starter kit's example, still used by `web/`.
- `contracts/test`: `KibbleBase` fixture; `KibbleDrawer.t`, `KibbleWorkAndApproval.t`, `KibbleControls.t`, `KibbleInvariants.t` (invariants, fuzz, hijack), `KibbleVault.t`, `fork/KibbleFork.t`.
- `packages/kibble` (`@kibble/sdk`): generated ABI (`make abi`), typed data, `connect.ts` (create a drawer, `KibbleAgent`), `payOnce`, `readDrawer`, plain-words reasons.
- `agents/` (`@kibble/agents`): `setup.ts` (deploy + demo drawers; testnet share-out and `--fresh` reclaim), `scenarios.ts`, `run.ts` CLI, `shop.ts` (sale loop), `supplier*.ts`, `llm.ts` (one client for Claude or NVIDIA-hosted models), `injection.ts` (poisoned page, pay tool), `ai-agent.ts` (a real model runs Agent A: `scenario ai`), `assistant.ts` (owner's assistant: reads a drawer, prepares tighten/freeze/resume, never signs), `kibble.ts` (`pnpm kibble new|try|status|freeze|resume`, keys in `~/.kibble`), `playground.ts` (the three public beats).
- `web/`: Next.js app. `/` landing (hero in `src/components/landing`), `/live` dashboard (scoreboard, split screen, time-lapse), `/drawer/[address]` (receipts, track record, feed, owner/guardian controls), `/playground` + `/api/playground` (server relayer with limits), `/tour` (guided tour), `/assistant` + `/api/assistant` (`KIBBLE_ASSISTANT=nvidia|claude`, off by default), `/connect` (create a drawer), `/agents` (every drawer of the factory), `/docs`. Data hooks in `src/lib/kibble.ts`; Aevum's deployment is imported from `deployments/44005.json` at build time (rebuild after `--fresh`). **Design** (the user rejected the "Receipt Desk" hero on 23 Nov as busy, not premium, wrong colours and concept): premium, minimal, editorial asymmetric layout. Plum-black `#100c14`, porcelain `#ede8e3`, saffron `#ffb000` (earned), coral `#ff4d3d` (danger); Geist (thin giant numerals), Instrument Serif italic for one word, Geist Mono labels; Motion (`motion/react`). Tokens in `landing.css` under `.ld-main`. Landing = `Nav` (fixed) + `Intro` (canvas loader + hero: grains fall into the "kibble." wordmark, vault doors open, pointer/ghost "attacker" freezes grains coral, scroll pours them into `[data-pour-target]`) + `Hero` (section 2, the replay, `#replay`). App pages share the same look via `globals.css` tokens (same names as the landing) and `src/components/ui.tsx` (`PageHead` with rail + word-rise `Title` where `*word*` is serif italic, `SecHead` numbered sections, `Reveal` scroll-in, `StatePill`, `Num` odometer, `Atmosphere`); `Footer` on every page.

## Commands
- `make install`, `make build`, `make test` (unit + fuzz + invariants, ~2 min), `make test-fork`, `make abi` (after build).
- Local demo: `make fork` (or `anvil --fork-url https://rpc-test.qday.info --hardfork shanghai --chain-id 440050 --port 8555`), then `pnpm --filter @kibble/agents setup-demo [--fresh|--redeploy]` and `pnpm --filter @kibble/agents scenario <timelapse|bad-strategy|hijack|work|controls|resume X|status|all>`.
- `RPC_URL` picks the network (default: the fork on 8555). `KIBBLE_LLM=off|auto|claude|nvidia` picks the injection model (auto: whichever key is set, Claude first); `KIBBLE_NVIDIA_MODEL` overrides the NVIDIA model. `KIBBLE_SCALE` overrides the demo amount scale (1 locally, 0.1 on testnet; saved in the deployment file).
- Testnet: `RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents setup-demo --fresh` reclaims the old drawers' tUSD8 and makes new ones; `scenario all` takes ~45 min (2-minute windows).
- Web: `pnpm --filter web dev`; `pnpm --filter web build`. Playground needs `KIBBLE_PLAYGROUND=on` and the demo keys on the server (see `web/.env.example`).
- Stories: `packages/kibble/src/story.ts` (events, plain sentences, tallies), `agents/src/story.ts` (a run emits them through `ctx.story`), `web/src/components/story/` (Lane, StoryPlayer, plan) plays them live or recorded. Recordings in `web/src/stories/*.json`: run `KIBBLE_SCALE=0.1 … setup-demo --redeploy` on the fork, then `pnpm --filter @kibble/agents record-story`.
- UI words: plain ones first (cash box, spending limit, “a thief could take”, round); technical names are hints (`web/src/lib/plain.ts`, `Term`). `whyState()` says why an agent is in its state.
- pnpm: `setup` is a built-in pnpm command, so the script is `setup-demo`. The agents package is `@kibble/agents` (plain `agents` collides with a Cloudflare npm package).
- No `@` in NatSpec comments (solc reads it as a tag).
- GNU Make 4.4.1 via winget; the Makefile uses `/bin/bash`, so run it from Git Bash.

## Rules
- **Commits:** authored by the user only. **Never add a `Co-Authored-By: Claude` trailer** or any Claude attribution. Commit and push after each working step.
- No keys in the repo. Demo keys live in `D:\Tools\kibble-wallets\.env` (`KIBBLE_WALLETS` overrides the path).
- Policy refusals return `false` + emit `Refused`; never revert for policy (strikes must persist).
- Contract size: the drawer is ~21 KB and the admin module ~18 KB, under the 24 KB limit. New owner functions go in `KibbleAdmin`; new storage only in `KibbleCore`.
- After a contract change: `make build && make abi`, then `setup-demo --redeploy` on the fork.

## Key decisions
- Uncleared (pending) sales count toward the cost ceiling but never toward T or refills, so a seller can buy its input before the buyer acknowledges.
- One sale backs its spend once: `carriedSpend` (spend resting on uncleared sales carries across windows), `carryRoom` (only unused room carries), and the agent key can't refund a sale its spend rests on; the owner can. Tests: `KibbleCeiling.t.sol`. **The 22 Nov testnet deployment predates this.**
- `maxLossNow` = allowance + active runway (stranger payments come out of the allowance, so U is inside it, not on top).
- FIXED mode uses the same income hold as EARNED (a fair comparison, and refunds work on both sides).
- The per-block clearing cap is keyed on (timestamp, block number).
- Txs are sent with a 2x gas margin (a call can close a window in the block it lands in).
- Injection LLM: NVIDIA-hosted `nvidia/nemotron-3-ultra-550b-a55b` (what we ran; `NVIDIA_API_KEY` in the wallets file) or `claude-opus-5-5` (effort low, server-side refusal fallback `"default"`, never run). The Playground always passes `"scripted"`, so visitors can't spend API keys.
- Signature deadlines use `deadlineIn()` (later of block time and wall time): an idle chain's latest block lags the next one.
- Testnet demo: amounts ×0.1 (one faucet claim = 5 tUSD8), 2-minute windows (each sale is ~4 real txs, so 20 s windows left most windows below `minActivity`).
- Next.js pinned to 16.4.5 (16.4.3 had advisories). Remaining `pnpm audit` items are in the kit's wallet libraries, plus a false match on the `agents` folder name.

## Platform facts (verified 22 Nov 2026)
- tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`, 6 decimals, **supports EIP-2612 permit and EIP-3009** (domain "tUSD8", version "2").
- No supported bundler/paymaster; no ERC-8004 registry; explorer verification broken.
- A local fork reports a gas price of ~2,000 gwei: local roles get 10^24 wei of test balance.
