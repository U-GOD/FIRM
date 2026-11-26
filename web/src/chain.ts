import { createPublicClient, http, type Address } from "viem";
import { BOOK } from "./runs.js";

const diana = {
  id: 9800,
  name: "qorechain-diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 6 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
} as const;

const bookAbi = [
  {
    type: "function",
    name: "tokenA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenB",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "nextId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "offers",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "maker", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "startPrice", type: "uint256" },
      { name: "endPrice", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cancelDelay", type: "uint64" },
      { name: "feeBps", type: "uint16" },
      { name: "feeRecipient", type: "address" },
      { name: "cancelReadyAt", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
] as const;

export type LiveOffer = {
  id: bigint;
  maker: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  recipient: Address;
  cancelDelay: bigint;
  feeBps: number;
  feeRecipient: Address;
  cancelReadyAt: bigint;
  status: number;
};

export type BookRead = {
  tokenA: Address;
  tokenB: Address;
  nextId: bigint;
  offers: LiveOffer[];
  truncated: boolean;
};

const client = createPublicClient({ chain: diana, transport: http(diana.rpcUrls.default.http[0]) });

const readCap = 32n;

async function readOffer(id: bigint): Promise<LiveOffer> {
  const offer = await client.readContract({
    address: BOOK,
    abi: bookAbi,
    functionName: "offers",
    args: [id],
  });
  return {
    id,
    maker: offer[0],
    tokenIn: offer[1],
    tokenOut: offer[2],
    amountIn: offer[3],
    startPrice: offer[4],
    endPrice: offer[5],
    startTime: offer[6],
    endTime: offer[7],
    recipient: offer[8],
    cancelDelay: BigInt(offer[9]),
    feeBps: Number(offer[10]),
    feeRecipient: offer[11],
    cancelReadyAt: BigInt(offer[12]),
    status: Number(offer[13]),
  };
}

async function readTokens(): Promise<{ tokenA: Address; tokenB: Address; nextId: bigint }> {
  const [tokenA, tokenB, nextId] = await Promise.all([
    client.readContract({ address: BOOK, abi: bookAbi, functionName: "tokenA" }),
    client.readContract({ address: BOOK, abi: bookAbi, functionName: "tokenB" }),
    client.readContract({ address: BOOK, abi: bookAbi, functionName: "nextId" }),
  ]);
  return { tokenA, tokenB, nextId };
}

export async function readBook(): Promise<BookRead> {
  const { tokenA, tokenB, nextId } = await readTokens();
  const count = nextId > 0n ? nextId - 1n : 0n;
  const cap = count > readCap ? readCap : count;
  const ids = Array.from({ length: Number(cap) }, (_, index) => BigInt(index + 1));
  const read = await Promise.all(ids.map((id) => readOffer(id)));
  return {
    tokenA,
    tokenB,
    nextId,
    offers: read.filter((offer) => offer.status !== 0),
    truncated: count > cap,
  };
}

export async function readOne(id: bigint): Promise<{ tokenA: Address; tokenB: Address; nextId: bigint; offer: LiveOffer | null }> {
  const { tokenA, tokenB, nextId } = await readTokens();
  if (id < 1n || id >= nextId) return { tokenA, tokenB, nextId, offer: null };
  const offer = await readOffer(id);
  if (offer.status === 0) return { tokenA, tokenB, nextId, offer: null };
  return { tokenA, tokenB, nextId, offer };
}

export async function blockTime(blockNumber: bigint): Promise<bigint> {
  const block = await client.getBlock({ blockNumber });
  return block.timestamp;
}
