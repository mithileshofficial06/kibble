// Keeps the demo wallets able to run the public playground without a human topping them up.
//
// tUSD8: every beat moves money one way. The buyer pays the drawers, the drawers pay the supplier, and
// the losing and hijack beats send extra to the supplier. So the supplier fills up while the buyer and
// the vault drain. Before a beat we move it back: the supplier signs an EIP-3009 transfer and the
// relayer submits it, so the supplier never needs gas.
//
// Gas (tQDAY): only BUYER, AGENT_A, AGENT_B and RELAYER send transactions in a beat. The owner (and any
// spare in the guardian and supplier) only sign, so their gas sits idle. Before a beat, the owner sends
// gas to any sender that is running low.
import { encodeAbiParameters, erc20Abi, formatEther, keccak256, parseSignature, toHex, type Address, type Hex } from "viem";
import type { Ctx, Role } from "./chain";
import type { Deployment } from "./deployments";

/** Roles that send transactions during a beat. */
export const SENDERS = ["BUYER", "AGENT_A", "AGENT_B", "RELAYER"] as const satisfies readonly Role[];
export type Sender = (typeof SENDERS)[number];

/** Gas one beat can cost each sender, in wei at Aevum's 1 gwei (measured on the fork, with headroom). */
export type GasNeed = Partial<Record<Sender, bigint>>;

const eip3009Abi = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

const TRANSFER_TYPEHASH = keccak256(
  toHex("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
);

/** tUSD8 levels, in demo units (scaled like every other demo amount): top up below `floor`, to `target`. */
const TUSD8 = {
  buyer: { floor: 3, target: 6 },
  vault: { floor: 8, target: 12 },
  /** Don't send dust. */
  minMove: 0.5,
};

const tokenBalance = (ctx: Ctx, token: Address, who: Address) =>
  ctx.pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

/**
 * Move `value` tUSD8 from the supplier to `to`. The supplier signs; the relayer pays the gas. The digest
 * uses the token's own DOMAIN_SEPARATOR, so it matches whatever name, version and chain id it was built with.
 */
async function fromSupplier(ctx: Ctx, token: Address, to: Address, value: bigint) {
  const supplier = ctx.wallet("SUPPLIER");
  const from = supplier.account.address;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const block = await ctx.pub.getBlock();
  const validBefore = block.timestamp + 3_600n;
  const domain = await ctx.pub.readContract({ address: token, abi: eip3009Abi, functionName: "DOMAIN_SEPARATOR" });
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      [TRANSFER_TYPEHASH, from, to, value, 0n, validBefore, nonce],
    ),
  );
  const digest = keccak256(`0x1901${domain.slice(2)}${structHash.slice(2)}` as Hex);
  const sig = parseSignature(await supplier.account.sign!({ hash: digest }));
  const relayer = ctx.wallet("RELAYER");
  const req = {
    address: token,
    abi: eip3009Abi,
    functionName: "transferWithAuthorization",
    args: [from, to, value, 0n, validBefore, nonce, Number(sig.v ?? BigInt(sig.yParity + 27)), sig.r, sig.s],
    account: relayer.account,
  } as const;
  const gas = ((await ctx.pub.estimateContractGas(req)) * 3n) / 2n;
  const hash = await relayer.writeContract({ ...req, gas, type: "legacy" });
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tUSD8 top-up reverted: ${hash}`);
}

/** Move tUSD8 the beats sent to the supplier back to the buyer and the vault, when they run low. */
export async function recycleTusd8(ctx: Ctx, dep: Deployment, log: (line: string) => void) {
  const token = dep.token;
  const buyer = ctx.address("BUYER");
  let spare = await tokenBalance(ctx, token, ctx.address("SUPPLIER"));
  const plan: [string, Address, { floor: number; target: number }][] = [
    ["buyer", buyer, TUSD8.buyer],
    ["vault", dep.vault!, TUSD8.vault],
  ];
  for (const [label, who, lvl] of plan) {
    const have = await tokenBalance(ctx, token, who);
    if (have >= ctx.u(lvl.floor)) continue;
    const want = ctx.u(lvl.target) - have;
    const move = want < spare ? want : spare;
    if (move < ctx.u(TUSD8.minMove)) continue;
    await fromSupplier(ctx, token, who, move);
    spare -= move;
    log(`Upkeep: moved ${ctx.f(move)} tUSD8 from the supplier back to the ${label} (it had ${ctx.f(have)}).`);
  }
}

/** Every sender's gas balance. */
export async function gasBalances(ctx: Ctx) {
  const out = {} as Record<Sender | "OWNER", bigint>;
  for (const r of [...SENDERS, "OWNER"] as const) out[r] = await ctx.pub.getBalance({ address: ctx.address(r) });
  return out;
}

export const tq = (wei: bigint) => Number(formatEther(wei)).toFixed(4);

/** What the owner keeps for its own top-up transactions. */
const OWNER_RESERVE = 2n * 10n ** 15n;

/**
 * Before a beat, the owner sends gas to any sender holding less than 3 beats' worth of what it needs,
 * bringing it to 8 beats' worth. Returns false if the owner can't cover it.
 */
export async function rebalanceGas(ctx: Ctx, perBeat: Record<Sender, bigint>, log: (line: string) => void) {
  const bal = await gasBalances(ctx);
  const owner = ctx.wallet("OWNER");
  for (const r of SENDERS) {
    if (bal[r] >= perBeat[r] * 3n) continue;
    const send = perBeat[r] * 8n - bal[r];
    if (bal.OWNER - send < OWNER_RESERVE) return false;
    const hash = await owner.sendTransaction({ to: ctx.address(r), value: send, type: "legacy" });
    const receipt = await ctx.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`gas top-up reverted: ${hash}`);
    bal.OWNER -= send;
    log(`Upkeep: the owner sent ${tq(send)} tQDAY of gas to ${r} (it had ${tq(bal[r])}).`);
  }
  return true;
}

/**
 * How many more beats the demo wallets' gas can pay for: the owner's spare gas is shared out to
 * whichever sender needs it, so the total matters, with each sender's own share counted once.
 */
export function beatsAffordable(bal: Record<Sender | "OWNER", bigint>, perBeat: Record<Sender, bigint>) {
  const need = SENDERS.reduce((a, r) => a + perBeat[r], 0n);
  const have = SENDERS.reduce((a, r) => a + bal[r], 0n) + (bal.OWNER > OWNER_RESERVE ? bal.OWNER - OWNER_RESERVE : 0n);
  return need > 0n ? Number(have / need) : Infinity;
}
