import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The demo agents. Each pair runs the same traffic: the left side FIXED, the right side EARNED. */
export const AGENTS = {
  A: { label: "A: summarizer (Kibble)", mode: "EARNED", agentRole: "AGENT_A" },
  A_FIXED: { label: "A': summarizer (fixed limit)", mode: "FIXED", agentRole: "AGENT_A" },
  B: { label: "B: bad reseller (Kibble)", mode: "EARNED", agentRole: "AGENT_B" },
  B_FIXED: { label: "B': bad reseller (fixed limit)", mode: "FIXED", agentRole: "AGENT_B" },
  W: { label: "W: research agent, paid by accepted work (Kibble)", mode: "EARNED", agentRole: "AGENT_A" },
} as const;
export type AgentName = keyof typeof AGENTS;

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

export function deploymentPath(chainId: number) {
  return join(ROOT, "deployments", `${chainId}.json`);
}

export function loadDeployment(chainId: number): Deployment | undefined {
  const p = deploymentPath(chainId);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Deployment) : undefined;
}

export function requireDeployment(chainId: number): Deployment {
  const d = loadDeployment(chainId);
  if (!d?.vault || !d.drawers.A) {
    throw new Error(`No demo deployment for chain ${chainId}. Run: pnpm --filter agents setup-demo`);
  }
  return d;
}

export function saveDeployment(d: Deployment) {
  const p = deploymentPath(d.chainId);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
}
