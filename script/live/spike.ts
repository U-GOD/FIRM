import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  hexToBytes,
  http,
  keccak256,
  toBytes,
  toHex,
  type Hex,
} from "viem";
import { diana } from "./chain.js";
import { reportDeposit } from "./deposit.js";
import {
  CHAIN_ID,
  DIANA_RPC,
  PQC_VERIFY,
  VECTOR_BOOK,
  VECTOR_SEED_LABEL,
  encodeCancel,
  encodeOffer,
  encodeWithdraw,
  vectorCancel,
  vectorOffer,
  vectorWithdraw,
} from "./message.js";

const VECTOR_PATH = resolve("test/vectors/offer.json");
const PUBLIC_KEY_BYTES = 2592;
const SIGNATURE_BYTES = 4627;

const pqcAbi = [
  {
    type: "function",
    name: "pqcVerify",
    stateMutability: "view",
    inputs: [
      { name: "pubkey", type: "bytes" },
      { name: "signature", type: "bytes" },
      { name: "message", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

type Signed = {
  message: Hex;
  signature: Hex;
};

type VectorFile = {
  note: string;
  chainId: string;
  book: Hex;
  seedLabel: string;
  publicKey: Hex;
  offer: Signed & { terms: Record<string, string> };
  cancel: Signed & { terms: Record<string, string> };
  withdraw: Signed & { terms: Record<string, string> };
};

const signOpts = { context: new Uint8Array(0), extraEntropy: false as const };

function vectorSeed(): Uint8Array {
  return hexToBytes(keccak256(toBytes(VECTOR_SEED_LABEL)));
}

function sign(message: Hex, secretKey: Uint8Array): Hex {
  const signature = ml_dsa87.sign(hexToBytes(message), secretKey, signOpts);
  if (signature.length !== SIGNATURE_BYTES) {
    throw new Error(`signature length ${signature.length}, expected ${SIGNATURE_BYTES}`);
  }
  return toHex(signature);
}

function termsToJson(terms: Record<string, bigint | Hex>): Record<string, string> {
  return Object.fromEntries(Object.entries(terms).map(([key, value]) => [key, value.toString()]));
}

function buildVector(secretKey: Uint8Array, publicKey: Hex): VectorFile {
  const offerMessage = encodeOffer(vectorOffer(), VECTOR_BOOK, CHAIN_ID);
  const cancelMessage = encodeCancel(vectorCancel(), VECTOR_BOOK, CHAIN_ID);
  const withdrawMessage = encodeWithdraw(vectorWithdraw(), VECTOR_BOOK, CHAIN_ID);
  return {
    note: "Public test vector. This key is not a maker and must not hold inventory.",
    chainId: CHAIN_ID.toString(),
    book: VECTOR_BOOK,
    seedLabel: VECTOR_SEED_LABEL,
    publicKey,
    offer: { terms: termsToJson(vectorOffer()), message: offerMessage, signature: sign(offerMessage, secretKey) },
    cancel: {
      terms: termsToJson(vectorCancel()),
      message: cancelMessage,
      signature: sign(cancelMessage, secretKey),
    },
    withdraw: {
      terms: termsToJson(vectorWithdraw()),
      message: withdrawMessage,
      signature: sign(withdrawMessage, secretKey),
    },
  };
}

function localVerify(vector: VectorFile, publicKey: Uint8Array): void {
  for (const name of ["offer", "cancel", "withdraw"] as const) {
    const row = vector[name];
    const ok = ml_dsa87.verify(hexToBytes(row.signature), hexToBytes(row.message), publicKey, signOpts);
    if (!ok) throw new Error(`noble rejected the ${name} signature`);
  }
  if (vector.offer.message.length !== 2 + 512 * 2) {
    throw new Error(`offer message is ${vector.offer.message.length} hex chars, expected 1026`);
  }
}

async function dianaVerify(message: Hex, signature: Hex, publicKey: Hex): Promise<boolean> {
  const data = encodeFunctionData({
    abi: pqcAbi,
    functionName: "pqcVerify",
    args: [publicKey, signature, message],
  });
  const client = createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
  const raw = await client.call({ to: PQC_VERIFY, data, gas: 3_000_000n });
  if (!raw.data || raw.data === "0x" || raw.data.length < 66) {
    throw new Error(`pqcVerify returned empty data (${raw.data ?? "none"}). The precompile is not active.`);
  }
  return decodeFunctionResult({ abi: pqcAbi, functionName: "pqcVerify", data: raw.data });
}

function flipLastBit(signature: Hex): Hex {
  const bytes = hexToBytes(signature);
  bytes[bytes.length - 1] ^= 0x01;
  return toHex(bytes);
}

async function assertTokens(): Promise<void> {
  const client = createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
  const expected = [
    { address: vectorOffer().tokenIn, symbol: "fETH", decimals: 18 },
    { address: vectorOffer().tokenOut, symbol: "fUSD", decimals: 6 },
  ] as const;
  for (const token of expected) {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    if (symbol !== token.symbol || decimals !== token.decimals) {
      throw new Error(`${token.address} is ${symbol} with ${decimals} decimals, expected ${token.symbol}/${token.decimals}`);
    }
  }
}

async function assertPrecompiles(): Promise<void> {
  const response = await fetch("https://api-testnet.qore.host/cosmos/evm/vm/v1/params");
  if (!response.ok) throw new Error(`params request failed: ${response.status}`);
  const body = (await response.json()) as { params?: { active_static_precompiles?: string[] } };
  const active = body.params?.active_static_precompiles ?? [];
  const wanted = PQC_VERIFY.toLowerCase();
  if (!active.some((address) => address.toLowerCase() === wanted)) {
    throw new Error(`0x…0a01 is not active. Live list: ${active.join(", ") || "empty"}`);
  }
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const keys = ml_dsa87.keygen(vectorSeed());
  if (keys.publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`public key length ${keys.publicKey.length}, expected ${PUBLIC_KEY_BYTES}`);
  }
  const publicKey = toHex(keys.publicKey);
  const built = buildVector(keys.secretKey, publicKey);
  localVerify(built, keys.publicKey);

  if (write) {
    mkdirSync(dirname(VECTOR_PATH), { recursive: true });
    writeFileSync(VECTOR_PATH, `${JSON.stringify(built, null, 2)}\n`);
    console.log(`wrote ${VECTOR_PATH}`);
  } else {
    const stored = JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as VectorFile;
    if (stored.offer.message !== built.offer.message) throw new Error("stored offer message does not match the encoder");
    if (stored.offer.signature !== built.offer.signature) throw new Error("stored offer signature does not match a deterministic re-sign");
    if (stored.cancel.signature !== built.cancel.signature) throw new Error("stored cancel signature does not match");
    if (stored.withdraw.signature !== built.withdraw.signature) throw new Error("stored withdraw signature does not match");
    localVerify(stored, keys.publicKey);
  }

  await assertPrecompiles();
  await assertTokens();
  const good = await dianaVerify(built.offer.message, built.offer.signature, publicKey);
  const bad = await dianaVerify(built.offer.message, flipLastBit(built.offer.signature), publicKey);
  if (good !== true) throw new Error("Diana rejected a signature noble accepted");
  if (bad !== false) throw new Error("Diana accepted a signature with one flipped bit");

  console.log("noble: offer, cancel, and withdraw verify");
  console.log("diana: good signature true, flipped bit false");
  console.log("tokens: fETH 18 decimals, fUSD 6 decimals");
  console.log(await reportDeposit());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
