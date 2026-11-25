// Pay-per-request over HTTP 402, in the style of x402. The buyer signs one EIP-3009 authorization and needs
// no gas; the seller relays it into its drawer. It isn't interoperable with standard x402 clients: the
// authorization is `ReceiveWithAuthorization` to the drawer, with the nonce bound to this bill, so nobody
// can submit it anywhere else or for another order.
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type LocalAccount, type PublicClient } from "viem";
import { saleNonce } from "./typed-data";

export const PAID_SCHEME = "kibble-receive";
export const TUSD8_ADDRESS: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";

export type PaymentTerms = {
  scheme: typeof PAID_SCHEME;
  network: string; // eip155:<chain id>
  asset: Address;
  payTo: Address; // the seller's drawer
  maxAmountRequired: string; // base units
  billRef: Hex;
  validBefore: string; // unix seconds
  description: string;
};

export type Payment = { scheme: typeof PAID_SCHEME; billRef: Hex; from: Address; validBefore: string; signature: Hex };

const RECEIVE_TYPEHASH = keccak256(
  toHex("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
);
const domainSeparatorAbi = [{ type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }] as const;

const encode64 = (x: unknown) => btoa(JSON.stringify(x));
export function decodePayment(header: string): unknown {
  try {
    return JSON.parse(atob(header));
  } catch {
    return undefined;
  }
}

/** Sign the buyer's side. The nonce is computed here, never taken from the seller. */
export async function signPayment(pub: PublicClient, account: LocalAccount, t: PaymentTerms): Promise<Payment> {
  if (!account.sign) throw new Error("this account can't sign a digest");
  const domain = await pub.readContract({ address: t.asset, abi: domainSeparatorAbi, functionName: "DOMAIN_SEPARATOR" });
  const struct = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      [RECEIVE_TYPEHASH, account.address, t.payTo, BigInt(t.maxAmountRequired), 0n, BigInt(t.validBefore), saleNonce(t.payTo, t.billRef)],
    ),
  );
  const signature = await account.sign({ hash: keccak256(`0x1901${domain.slice(2)}${struct.slice(2)}` as Hex) });
  return { scheme: PAID_SCHEME, billRef: t.billRef, from: account.address, validBefore: t.validBefore, signature };
}

/**
 * fetch() that pays a 402 once, up to `maxPrice` (base units), and only in the token you expect.
 * Pass `payTo` when you know the seller's drawer.
 */
export async function paidFetch(
  url: string,
  init: RequestInit,
  opts: { pub: PublicClient; account: LocalAccount; maxPrice: bigint; asset?: Address; payTo?: Address },
): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 402) return first;
  const body = (await first.json()) as { accepts?: PaymentTerms[] };
  const t = body.accepts?.find((x) => x.scheme === PAID_SCHEME);
  if (!t) throw new Error("the seller offers no payment this client understands");
  const chainId = await opts.pub.getChainId();
  if (t.network !== `eip155:${chainId}`) throw new Error(`the seller wants payment on ${t.network}, not chain ${chainId}`);
  if (t.asset.toLowerCase() !== (opts.asset ?? TUSD8_ADDRESS).toLowerCase()) throw new Error("the seller wants a different token");
  if (opts.payTo && t.payTo.toLowerCase() !== opts.payTo.toLowerCase()) throw new Error("the seller's drawer isn't the one you expected");
  if (!/^\d{1,30}$/.test(t.maxAmountRequired) || BigInt(t.maxAmountRequired) > opts.maxPrice) throw new Error("the price is above your limit");
  const payment = await signPayment(opts.pub, opts.account, t);
  const headers = new Headers(init.headers);
  headers.set("x-payment", encode64(payment));
  return fetch(url, { ...init, headers });
}
