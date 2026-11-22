import type { Chain } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export type NetworkKey = "aevum" | "fork" | "local";

export interface Network {
  key: NetworkKey;
  /** Short name for the network switcher. */
  label: string;
  chain: Chain;
  /** Explorer links only make sense on the real testnet. */
  hasExplorer: boolean;
}

const all: Record<NetworkKey, Network> = {
  aevum: {
    key: "aevum",
    label: "Aevum testnet",
    chain: aevumTestnet,
    hasExplorer: true,
  },
  fork: {
    key: "fork",
    label: "Local fork",
    chain: aevumFork,
    hasExplorer: false,
  },
  local: {
    key: "local",
    label: "Local anvil",
    chain: localAnvil,
    hasExplorer: false,
  },
};

const requested = (process.env.NEXT_PUBLIC_NETWORKS ?? "aevum")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is NetworkKey => k in all);

/** The networks the app offers, in the order of NEXT_PUBLIC_NETWORKS. The first one is the default. */
export const networks: [Network, ...Network[]] = (() => {
  const keys = [...new Set(requested)];
  const list = (keys.length ? keys : (["aevum"] as NetworkKey[])).map((k) => all[k]);
  return list as [Network, ...Network[]];
})();

export const defaultNetwork = networks[0];

export function networkByChainId(chainId: number | undefined): Network | undefined {
  return networks.find((n) => n.chain.id === chainId);
}

export function networkByKey(key: string | null | undefined): Network | undefined {
  return networks.find((n) => n.key === key);
}

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined;

/** Where the "Source" links and the clone command on the Docs page point. Override it for a fork or a preview deploy. */
export const repoUrl = (process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/mithileshofficial06/kibble").replace(/\.git$|\/+$/g, "");
