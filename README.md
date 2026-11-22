# kibble

**The earned spending limit for AI agents.** Built on QDay Aevum testnet (chain 44005) with tUSD8.

A fixed limit like "$50 a day" is a guess. It treats a winning agent, a losing agent and a hijacked agent the same way. Kibble makes the agent earn its budget instead:

- **The drawer.** All of the agent's money sits in a per-agent contract. The agent's key holds nothing and can only ask the drawer to pay, from a small allowance capped at an earned limit **T**.
- **Earning.** The allowance refills only from verified value: cleared sales income, or work an approved requester has signed off.
- **The safe.** Everything above the allowance is swept to the owner's vault, out of the agent's reach.
- **The wallet brakes the agent.** Overspending or losses move the agent from Healthy to Watch, then Braked, then Paused, with no human in the loop.
- **One setting.** The owner picks the most they will lose in a week. Kibble calibrates everything else.

> Status: early build (Hackathon: DoraHacks QDay Aevum Builder Challenge #1). Contracts, agents and dashboard are in progress.

## Quickstart

Needs Node 22+, pnpm and Foundry.

```bash
git clone --recursive https://github.com/mithileshofficial06/kibble.git
cd kibble
make install   # Solidity libs + JS packages
make check     # build, Shanghai opcode check, unit tests, fork tests
```

Aevum notes (Shanghai EVM, 1,000-block log limit, no WebSocket RPC, legacy transactions) are in [docs/starter-kit.md](docs/starter-kit.md).

## Credits

Based on [Aevum Starter Kit](https://github.com/qday-io/aevum-starter-kit) (MIT, PQA Labs). Third-party licenses are in [NOTICE.md](NOTICE.md).

## License

MIT. See [LICENSE](LICENSE).
