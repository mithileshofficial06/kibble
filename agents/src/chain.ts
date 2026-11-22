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
import { fmt, units, type Wallet } from "@kibble/sdk";

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
  /** Demo amount multiplier: 1 on local chains, 0.1 on Aevum testnet (faucet tUSD8 is scarce). KIBBLE_SCALE overrides. */
  scale: number;
  /** A demo amount in tUSD8, scaled: u(0.5) is 0.5 locally and 0.05 on testnet. */
  u: (amount: number | string) => bigint;
  /** Format a tUSD8 amount with enough digits for the current scale. */
  f: (value: bigint) => string;
  /** Where scenario output goes (the console, or the web playground's log). */
  log: (...args: unknown[]) => void;
};

/** Scale a bigint amount (e.g. a contract default) by the demo scale. */
export function scaled(ctx: Ctx, value: bigint): bigint {
  return (value * BigInt(Math.round(ctx.scale * 1_000_000))) / 1_000_000n;
}

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
export async function connect(
  rpcUrl = process.env.RPC_URL?.trim() || "http://127.0.0.1:8555",
  log: (...args: unknown[]) => void = console.log,
): Promise<Ctx> {
  const probe = createPublicClient({ transport: http(rpcUrl) });
  const id = await probe.getChainId();
  const local = id !== aevumTestnet.id;
  const base: Chain = id === aevumTestnet.id ? aevumTestnet : id === aevumFork.id ? aevumFork : { ...localAnvil, id };
  // anvil suggests a gas price from recent tips, so paying its suggestion on every tx feeds back and
  // climbs without bound. On local chains pay a flat 1 gwei, roughly what Aevum charges.
  const chain: Chain = local
    ? { ...base, fees: { estimateFeesPerGas: async () => ({ gasPrice: 1_000_000_000n }) } }
    : base;
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
  const scale = Number(process.env.KIBBLE_SCALE ?? (local ? 1 : 0.1));
  if (!(scale > 0 && scale <= 1)) throw new Error(`KIBBLE_SCALE must be in (0, 1], got ${process.env.KIBBLE_SCALE}`);
  const u = (amount: number | string) => units((Math.round(Number(amount) * scale * 1e6) / 1e6).toFixed(6));
  const digits = scale >= 1 ? 2 : scale >= 0.1 ? 3 : 4;
  const f = (value: bigint) => fmt(value, digits);
  return { chain, rpcUrl, pub, local, wallet, address: (role) => wallet(role).account.address, scale, u, f, log };
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
