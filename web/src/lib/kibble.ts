"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, parseAbiItem, type Address, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { buyerStats, STATES, REASONS, REASON_TEXT, fmt, kibbleDrawerAbi, readDrawer, type DrawerView, type ReasonName } from "@kibble/sdk";
import aevumDeployment from "../../../deployments/44005.json";
import { useNetwork } from "./network";

export type AgentName = "A" | "A_FIXED" | "B" | "B_FIXED" | "W";

export type Deployment = {
  chainId: number;
  token: Address;
  adminModule: Address;
  drawerImpl: Address;
  factory: Address;
  deployBlock: string;
  vault?: Address;
  drawers: Partial<Record<AgentName, Address>>;
  roles: Record<string, Address>;
};

/** The demo agents, as set up by `pnpm --filter agents setup-demo`. */
export const AGENTS: Record<AgentName, { label: string; mode: "FIXED" | "EARNED"; about: string }> = {
  A_FIXED: { label: "A′ summarizer (fixed limit)", mode: "FIXED", about: "Sells summaries, buys a model call per sale. A flat limit refilled every window." },
  A: { label: "A summarizer (Kibble)", mode: "EARNED", about: "The same agent and traffic. Its limit is earned from cleared sales." },
  B_FIXED: { label: "B′ bad reseller (fixed limit)", mode: "FIXED", about: "Its supplier's price is above its sale price. Keeps paying until a human reacts." },
  B: { label: "B bad reseller (Kibble)", mode: "EARNED", about: "The same losing strategy. The wallet walks Watch → Braked → Paused on its own." },
  W: { label: "W research agent (Kibble)", mode: "EARNED", about: "Sells nothing. Earns budget when a client signs that a report was accepted." },
};

/** The side-by-side pairs on the dashboard: fixed on the left, Kibble on the right. */
export const PAIRS: [AgentName, AgentName][] = [
  ["A_FIXED", "A"],
  ["B_FIXED", "B"],
];

const STATIC: Record<number, Deployment> = { 44005: aevumDeployment as Deployment };

/** The demo deployment on the app's network: built in for Aevum testnet, read from the repo for local chains. */
export function useDeployment() {
  const { net } = useNetwork();
  const chainId = net.chain.id;
  return useQuery({
    queryKey: ["kibble-deployment", chainId],
    queryFn: async (): Promise<Deployment | null> => {
      if (STATIC[chainId]) return STATIC[chainId];
      const r = await fetch(`/api/deployment/${chainId}`);
      return r.ok ? ((await r.json()) as Deployment) : null;
    },
    staleTime: 60_000,
  });
}

export function usePub(): PublicClient | undefined {
  const { net } = useNetwork();
  return usePublicClient({ chainId: net.chain.id }) as PublicClient | undefined;
}

/** Every demo drawer's snapshot, refreshed every few seconds. */
export function useDrawers(dep: Deployment | null | undefined) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-drawers", dep?.chainId, dep?.factory],
    enabled: Boolean(pub && dep),
    refetchInterval: 4_000,
    queryFn: async () => {
      const out: Partial<Record<AgentName, DrawerView>> = {};
      await Promise.all(
        (Object.entries(dep!.drawers) as [AgentName, Address][]).map(async ([name, addr]) => {
          out[name] = await readDrawer(pub!, addr);
        }),
      );
      const vault = dep!.vault
        ? await pub!.readContract({ address: dep!.token, abi: erc20Abi, functionName: "balanceOf", args: [dep!.vault] })
        : 0n;
      return { drawers: out, vault };
    },
  });
}

export function useDrawer(address: Address | undefined) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-drawer", address],
    enabled: Boolean(pub && address),
    refetchInterval: 4_000,
    queryFn: () => readDrawer(pub!, address!),
  });
}

/** Owner, guardian, agent and settings that the snapshot doesn't carry. */
export function useDrawerConfig(address: Address | undefined) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-drawer-config", address],
    enabled: Boolean(pub && address),
    refetchInterval: 15_000,
    queryFn: async () => {
      const read = <T,>(functionName: string) =>
        pub!.readContract({ address: address!, abi: kibbleDrawerAbi, functionName } as never) as Promise<T>;
      const [owner, guardian, agent, vault, maxWeeklyLoss, approvalThreshold, windowLength, incomeHold, delay, resumeNonce, approvalNonce] =
        await Promise.all([
          read<Address>("owner"),
          read<Address>("guardian"),
          read<Address>("agent"),
          read<Address>("vault"),
          read<bigint>("maxWeeklyLoss"),
          read<bigint>("approvalThreshold"),
          read<bigint>("windowLength"),
          read<bigint>("incomeHold"),
          read<bigint>("delay"),
          read<bigint>("resumeNonce"),
          read<bigint>("approvalNonce"),
        ]);
      return { owner, guardian, agent, vault, maxWeeklyLoss, approvalThreshold, windowLength, incomeHold, delay, resumeNonce, approvalNonce };
    },
  });
}

/** Who paid this drawer: distinct buyers, the biggest one's share, and the owner's own share. */
export function useBuyers(address: Address | undefined) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-buyers", address],
    enabled: Boolean(pub && address),
    refetchInterval: 60_000,
    queryFn: () => buyerStats(pub!, address!),
  });
}

export type Receipt = {
  id: number;
  payee: Address;
  amount: bigint;
  billRef: `0x${string}`;
  time: bigint;
  state: string;
  approvedBy: Address;
  limitT: bigint;
  windowValue: bigint;
  windowSpend: bigint;
};

/** The latest receipts, read from the drawer's storage (no log scanning). */
export function useReceipts(address: Address | undefined, count: bigint | undefined, limit = 25) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-receipts", address, count?.toString(), limit],
    enabled: Boolean(pub && address && count !== undefined),
    queryFn: async () => {
      const n = Number(count);
      const ids = Array.from({ length: Math.min(n, limit) }, (_, i) => n - i);
      return Promise.all(
        ids.map(async (id) => {
          const r = await pub!.readContract({ address: address!, abi: kibbleDrawerAbi, functionName: "receipt", args: [BigInt(id)] });
          return {
            id,
            payee: r.payee,
            amount: BigInt(r.amount),
            billRef: r.billRef,
            time: BigInt(r.time),
            state: STATES[r.state] ?? "?",
            approvedBy: r.approvedBy,
            limitT: BigInt(r.limitT),
            windowValue: BigInt(r.windowValue),
            windowSpend: BigInt(r.windowSpend),
          } satisfies Receipt;
        }),
      );
    },
  });
}

// ------------------------------------------------------------------------------- events

const TRACK = parseAbiItem(
  "event TrackRecord(uint256 indexed index, uint256 value, uint256 spend, int256 profit, uint256 limitT, uint8 state, uint256 strikes)",
);
const REFUSED = parseAbiItem("event Refused(bytes32 indexed fp, uint8 reason, address payee, uint256 amount, bytes32 billRef)");
const STATE_CHANGED = parseAbiItem("event StateChanged(uint8 from, uint8 to, uint8 why)");
const ALERT = parseAbiItem("event Alert(uint256 indexed windowIndex, uint256 loss)");
const WORK = parseAbiItem("event WorkCredited(bytes32 indexed jobId, address indexed acceptor, uint256 requested, uint256 credited)");

/** Aevum's RPC returns at most 1,000 blocks of logs per call. */
const LOG_SPAN = 1_000n;

/**
 * Scan the drawer's logs over the last `blocks` blocks (never before the deployment), in 1,000-block
 * steps. ~1 block per second on Aevum, so the default covers about the last 5.5 hours.
 */
export function useDrawerHistory(address: Address | undefined, deployBlock: bigint | undefined, blocks = 20_000n) {
  const pub = usePub();
  return useQuery({
    queryKey: ["kibble-history", address, blocks.toString()],
    enabled: Boolean(pub && address),
    refetchInterval: 60_000,
    queryFn: async () => {
      const head = await pub!.getBlockNumber();
      let from = head > blocks ? head - blocks : 0n;
      if (deployBlock !== undefined && from < deployBlock) from = deployBlock;
      const ranges: [bigint, bigint][] = [];
      for (let b = from; b <= head; b += LOG_SPAN) ranges.push([b, b + LOG_SPAN - 1n > head ? head : b + LOG_SPAN - 1n]);
      // 10 requests at a time, so a long range doesn't flood the RPC.
      const logs = [];
      for (let i = 0; i < ranges.length; i += 10) {
        const batch = await Promise.all(
          ranges
            .slice(i, i + 10)
            .map(([fromBlock, toBlock]) =>
              pub!.getLogs({ address: address!, events: [TRACK, REFUSED, STATE_CHANGED, ALERT, WORK], fromBlock, toBlock }),
            ),
        );
        logs.push(...batch.flat());
      }
      const windows = [];
      const feed: { block: bigint; tx: `0x${string}`; text: string }[] = [];
      for (const l of logs) {
        const a = l.args as Record<string, unknown>;
        if (l.eventName === "TrackRecord") {
          windows.push({
            index: a.index as bigint,
            value: a.value as bigint,
            spend: a.spend as bigint,
            profit: a.profit as bigint,
            limitT: a.limitT as bigint,
            state: STATES[Number(a.state)] ?? "?",
            strikes: a.strikes as bigint,
          });
        } else if (l.eventName === "Refused") {
          const r = (REASONS[Number(a.reason)] ?? "None") as ReasonName;
          feed.push({ block: l.blockNumber, tx: l.transactionHash, text: `${REASON_TEXT[r]} (${fmt(a.amount as bigint, 3)} to ${short(a.payee as Address)})` });
        } else if (l.eventName === "StateChanged") {
          const why = (REASONS[Number(a.why)] ?? "None") as ReasonName;
          feed.push({ block: l.blockNumber, tx: l.transactionHash, text: `${STATES[Number(a.from)]} → ${STATES[Number(a.to)]}: ${REASON_TEXT[why]}` });
        } else if (l.eventName === "Alert") {
          feed.push({ block: l.blockNumber, tx: l.transactionHash, text: `Alert: window ${a.windowIndex} lost ${fmt(a.loss as bigint, 3)}. A human should look.` });
        } else if (l.eventName === "WorkCredited") {
          feed.push({ block: l.blockNumber, tx: l.transactionHash, text: `Work accepted by ${short(a.acceptor as Address)}: credited ${fmt(a.credited as bigint, 3)}` });
        }
      }
      windows.sort((x, y) => Number(x.index - y.index));
      feed.sort((x, y) => Number(y.block - x.block));
      return { windows, feed, from, head };
    },
  });
}

// ------------------------------------------------------------------------------- formatting

export function short(a: string | undefined) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** tUSD8 with 3 decimals (testnet demo amounts are a tenth of the local ones). */
export function amt(v: bigint | undefined) {
  return v === undefined ? "…" : fmt(v, 3);
}

export function pct(bps: bigint | undefined) {
  return bps === undefined ? "…" : `${Number(bps) / 100}%`;
}
