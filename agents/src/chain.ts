import { existsSync } from "node:fs";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";
import type { Wallet } from "@kibble/sdk";

/** Demo roles. Keys come from the wallets file (never from the repo). */
export const ROLES = ["OWNER", "GUARDIAN", "AGENT_A", "AGENT_B", "SUPPLIER", "BUYER", "RELAYER"] as const;
export type Role = (typeof ROLES)[number];

/** Where the demo keys live. Override with KIBBLE_WALLETS=<path to .env>. */
const WALLETS_FILE = process.env.KIBBLE_WALLETS ?? "D:/Tools/kibble-wallets/.env";
if (existsSync(WALLETS_FILE)) process.loadEnvFile(WALLETS_FILE);

export type Ctx = {
  chain: Chain;
  rpcUrl: string;
  pub: PublicClient;
  /** true on `make fork` / `make anvil`: time can be fast-forwarded and balances dealt. */
  local: boolean;
  wallet: (role: Role) => Wallet;
  address: (role: Role) => Address;
};

function keyFor(role: Role, local: boolean): Hex {
  const v = process.env[`${role}_PRIVATE_KEY`]?.trim();
  if (v) return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
  if (!local) {
    throw new Error(`Missing ${role}_PRIVATE_KEY. Put the demo keys in ${WALLETS_FILE} or set KIBBLE_WALLETS.`);
  }
  // Local chains only: a deterministic throwaway key, so anyone can run the demo on a fork.
  return keccak256(toHex(`kibble-local-demo:${role}`));
}

/**
 * RPC_URL picks the network: Aevum testnet (default), `make fork` (http://127.0.0.1:8555) or
 * `make anvil` (http://127.0.0.1:8545).
 */
export async function connect(rpcUrl = process.env.RPC_URL?.trim() || "http://127.0.0.1:8555"): Promise<Ctx> {
  const probe = createPublicClient({ transport: http(rpcUrl) });
  const id = await probe.getChainId();
  const chain: Chain = id === aevumTestnet.id ? aevumTestnet : id === aevumFork.id ? aevumFork : { ...localAnvil, id };
  const local = id !== aevumTestnet.id;
  const pub = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: local ? 50 : 1_000 }) as PublicClient;
  const cache = new Map<Role, Wallet>();
  const wallet = (role: Role) => {
    let w = cache.get(role);
    if (!w) {
      w = createWalletClient({ account: privateKeyToAccount(keyFor(role, local)), chain, transport: http(rpcUrl) });
      cache.set(role, w);
    }
    return w;
  };
  return { chain, rpcUrl, pub, local, wallet, address: (role) => wallet(role).account.address };
}

export function testClient(ctx: Ctx) {
  return createTestClient({ mode: "anvil", chain: ctx.chain, transport: http(ctx.rpcUrl) });
}

/** Move time forward. On a local chain it jumps instantly; on Aevum it waits for real. */
export async function advance(ctx: Ctx, seconds: number) {
  if (seconds <= 0) return;
  if (ctx.local) {
    const t = testClient(ctx);
    await t.increaseTime({ seconds });
    await t.mine({ blocks: 1 });
  } else {
    await new Promise((r) => setTimeout(r, seconds * 1000));
  }
}

export async function now(ctx: Ctx): Promise<bigint> {
  return (await ctx.pub.getBlock()).timestamp;
}
