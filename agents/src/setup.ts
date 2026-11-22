// Deploys Kibble (if needed) and the demo: one owner vault and five drawers.
//
//   RPC_URL=http://127.0.0.1:8555 pnpm --filter agents setup-demo     # `make fork` (default)
//   RPC_URL=https://rpc-test.qday.info pnpm --filter agents setup-demo # Aevum testnet (needs funded wallets)
//
// Add --fresh to create new drawers even if a deployment file exists.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, erc20Abi, parseEventLogs, type Address, type Hex } from "viem";
import { kibbleFactoryAbi, kibbleDrawerAbi, fmt, Mode, units, sendDrawer } from "@kibble/sdk";
import { connect, ROLES, testClient, type Ctx } from "./chain";
import { AGENTS, ROOT, loadDeployment, saveDeployment, type AgentName, type Deployment } from "./deployments";

const TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
const TUSD8_MASTER_MINTER: Address = "0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1";
const L = units(20); // maxWeeklyLoss: the owner's one setting

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
  for (const role of ROLES) await t.setBalance({ address: ctx.address(role), value: 10n ** 19n });
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

async function write(ctx: Ctx, role: "OWNER" | "BUYER", address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
  const hash = await ctx.wallet(role).writeContract({ address, abi, functionName, args, type: "legacy" } as never);
  const r = await ctx.pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return r;
}

async function main() {
  const fresh = process.argv.includes("--fresh");
  const ctx = await connect();
  console.log(`Network: ${ctx.chain.name} (chain ${ctx.chain.id})${ctx.local ? " [local]" : ""}`);

  let dep = loadDeployment(ctx.chain.id);
  const roles = Object.fromEntries(ROLES.map((r) => [r, ctx.address(r)]));

  if (!dep || !(await ctx.pub.getCode({ address: dep.factory }))) {
    console.log("Deploying Kibble contracts:");
    const tusd8Code = await ctx.pub.getCode({ address: TUSD8 });
    if (ctx.local) await testClient(ctx).setBalance({ address: ctx.address("OWNER"), value: 10n ** 19n });
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

  const ownerBal = await ctx.pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [ctx.address("OWNER")] });
  console.log(`Owner tUSD8: ${fmt(ownerBal)}`);

  // vault: one per owner, `home` = guardian
  if (!dep.vault) {
    dep.vault = (await ctx.pub.readContract({ address: dep.factory, abi: kibbleFactoryAbi, functionName: "vaultOf", args: [ctx.address("OWNER")] })) as Address;
    if (dep.vault === "0x0000000000000000000000000000000000000000") {
      const delay = ctx.local ? 120n : 86_400n;
      const r = await write(ctx, "OWNER", dep.factory, kibbleFactoryAbi, "createVault", [ctx.address("GUARDIAN"), delay]);
      const ev = parseEventLogs({ abi: kibbleFactoryAbi, logs: r.logs, eventName: "VaultCreated" })[0];
      dep.vault = ev.args.vault;
    }
    console.log(`Vault: ${dep.vault}`);
  }

  const needDrawers = fresh || !dep.drawers.A;
  if (needDrawers) {
    dep.drawers = await createDrawers(ctx, dep);
  }
  saveDeployment(dep);
  console.log(`\nSaved deployments/${ctx.chain.id}.json`);
  for (const [k, v] of Object.entries(dep.drawers)) console.log(`  ${AGENTS[k as AgentName].label.padEnd(52)} ${v}`);
}

async function createDrawers(ctx: Ctx, dep: Deployment) {
  const base = await ctx.pub.readContract({ address: dep.factory, abi: kibbleFactoryAbi, functionName: "demoConfig", args: [L] });
  const supplier = ctx.address("SUPPLIER");
  const acceptor = ctx.address("BUYER"); // the client who accepts W's reports
  const suppliers = [{ payee: supplier, perPayment: units(1), perWindow: 0n }];
  const acceptors = [{ acceptor, perWindow: units(6) }];

  const plans: Record<AgentName, { cfg: typeof base; seed: bigint; work?: bigint }> = {
    // A learns its cost share over 5 windows; profit grows T at 50% (report section 10)
    A: { cfg: { ...base, growthBps: 5_000 }, seed: units(2) },
    A_FIXED: { cfg: { ...base, fixedLimit: units(0.5) }, seed: units(10) },
    // B and W skip learning so the demo shows the ladder straight away
    B: { cfg: { ...base, learningWindows: 0, minActivity: units(0.1) }, seed: units(2) },
    B_FIXED: { cfg: { ...base, fixedLimit: units(3) }, seed: units(10) },
    W: { cfg: { ...base, learningWindows: 0 }, seed: units(2), work: units(30) },
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
    console.log(`Created ${name.padEnd(8)} ${drawer}  T=${fmt(t)}`);
  }
  return out;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
