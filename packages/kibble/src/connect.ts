// Connect your own agent: create a vault and a drawer, then spend through it.
import { erc20Abi, keccak256, parseEventLogs, toHex, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { kibbleDrawerAbi, kibbleFactoryAbi } from "./abi";
import { payOnce, readDrawer, sendDrawer, type PayResult, type Wallet } from "./client";
import { Mode, units } from "./types";

const TX = { type: "legacy" } as const;

export type Timing = "fast" | "daily";

export type NewDrawer = {
  label: string;
  /** The address your agent signs with. It must not be the owner or the guardian. */
  agent: Address;
  /** Gets co-sign and cancel powers, and receives vault withdrawals. Only used when the owner has no vault yet. */
  guardian: Address;
  /** The most you're willing to lose in a week, in tUSD8 base units. Everything else is derived. */
  maxWeeklyLoss: bigint;
  suppliers: { payee: Address; perPayment: bigint; perWindow: bigint }[];
  /** "fast": 2-minute windows for trying it out. "daily": the production defaults (1-day windows). */
  timing: Timing;
};

/** The drawer settings for a weekly loss. `fast` shrinks the demo's amounts and timings to your number. */
export async function configFor(pub: PublicClient, factory: Address, maxWeeklyLoss: bigint, timing: Timing) {
  const read = (functionName: "demoConfig" | "defaultConfig") =>
    pub.readContract({ address: factory, abi: kibbleFactoryAbi, functionName, args: [maxWeeklyLoss] });
  if (timing === "daily") return read("defaultConfig");
  const demo = await read("demoConfig");
  // demoConfig's amounts are written for a weekly loss of 20 tUSD8
  const scaled = (v: bigint) => (v * maxWeeklyLoss) / 20_000_000n;
  return {
    ...demo,
    windowLength: 120n,
    incomeHold: 120n,
    tMin: scaled(demo.tMin),
    maxStep: scaled(demo.maxStep),
    // a batch of sales can straddle two short windows, so a lower floor lets them count
    minActivity: scaled(demo.minActivity) / 3n,
    slack: scaled(demo.slack),
    unknownBudget: scaled(demo.unknownBudget),
  };
}

async function write(pub: PublicClient, wallet: Wallet, req: { address: Address; abi: unknown; functionName: string; args: readonly unknown[] }) {
  const gas = (await pub.estimateContractGas({ ...req, account: wallet.account } as never)) * 2n;
  const hash = await wallet.writeContract({ ...TX, ...req, gas } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${req.functionName} reverted: ${hash}`);
  return receipt;
}

/** The owner's vault, or undefined if they have none yet. */
export async function vaultOf(pub: PublicClient, factory: Address, owner: Address): Promise<Address | undefined> {
  const v = await pub.readContract({ address: factory, abi: kibbleFactoryAbi, functionName: "vaultOf", args: [owner] });
  return v === zeroAddress ? undefined : v;
}

/** Owner: make sure there's a vault (its `home` becomes the guardian of every drawer you create). */
export async function ensureVault(pub: PublicClient, owner: Wallet, factory: Address, guardian: Address): Promise<Address> {
  const have = await vaultOf(pub, factory, owner.account.address);
  if (have) return have;
  await write(pub, owner, { address: factory, abi: kibbleFactoryAbi, functionName: "createVault", args: [guardian, 86_400n] });
  return (await vaultOf(pub, factory, owner.account.address))!;
}

/** Owner: create the drawer. The agent can spend nothing until it's funded or has sold something. */
export async function createDrawer(pub: PublicClient, owner: Wallet, factory: Address, d: NewDrawer): Promise<Address> {
  await ensureVault(pub, owner, factory, d.guardian);
  const cfg = await configFor(pub, factory, d.maxWeeklyLoss, d.timing);
  const receipt = await write(pub, owner, {
    address: factory,
    abi: kibbleFactoryAbi,
    functionName: "createDrawer",
    args: [Mode.EARNED, d.agent, cfg, d.suppliers, [], d.label],
  });
  const [log] = parseEventLogs({ abi: kibbleFactoryAbi, logs: receipt.logs, eventName: "DrawerCreated" });
  if (!log) throw new Error("no DrawerCreated event");
  return log.args.drawer;
}

/** Owner: give the agent its first allowance (at most its starting limit T). */
export async function fundDrawer(pub: PublicClient, owner: Wallet, drawer: Address, amount: bigint) {
  const token = await pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "token" });
  await write(pub, owner, { address: token, abi: erc20Abi, functionName: "approve", args: [drawer, amount] });
  await sendDrawer(pub, owner, drawer, "fundAllowance", [amount]);
}

/**
 * What your agent holds instead of money. It can only ask the drawer to pay; a refusal is a normal
 * answer with a plain-words reason, not an exception.
 *
 *   const kibble = new KibbleAgent(pub, agentWallet, drawer);
 *   const r = await kibble.pay("0xSupplier…", "0.004", "invoice-17");
 *   if (r.status === "refused") console.log(r.text);
 */
export class KibbleAgent {
  constructor(
    readonly pub: PublicClient,
    readonly wallet: Wallet,
    readonly drawer: Address,
  ) {}

  status() {
    return readDrawer(this.pub, this.drawer);
  }

  /** Pay once for a bill, even under retries. The same payee, amount and bill is never paid twice. */
  pay(payee: Address, tusd8: string, bill: string | Hex): Promise<PayResult> {
    return payOnce({ pub: this.pub, wallet: this.wallet, drawer: this.drawer, payee, amount: units(tusd8), billRef: billRef(bill) });
  }

  /** Give a buyer their money back before the sale clears (refused if you already spent against it). */
  refund(bill: string | Hex) {
    return sendDrawer(this.pub, this.wallet, this.drawer, "refund", [billRef(bill)]);
  }
}

/** A bill reference: a 0x… 32-byte value is used as is, any other text is hashed (the same text, the same bill). */
export function billRef(bill: string | Hex): Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(bill) ? (bill as Hex) : keccak256(toHex(bill));
}
