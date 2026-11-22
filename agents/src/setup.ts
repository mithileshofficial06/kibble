// Deploys Kibble (if needed) and the demo: one owner vault and five drawers.
//
//   RPC_URL=http://127.0.0.1:8555 pnpm --filter @kibble/agents setup-demo     # `make fork` (default)
//   RPC_URL=https://rpc-test.qday.info pnpm --filter @kibble/agents setup-demo # Aevum testnet (needs funded wallets)
//
// --fresh creates new drawers; --redeploy also redeploys the contracts (after a contract change).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, erc20Abi, parseEventLogs, type Address, type Hex } from "viem";
import { kibbleFactoryAbi, kibbleDrawerAbi, kibbleVaultAbi, fmt, Mode, units, sendDrawer } from "@kibble/sdk";

/** maxWeeklyLoss L, the owner's one setting: 20 tUSD8 at demo scale 1 (2 on testnet). */
const maxWeeklyLoss = (ctx: Ctx) => ctx.u(20);
import { connect, ROLES, scaled, testClient, type Ctx, type Role } from "./chain";
import { AGENTS, ROOT, loadDeployment, saveDeployment, type AgentName, type Deployment } from "./deployments";

const TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
const TUSD8_MASTER_MINTER: Address = "0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1";

function artifact(name: string): { abi: unknown[]; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(ROOT, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function deployContract(ctx: Ctx, name: string, args: unknown[] = []): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const owner = ctx.wallet("OWNER");
  const hash = await owner.deployContract({ abi, bytecode, args, type: "legacy" } as never);
  const r = await ctx.pub.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error(`${name} deploy failed`);
  console.log(`  ${name.padEnd(14)} ${r.contractAddress}`);
  return r.contractAddress;
}

/** Local chains only: gas for every role, and tUSD8 for the owner and buyer. */
async function dealLocal(ctx: Ctx, token: Address) {
  const t = testClient(ctx);
  for (const role of ROLES) await t.setBalance({ address: ctx.address(role), value: 10n ** 24n });
  const code = await ctx.pub.getCode({ address: TUSD8 });
  if (code && token === TUSD8) {
    // `make fork`: mint real tUSD8 by impersonating its master minter (works only on a local fork)
    await t.impersonateAccount({ address: TUSD8_MASTER_MINTER });
    await t.setBalance({ address: TUSD8_MASTER_MINTER, value: 10n ** 20n });
    const mmAbi = [
      { type: "function", name: "configureMinter", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
      { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
    ] as const;
    const send = async (fn: "configureMinter" | "mint", args: readonly [Address, bigint]) => {
      const hash = await t.request({
        method: "eth_sendTransaction",
        params: [{ from: TUSD8_MASTER_MINTER, to: TUSD8, data: encode(mmAbi, fn, args) }],
      } as never);
      await ctx.pub.waitForTransactionReceipt({ hash: hash as Hex });
    };
    await send("configureMinter", [TUSD8_MASTER_MINTER, 10n ** 15n]);
    for (const role of ["OWNER", "BUYER"] as const) await send("mint", [ctx.address(role), units(500)]);
  } else {
    const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] }] as const;
    for (const role of ["OWNER", "BUYER"] as const) {
      const hash = await ctx.wallet("OWNER").writeContract({ address: token, abi: mintAbi, functionName: "mint", args: [ctx.address(role), units(500)], type: "legacy" });
      await ctx.pub.waitForTransactionReceipt({ hash });
    }
  }
}

function encode(abi: readonly unknown[], functionName: string, args: readonly unknown[]): Hex {
  return encodeFunctionData({ abi, functionName, args } as never);
}

async function write(ctx: Ctx, role: Role, address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
  const hash = await ctx.wallet(role).writeContract({ address, abi, functionName, args, type: "legacy" } as never);
  const r = await ctx.pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return r;
}

async function main() {
  const redeploy = process.argv.includes("--redeploy");
  const fresh = redeploy || process.argv.includes("--fresh");
  const ctx = await connect();
  console.log(`Network: ${ctx.chain.name} (chain ${ctx.chain.id})${ctx.local ? " [local]" : ""}`);

  let dep = loadDeployment(ctx.chain.id);
  const roles = Object.fromEntries(ROLES.map((r) => [r, ctx.address(r)]));

  if (redeploy || !dep || !(await ctx.pub.getCode({ address: dep.factory }))) {
    console.log("Deploying Kibble contracts:");
    const tusd8Code = await ctx.pub.getCode({ address: TUSD8 });
    if (ctx.local) await testClient(ctx).setBalance({ address: ctx.address("OWNER"), value: 10n ** 24n });
    const token = tusd8Code ? TUSD8 : await deployContract(ctx, "MockUSD8");
    const adminModule = await deployContract(ctx, "KibbleAdmin");
    const drawerImpl = await deployContract(ctx, "KibbleDrawer", [adminModule]);
    const factory = await deployContract(ctx, "KibbleFactory", [token, drawerImpl]);
    const deployBlock = (await ctx.pub.getBlockNumber()).toString();
    dep = { chainId: ctx.chain.id, token, adminModule, drawerImpl, factory, deployBlock, drawers: {}, roles };
    saveDeployment(dep);
  }
  dep.roles = roles;

  if (ctx.local) await dealLocal(ctx, dep.token);
  else if (needDrawersFor(dep, fresh)) {
    if (dep.drawers.A) await reclaim(ctx, dep);
    await shareOut(ctx, dep.token);
  }

  const ownerBal = await ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [ctx.address("OWNER")] });
  console.log(`Owner tUSD8: ${fmt(ownerBal)}`);

  // vault: one per owner, `home` = guardian
  if (!dep.vault || redeploy) {
    dep.vault = (await ctx.pub.readContract({ address: dep.factory, abi: kibbleFactoryAbi, functionName: "vaultOf", args: [ctx.address("OWNER")] })) as Address;
    if (dep.vault === "0x0000000000000000000000000000000000000000") {
      const delay = ctx.local ? 120n : 86_400n;
      const r = await write(ctx, "OWNER", dep.factory, kibbleFactoryAbi, "createVault", [ctx.address("GUARDIAN"), delay]);
      const ev = parseEventLogs({ abi: kibbleFactoryAbi, logs: r.logs, eventName: "VaultCreated" })[0];
      dep.vault = ev.args.vault;
    }
    console.log(`Vault: ${dep.vault}`);
  }

  if (needDrawersFor(dep, fresh)) {
    dep.drawers = await createDrawers(ctx, dep);
  }
  saveDeployment(dep);
  console.log(`\nSaved deployments/${ctx.chain.id}.json`);
  for (const [k, v] of Object.entries(dep.drawers)) console.log(`  ${AGENTS[k as AgentName].label.padEnd(52)} ${v}`);
}

function needDrawersFor(dep: Deployment, fresh: boolean) {
  return fresh || !dep.drawers.A;
}

/**
 * How much the demo needs, before scaling. Locally there's plenty; on testnet the faucet gives 5 tUSD8
 * per person, so the fixed sides start with a smaller reserve and W with a smaller work budget.
 */
const PLAN = {
  fixedSeed: (ctx: Ctx) => (ctx.local ? 10 : 2),
  workBudget: (ctx: Ctx) => (ctx.local ? 30 : 16),
  /** tUSD8 the owner puts in: five drawer seeds, W's work budget, and W's 1.2 runway grant later. */
  ownerNeeds: (ctx: Ctx) => ctx.u(2 + PLAN.fixedSeed(ctx) + 2 + PLAN.fixedSeed(ctx) + 2 + PLAN.workBudget(ctx) + 1.2),
  /** tUSD8 the buyer spends: a 10-window time-lapse (~12.6 before scaling) plus bad-strategy (~4.2). */
  buyerNeeds: (ctx: Ctx) => ctx.u(18),
};

/** tQDAY each role needs for gas on testnet (1 gwei; a payment is ~250k gas = 0.00025). */
const GAS: Record<Exclude<Role, "OWNER">, bigint> = {
  AGENT_A: 200n * 10n ** 15n,
  BUYER: 200n * 10n ** 15n,
  AGENT_B: 120n * 10n ** 15n,
  RELAYER: 120n * 10n ** 15n,
  GUARDIAN: 30n * 10n ** 15n,
  SUPPLIER: 10n * 10n ** 15n,
};

/**
 * Testnet, before fresh drawers: bring the demo's tUSD8 back to the owner. The old drawers are revoked
 * (everything sweeps to the vault), the vault pays out to its home (the guardian), and the guardian and
 * the supplier hand their tUSD8 to the owner. Every token stays inside the demo's own wallets.
 */
async function reclaim(ctx: Ctx, dep: Deployment) {
  console.log("Reclaiming tUSD8 from the previous demo drawers:");
  for (const [name, drawer] of Object.entries(dep.drawers) as [AgentName, Address][]) {
    const state = await ctx.pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "state" });
    if (state !== 5 /* Revoked */) await sendDrawer(ctx.pub, ctx.wallet("OWNER"), drawer, "revoke");
    console.log(`  revoked ${name}`);
  }
  const bal = (a: Address) => ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  const inVault = await bal(dep.vault!);
  if (inVault > 0n) await write(ctx, "OWNER", dep.vault!, kibbleVaultAbi, "withdrawHome", [inVault]);
  for (const role of ["GUARDIAN", "SUPPLIER"] as const) {
    const have = await bal(ctx.address(role));
    if (have > 0n) await write(ctx, role, dep.token, erc20Abi, "transfer", [ctx.address("OWNER"), have]);
    console.log(`  ${role} returned ${ctx.f(have)}`);
  }
}

/**
 * Testnet: the faucet funds only the owner, so the owner tops up every other role with gas and gives the
 * buyer its tUSD8. Only sends what's missing, so it's safe to run again.
 */
async function shareOut(ctx: Ctx, token: Address) {
  const owner = ctx.wallet("OWNER");
  for (const [role, want] of Object.entries(GAS) as [Role, bigint][]) {
    const have = await ctx.pub.getBalance({ address: ctx.address(role) });
    if (have >= want / 2n) continue;
    const hash = await owner.sendTransaction({ to: ctx.address(role), value: want - have, type: "legacy" } as never);
    await ctx.pub.waitForTransactionReceipt({ hash });
    console.log(`  gas for ${role.padEnd(8)} ${fmt((want - have) / 10n ** 12n, 3)} tQDAY`);
  }
  const bal = (a: Address) => ctx.pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  const buyerHas = await bal(ctx.address("BUYER"));
  const buyerWants = PLAN.buyerNeeds(ctx);
  if (buyerHas < buyerWants) {
    await write(ctx, "OWNER", token, erc20Abi, "transfer", [ctx.address("BUYER"), buyerWants - buyerHas]);
    console.log(`  tUSD8 for BUYER    ${ctx.f(buyerWants - buyerHas)}`);
  }
  const ownerHas = await bal(ctx.address("OWNER"));
  if (ownerHas < PLAN.ownerNeeds(ctx)) {
    throw new Error(
      `The owner has ${ctx.f(ownerHas)} tUSD8 but the drawers need ${ctx.f(PLAN.ownerNeeds(ctx))}. ` +
        `Claim more from the faucet, or lower KIBBLE_SCALE (now ${ctx.scale}).`,
    );
  }
}

async function createDrawers(ctx: Ctx, dep: Deployment) {
  const demo = await ctx.pub.readContract({ address: dep.factory, abi: kibbleFactoryAbi, functionName: "demoConfig", args: [maxWeeklyLoss(ctx)] });
  // demoConfig is written for scale 1; scale its amounts with the demo (timings stay the same)
  const base = {
    ...demo,
    // On testnet each sale is ~4 real transactions, so a window needs to be long enough to hold a batch.
    windowLength: ctx.local ? demo.windowLength : 120n,
    tMin: scaled(ctx, demo.tMin),
    maxStep: scaled(ctx, demo.maxStep),
    minActivity: scaled(ctx, demo.minActivity),
    slack: scaled(ctx, demo.slack),
    unknownBudget: scaled(ctx, demo.unknownBudget),
  };
  const supplier = ctx.address("SUPPLIER");
  const acceptor = ctx.address("BUYER"); // the client who accepts W's reports
  const suppliers = [{ payee: supplier, perPayment: ctx.u(1), perWindow: 0n }];
  const acceptors = [{ acceptor, perWindow: ctx.u(6) }];

  const plans: Record<AgentName, { cfg: typeof base; seed: bigint; work?: bigint }> = {
    // A learns its cost share over 5 windows; profit grows T at 50% (report section 10)
    A: { cfg: { ...base, growthBps: 5_000 }, seed: ctx.u(2) },
    A_FIXED: { cfg: { ...base, fixedLimit: ctx.u(0.5) }, seed: ctx.u(PLAN.fixedSeed(ctx)) },
    // B and W skip learning so the demo shows the ladder straight away
    B: { cfg: { ...base, learningWindows: 0, minActivity: ctx.u(0.1) }, seed: ctx.u(2) },
    B_FIXED: { cfg: { ...base, fixedLimit: ctx.u(3) }, seed: ctx.u(PLAN.fixedSeed(ctx)) },
    W: { cfg: { ...base, learningWindows: 0 }, seed: ctx.u(2), work: ctx.u(PLAN.workBudget(ctx)) },
  };

  const out: Partial<Record<AgentName, Address>> = {};
  for (const name of Object.keys(plans) as AgentName[]) {
    const meta = AGENTS[name];
    const p = plans[name];
    const r = await write(ctx, "OWNER", dep.factory, kibbleFactoryAbi, "createDrawer", [
      meta.mode === "EARNED" ? Mode.EARNED : Mode.FIXED,
      ctx.address(meta.agentRole),
      p.cfg,
      suppliers,
      name === "W" ? acceptors : [],
      meta.label,
    ]);
    const drawer = parseEventLogs({ abi: kibbleFactoryAbi, logs: r.logs, eventName: "DrawerCreated" })[0].args.drawer;
    out[name] = drawer;
    await write(ctx, "OWNER", dep.token, erc20Abi, "approve", [drawer, 2n ** 255n]);
    await write(ctx, "BUYER", dep.token, erc20Abi, "approve", [drawer, 2n ** 255n]);
    await sendDrawer(ctx.pub, ctx.wallet("OWNER"), drawer, "fundAllowance", [p.seed]);
    if (p.work) await sendDrawer(ctx.pub, ctx.wallet("OWNER"), drawer, "fundWorkBudget", [p.work]);
    const t = await ctx.pub.readContract({ address: drawer, abi: kibbleDrawerAbi, functionName: "limitT" });
    console.log(`Created ${name.padEnd(8)} ${drawer}  T=${ctx.f(t)}`);
  }
  return out;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
