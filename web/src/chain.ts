import { createPublicClient, defineChain, http, type Address } from "viem";
import { BOOK } from "./runs.js";

export const diana = defineChain({
  id: 9800,
  name: "qorechain-diana",
  // eth_getBalance counts 1e18 per QOR. Cosmos uqor counts 1e6.
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
});

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

export const publicClient = createPublicClient({ chain: diana, transport: http(diana.rpcUrls.default.http[0]) });

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const idleAbi = [
  {
    type: "function",
    name: "idle",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const readCap = 32n;

async function readOffer(id: bigint): Promise<LiveOffer> {
  const offer = await publicClient.readContract({
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
    publicClient.readContract({ address: BOOK, abi: bookAbi, functionName: "tokenA" }),
    publicClient.readContract({ address: BOOK, abi: bookAbi, functionName: "tokenB" }),
    publicClient.readContract({ address: BOOK, abi: bookAbi, functionName: "nextId" }),
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
  const block = await publicClient.getBlock({ blockNumber });
  return block.timestamp;
}

export async function head(): Promise<{ block: bigint; time: bigint }> {
  const block = await publicClient.getBlock();
  return { block: block.number, time: block.timestamp };
}

export type Holdings = {
  tokenA: Address;
  tokenB: Address;
  native: bigint;
  walletA: bigint;
  walletB: bigint;
  idleA: bigint;
  idleB: bigint;
};

export async function holdings(owner: Address): Promise<Holdings> {
  const { tokenA, tokenB } = await readTokens();
  const [native, walletA, walletB, idleA, idleB] = await Promise.all([
    publicClient.getBalance({ address: owner }),
    publicClient.readContract({ address: tokenA, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: tokenB, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: BOOK, abi: idleAbi, functionName: "idle", args: [owner, tokenA] }),
    publicClient.readContract({ address: BOOK, abi: idleAbi, functionName: "idle", args: [owner, tokenB] }),
  ]);
  return { tokenA, tokenB, native, walletA, walletB, idleA, idleB };
}

export async function allowanceOf(token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, BOOK],
  });
}
