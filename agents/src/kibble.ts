// pnpm kibble <command>: connect your own agent to Kibble.
//
//   new [--name "My agent"] [--loss 2] [--supplier 0x… --cap 0.05] [--daily]
//                  make test keys (first run), then a vault and a drawer, and fund the first allowance
//   try            a real sale, a purchase and a refused purchase through your drawer
//   status         your drawer at a glance
//   freeze         stop the agent now (owner)
//   resume         start it again (owner and guardian co-sign)
//
// Keys go to ~/.kibble/agent.env (KIBBLE_HOME overrides the folder), never into the repo. TEST keys only.
// RPC_URL picks the network (default: Aevum testnet).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, http, isAddress, parseEther, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";
import { createDrawer, fmt, fundDrawer, kibbleDrawerAbi, KibbleAgent, newBillRef, readDrawer, sendDrawer, signResume, units, type Wallet } from "@kibble/sdk";
import { loadDeployment } from "./deployments";

const HOME = process.env.KIBBLE_HOME?.trim() || join(homedir(), ".kibble");
const FILE = join(HOME, "agent.env");

const [command = "help", ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i < 0 ? undefined : (rest[i + 1] ?? "");
};
const has = (name: string) => rest.includes(`--${name}`);

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

type Keys = Record<string, string>;
function loadKeys(): Keys {
  if (!existsSync(FILE)) return {};
  return Object.fromEntries(
    readFileSync(FILE, "utf8")
      .split(/\r?\n/)
      .map((l) => /^([A-Z_0-9]+)=(.*)$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => [m[1], m[2]]),
  );
}
function saveKeys(k: Keys) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(FILE, Object.entries(k).map(([n, v]) => `${n}=${v}`).join("\n") + "\n", { mode: 0o600 });
  chmodSync(FILE, 0o600);
}

const rpc = process.env.RPC_URL?.trim() || aevumTestnet.rpcUrls.default.http[0];
const chainId = await createPublicClient({ transport: http(rpc) })
  .getChainId()
  .catch(() => fail(`Can't reach ${rpc}. Check your connection, or set RPC_URL.`));
const base = chainId === aevumTestnet.id ? aevumTestnet : chainId === aevumFork.id ? aevumFork : { ...localAnvil, id: chainId };
const chain = chainId === aevumTestnet.id ? base : { ...base, fees: { estimateFeesPerGas: async () => ({ gasPrice: 1_000_000_000n }) } };
const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: chainId === aevumTestnet.id ? 1_000 : 50 }) as PublicClient;
const dep = loadDeployment(chainId) ?? fail(`Kibble isn't deployed on chain ${chainId}.`);
const DRAWER = `DRAWER_${chainId}`;

function wallet(k: Keys, role: "OWNER" | "AGENT" | "GUARDIAN"): Wallet {
  const key = k[`${role}_KEY`] ?? fail(`No keys in ${FILE} yet. Run: pnpm kibble new`);
  return createWalletClient({ account: privateKeyToAccount(key as Hex), chain, transport: http(rpc) });
}
function drawerOf(k: Keys): Address {
  return (k[DRAWER] as Address | undefined) ?? fail("No drawer on this network yet. Run: pnpm kibble new");
}
const tusd8 = (a: Address) => pub.readContract({ address: dep.token, abi: erc20Abi, functionName: "balanceOf", args: [a] });

/** tUSD8 amounts as text, with enough digits for small test amounts. */
const t = (v: bigint) => fmt(v, 4);

async function show(drawer: Address) {
  const v = await readDrawer(pub, drawer);
  console.log(`  state ${v.state}   earned limit ${t(v.limitT)}   allowance ${t(v.allowance)}   most a thief could take now ${t(v.maxLossNow)}`);
  console.log(`  earned ${t(v.lifetimeValue)}   spent ${t(v.lifetimeSpend)}   payments ${v.receiptCount}   strikes ${v.strikes}`);
}

async function cmdNew() {
  const k = loadKeys();
  if (k[DRAWER] && !has("again")) fail(`You already have a drawer here: ${k[DRAWER]}\nRun "pnpm kibble try", or add --again to make another.`);
  const name = (flag("name") ?? "My agent").slice(0, 60);
  const lossText = flag("loss") ?? "2";
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(lossText) || Number(lossText) <= 0) fail("--loss must be a positive amount of tUSD8, e.g. 2");
  const loss = units(lossText);
  const supplier = flag("supplier") ?? dep.roles.SUPPLIER;
  if (!isAddress(supplier)) fail("--supplier must be a 0x address");
  const capText = flag("cap") ?? (Number(lossText) / 40).toFixed(6);
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(capText) || Number(capText) <= 0) fail("--cap must be a positive amount of tUSD8, e.g. 0.05");

  for (const role of ["OWNER", "GUARDIAN", "AGENT"]) k[`${role}_KEY`] ??= generatePrivateKey();
  saveKeys(k);
  const owner = wallet(k, "OWNER");
  const agent = wallet(k, "AGENT");
  const guardian = privateKeyToAccount(k.GUARDIAN_KEY as Hex).address;
  const [gas, usd] = await Promise.all([pub.getBalance({ address: owner.account.address }), tusd8(owner.account.address)]);
  const first = loss / 10n;
  if (gas < parseEther("0.05") || usd < first) {
    console.log(`\nTest keys saved in ${FILE}\n`);
    console.log(`Fund this address, then run the same command again:\n\n  ${owner.account.address}\n`);
    console.log(`  needs about 0.05 tQDAY and ${t(first)} tUSD8 (has ${Number(formatEther(gas)).toFixed(4)} and ${t(usd)})`);
    console.log(`  faucet: QDay Discord, /faucet ${owner.account.address}, or https://faucet.qday.info/en\n`);
    return;
  }
  if ((await pub.getBalance({ address: agent.account.address })) < parseEther("0.01")) {
    const hash = await owner.sendTransaction({ to: agent.account.address, value: parseEther("0.02"), type: "legacy" });
    await pub.waitForTransactionReceipt({ hash });
    console.log("1/3 gave the agent key a little gas");
  } else console.log("1/3 the agent key has gas");
  const drawer = await createDrawer(pub, owner, dep.factory, {
    label: name,
    agent: agent.account.address,
    guardian,
    maxWeeklyLoss: loss,
    suppliers: [{ payee: supplier, perPayment: units(capText), perWindow: 0n }],
    timing: has("daily") ? "daily" : "fast",
  });
  k[DRAWER] = drawer;
  saveKeys(k);
  console.log(`2/3 drawer created: ${drawer}`);
  await fundDrawer(pub, owner, drawer, first);
  console.log(`3/3 first allowance funded: ${t(first)} tUSD8\n`);
  await show(drawer);
  console.log(`\nNext: pnpm kibble try, then read docs/connect-your-agent.md\n`);
}

async function cmdTry() {
  const k = loadKeys();
  const drawer = drawerOf(k);
  const owner = wallet(k, "OWNER");
  const kibble = new KibbleAgent(pub, wallet(k, "AGENT"), drawer);
  const before = await kibble.status();
  // amounts follow the drawer's own limit: sell at a 20th of T, buy the input at 40% of that
  const price = before.limitT / 20n;
  const cost = (price * 4n) / 10n;
  const supplier = (flag("supplier") ?? dep.roles.SUPPLIER) as Address;
  if ((await tusd8(owner.account.address)) < price) fail(`The owner key needs ${t(price)} tUSD8 to act as the test buyer.`);
  console.log("\nA connection test: your own owner key plays the buyer, so this isn't real income.\n");
  const sale = newBillRef("try");
  const hash = await owner.writeContract({ address: dep.token, abi: erc20Abi, functionName: "approve", args: [drawer, price], type: "legacy" });
  await pub.waitForTransactionReceipt({ hash });
  await sendDrawer(pub, owner, drawer, "buy", [sale, price]);
  console.log(`1. a buyer paid ${t(price)} for an order`);
  const buy = await kibble.pay(supplier, fmt(cost, 6), newBillRef("input"));
  console.log(`2. your agent bought its input for ${t(cost)}: ${buy.status === "paid" ? "PAID" : buy.text}`);
  await sendDrawer(pub, owner, drawer, "ackDelivery", [sale]);
  console.log("3. the buyer confirmed delivery: the sale counts as earned value");
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const bad = await kibble.pay(stranger, fmt(before.limitT * 2n, 6), newBillRef("bad"));
  console.log(`4. your agent tried to send ${t(before.limitT * 2n)} to a stranger: ${bad.status === "paid" ? "PAID (unexpected!)" : bad.text}\n`);
  await show(drawer);
  console.log("");
}

try {
  if (command === "new") await cmdNew();
  else if (command === "try") await cmdTry();
  else if (command === "status") {
    const d = drawerOf(loadKeys());
    console.log(`\n${d} on ${chain.name}`);
    await show(d);
  } else if (command === "freeze") {
    const k = loadKeys();
    await sendDrawer(pub, wallet(k, "OWNER"), drawerOf(k), "freeze");
    console.log("Frozen. The agent can't pay anyone until you and the guardian resume it.");
  } else if (command === "resume") {
    const k = loadKeys();
    const d = drawerOf(k);
    const nonce = await pub.readContract({ address: d, abi: kibbleDrawerAbi, functionName: "resumeNonce" });
    const block = (await pub.getBlock()).timestamp;
    const wall = BigInt(Math.floor(Date.now() / 1000));
    const deadline = (block > wall ? block : wall) + 3_600n;
    const ownerSig = await signResume(wallet(k, "OWNER"), d, { nonce, deadline });
    const guardianSig = await signResume(wallet(k, "GUARDIAN"), d, { nonce, deadline });
    await sendDrawer(pub, wallet(k, "OWNER"), d, "resumeNow", [deadline, ownerSig, guardianSig]);
    await show(d);
  } else {
    console.log('\npnpm kibble new [--name "My agent"] [--loss 2] [--supplier 0x… --cap 0.05] [--daily]\npnpm kibble try | status | freeze | resume\n');
  }
} catch (e) {
  fail(e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e));
}
