import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** EIP-712 domain of a drawer. Every clone has its own address, so signatures are bound to one drawer. */
export function drawerDomain(chainId: number, drawer: Address) {
  return { name: "Kibble Drawer", version: "1", chainId, verifyingContract: drawer } as const;
}

export const payApprovalTypes = {
  PayApproval: [
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "billRef", type: "bytes32" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const workAcceptedTypes = {
  WorkAccepted: [
    { name: "jobId", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const resumeTypes = {
  Resume: [
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** fp = keccak256(abi.encode(payee, amount, billRef)), exactly as the drawer computes it. */
export function fingerprint(payee: Address, amount: bigint, billRef: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes32" }], [payee, amount, billRef]),
  );
}

/** EIP-3009 nonce a buyer signs for `billRef` (buyWithAuthorization). */
export function saleNonce(drawer: Address, billRef: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [drawer, billRef]));
}

/** A readable, unique bytes32 bill reference: "<prefix>:<random>" hashed. */
export function newBillRef(prefix = "bill"): Hex {
  const rand = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  return keccak256(new TextEncoder().encode(`${prefix}:${hex}`));
}
