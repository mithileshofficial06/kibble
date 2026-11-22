# Kibble

Earned spending limit for AI agents (per-agent "drawer" contract, owner vault, brake ladder). Entry for DoraHacks QDay Aevum Builder Challenge #1. **Deadline 11 Dec 2026 08:00 UTC** (aim to submit 10 Dec).

- **Design source of truth:** `D:\Projects\3-Ideas-and-Research\qday-ideas\Kibble_Project_Report.md` (v2.0, design v5.1). Build spec: `Leash_v5_Spec.md` in the same folder (still v5.0; apply the v5.1 edits from report section 4.2).
- **Repo:** https://github.com/mithileshofficial06/kibble (public, branch `main`).

## Stack
- Contracts: Solidity 0.8.24, Foundry, **evm_version shanghai** (never cancun), OZ 5.1.0, forge-std 1.9.6 (submodules in `contracts/lib`).
- Shared TS: `packages/aevum` (chain config, ABIs, `getLogsChunked`).
- Web: Next.js 16 + wagmi/RainbowKit in `web/` (Vercel, root dir `web`).
- Agents/scripts: Node + TS + viem (`examples/` for now; agents go in `agents/`).
- Started from `qday-io/aevum-starter-kit` @ e87bcff (MIT, PQA Labs). `Checkout.sol` is the kit's example and will be replaced.

## Commands
- `make install`: submodules + `pnpm install`
- `make build`: forge build + Shanghai opcode check
- `make test`: unit tests. `make test-fork`: against real tUSD8 on Aevum
- `make fork` (local Aevum copy, port 8555, chain 440050), `make deploy-fork`, `make deal TO=0x..`
- `make dev`: web app on :3000
- GNU Make 4.4.1 installed via winget (`ezwinports.make`). The Makefile uses `/bin/bash`, so run `make` from Git Bash (new terminals have it on PATH).

## Rules
- **Commits:** authored by the user only. **Never add a `Co-Authored-By: Claude` trailer** or any Claude attribution in commits or PRs.
- No keys in the repo. Demo wallet keys live in `D:\Tools\kibble-wallets\.env`.
- All commits after 16 Nov 2026 06:00 UTC (challenge rule).
- Policy refusals return `false` + emit a reason; never revert for policy (strikes must persist).

## Platform facts (verified 22 Nov 2026)
- tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`, 6 decimals, **now supports EIP-2612 permit and EIP-3009** (domain name "tUSD8", version "2"). The report's 15 Nov "no EIP-3009" finding is outdated.
- No officially supported bundler/paymaster (AA "not required and not supported"). Use a plain agent key with the agent role.
- ERC-8004 registry is not open for this challenge. Track record = events + verify page.
- Explorer verification is broken; list addresses + commit link in README.
