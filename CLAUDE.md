# Kibble

Earned spending limit for AI agents: a per-agent "drawer" contract, an owner vault and a brake ladder. Entry for DoraHacks QDay Aevum Builder Challenge #1. **Deadline 11 Dec 2026 08:00 UTC** (aim to submit 10 Dec).

- **Design source of truth:** `D:\Projects\3-Ideas-and-Research\qday-ideas\Kibble_Project_Report.md` (v2.0, design v5.1). Older build spec: `Leash_v5_Spec.md` in the same folder.
- **Repo:** https://github.com/mithileshofficial06/kibble (public, branch `main`).

## Layout
- `contracts/src`: `KibbleCore` (storage + sync/window/ladder), `KibbleDrawer` (agent/buyer/requester functions, clone implementation, delegates unknown selectors to `KibbleAdmin`), `KibbleAdmin` (owner/guardian functions), `KibbleVault`, `KibbleFactory`, `KibbleTypes`. `Checkout.sol` is the starter kit's example, still used by `web/`.
- `contracts/test`: `KibbleBase` fixture; `KibbleDrawer.t`, `KibbleWorkAndApproval.t`, `KibbleControls.t`, `KibbleInvariants.t` (invariants, fuzz, hijack), `KibbleVault.t`, `fork/KibbleFork.t`.
- `packages/kibble` (`@kibble/sdk`): generated ABI (`make abi`), typed data, `payOnce`, `readDrawer`, plain-words reasons.
- `agents/`: `setup.ts` (deploy + demo drawers), `scenarios.ts`, `run.ts` CLI, `shop.ts` (sale loop), `supplier*.ts`, `injection.ts` (Claude summarizer with a pay tool).
- `web/`: the kit's Next.js app. **Don't touch the UI until the user says so.**

## Commands
- `make install`, `make build`, `make test` (unit + fuzz + invariants, ~2 min), `make test-fork`, `make abi` (after build).
- Local demo: `make fork` (or `anvil --fork-url https://rpc-test.qday.info --hardfork shanghai --chain-id 440050 --port 8555`), then `pnpm --filter @kibble/agents setup-demo [--fresh|--redeploy]` and `pnpm --filter @kibble/agents scenario <timelapse|bad-strategy|hijack|work|controls|resume X|status|all>`.
- `RPC_URL` picks the network (default: the fork on 8555). `KIBBLE_LLM=off` forces the scripted model.
- pnpm: `setup` is a built-in pnpm command, so the script is `setup-demo`.
- GNU Make 4.4.1 via winget; the Makefile uses `/bin/bash`, so run it from Git Bash.

## Rules
- **Commits:** authored by the user only. **Never add a `Co-Authored-By: Claude` trailer** or any Claude attribution. Commit and push after each working step.
- No keys in the repo. Demo keys live in `D:\Tools\kibble-wallets\.env` (`KIBBLE_WALLETS` overrides the path).
- Policy refusals return `false` + emit `Refused`; never revert for policy (strikes must persist).
- Contract size: the drawer is ~21 KB and the admin module ~18 KB, under the 24 KB limit. New owner functions go in `KibbleAdmin`; new storage only in `KibbleCore`.
- After a contract change: `make build && make abi`, then `setup-demo --redeploy` on the fork.

## Key decisions
- Uncleared (pending) sales count toward the cost ceiling but never toward T or refills, so a seller can buy its input before the buyer acknowledges.
- `maxLossNow` = allowance + active runway (stranger payments come out of the allowance, so U is inside it, not on top).
- FIXED mode uses the same income hold as EARNED (a fair comparison, and refunds work on both sides).
- The per-block clearing cap is keyed on (timestamp, block number).
- Txs are sent with a 2x gas margin (a call can close a window in the block it lands in).
- Injection LLM: `claude-opus-5-5`, effort low, server-side refusal fallback `"default"`.

## Platform facts (verified 22 Nov 2026)
- tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`, 6 decimals, **supports EIP-2612 permit and EIP-3009** (domain "tUSD8", version "2").
- No supported bundler/paymaster; no ERC-8004 registry; explorer verification broken.
- A local fork reports a gas price of ~2,000 gwei: local roles get 10^24 wei of test balance.
