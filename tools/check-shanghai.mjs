#!/usr/bin/env node
// Fails if any contract compiled from contracts/src uses an opcode Aevum (Shanghai EVM) doesn't have.
// Usage: node tools/check-shanghai.mjs [contracts/out]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CANCUN_ONLY = { 0x49: "BLOBHASH", 0x4a: "BLOBBASEFEE", 0x5c: "TLOAD", 0x5d: "TSTORE", 0x5e: "MCOPY" };
const outDir = process.argv[2] ?? "contracts/out";

function* artifacts(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* artifacts(p);
    else if (name.endsWith(".json")) yield p;
  }
}

// Walk real instructions, skipping PUSH data and the trailing CBOR metadata.
function findBad(hex) {
  const code = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (code.length === 0) return [];
  const metaLen = code.length >= 2 ? code.readUInt16BE(code.length - 2) + 2 : 0;
  const end = metaLen < code.length ? code.length - metaLen : code.length;
  const bad = [];
  // A contract that deploys another (e.g. a factory with `new X()`) embeds X's creation code, which
  // ends in X's own CBOR metadata: a 32-byte IPFS hash whose bytes can look like any opcode. Skip
  // each embedded block: a2 64 "ipfs" 58 22 <34-byte multihash> 64 "solc" 43 <3 bytes> 00 33.
  const META_START = Buffer.from("a264697066735822", "hex");
  const META_TOTAL = 53;
  for (let i = 0; i < end; i++) {
    if (code[i] === 0xa2 && code.subarray(i, i + 8).equals(META_START)) {
      i += META_TOTAL - 1;
      continue;
    }
    const op = code[i];
    if (CANCUN_ONLY[op]) bad.push(`${CANCUN_ONLY[op]} at byte ${i}`);
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
  }
  return bad;
}

let checked = 0;
let failed = 0;
for (const file of artifacts(outDir)) {
  const a = JSON.parse(readFileSync(file, "utf8"));
  const source = Object.keys(a.metadata?.settings?.compilationTarget ?? {})[0] ?? "";
  if (!source.startsWith("src/")) continue; // only our contracts, not forge-std/test helpers
  for (const [kind, hex] of [["runtime", a.deployedBytecode?.object], ["creation", a.bytecode?.object]]) {
    if (!hex || hex === "0x") continue;
    checked++;
    const bad = findBad(hex);
    if (bad.length) {
      failed++;
      console.error(`✗ ${source} (${kind}): ${bad.join(", ")}`);
    }
  }
}
if (checked === 0) {
  console.error(`No artifacts from src/ found in ${outDir}. Run \`forge build\` first.`);
  process.exit(1);
}
if (failed) {
  console.error("\nThese opcodes don't exist on Aevum. Set evm_version = \"shanghai\" in foundry.toml.");
  process.exit(1);
}
console.log(`✓ ${checked} bytecode blobs checked: Shanghai-safe.`);
