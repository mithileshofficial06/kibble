# Deploying the web app

## Vercel (no keys)

Live at [kibble-two-pi.vercel.app](https://kibble-two-pi.vercel.app) since 26 Nov 2026, with these settings. Checked after deploy: every page on desktop and phone, no errors, 0 axe violations; the Playground API answers "switched off" and the assistant answers without a model key.

The film, the replays, the live dashboard, drawer pages, Connect and the assistant's built-in answers all work without a server key. This is the set-up to put online.

1. **New Project → Import** the GitHub repo.
2. **Root Directory:** `web`. Leave "Include files outside the root directory" on: the app imports `deployments/44005.json` and the workspace packages (`packages/kibble`, `agents`) from the repo.
3. Framework: Next.js (detected). Install and build commands: the defaults (pnpm is picked up from `pnpm-lock.yaml`). Node.js 22 or later.
4. **Environment variables:** none are required. Optional: `NEXT_PUBLIC_WC_PROJECT_ID` (WalletConnect for phone wallets).
5. Deploy, then check it logged out: `/`, `/tour` (with sound), `/playground` (replays), `/live`, a drawer page, `/connect`, `/assistant`.

**Don't** set `KIBBLE_PLAYGROUND`, `KIBBLE_WALLETS` or any private key there. “Run it for real” keeps its state (the run in progress, the daily limits) in the server's memory, so it needs one long-running server, not serverless functions. On Vercel the page says live runs are switched off and offers the recorded runs.

`KIBBLE_ASSISTANT` stays unset unless the model provider's terms allow a public demo on your key; the limits in `/api/assistant` are kept per server instance.

Checked locally (26 Nov 2026) the way Vercel runs it: `next start` with no keys and no wallet file; every page loads on desktop and phone, no errors, no sideways scroll, 0 axe violations; the playground API answers “switched off” and the assistant answers from the chain.

## A long-running server (live runs)

For “Run it for real”, run `next start` on one machine with the demo keys (test wallets only):

```bash
pnpm install && pnpm --filter web build
cd web && KIBBLE_PLAYGROUND=on KIBBLE_WALLETS=/path/outside/the/repo/.env npx next start -p 3000
```

Limits default to 60 s between runs, 3 per visitor and 10 per day; one run costs about 0.015 tQDAY of testnet gas. Behind a proxy, set `TRUSTED_IP_HEADER` to the header it sets with the client's IP.
