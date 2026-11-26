import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Registry, type EncodeObject, type GeneratedType } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import { BinaryWriter } from "cosmjs-types/binary";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import {
  createPublicClient,
  encodeFunctionData,
  hexToBytes,
  http,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  DEFAULT_GAS_PRICE,
  EthNativeSigner,
  RestClient,
  calculateFee,
  createClient,
  crossvm,
  deriveUnifiedAccount,
  exactHybridGas,
  generateMnemonic,
  qorechainRegistryTypes,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { diana } from "./chain.js";
import { DIANA_RPC, FETH, FUSD } from "./message.js";

export const REST = "https://api-testnet.qore.host";
export const CHAIN_ID = "qorechain-diana";
export const STATE_PATH = "broadcast/offer-a.json";
export const CONVERT_TYPE = "/cosmos.evm.erc20.v1.MsgConvertCoin";
export const ATTACK_GAS = 8_000_000n;
export const ATTACK_FEE = 200_000_000_000n;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;

const SIGNATURE_BYTES = 4627;

export const erc20Abi = [
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
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const bookAbi = [
  { type: "error", name: "BadSignature", inputs: [] },
  { type: "error", name: "BadKey", inputs: [] },
  { type: "error", name: "NotOpen", inputs: [] },
  { type: "error", name: "Shortfall", inputs: [] },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "startPrice", type: "uint256" },
          { name: "endPrice", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "cancelDelay", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "feeRecipient", type: "address" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "fill",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeCancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "startCancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "maker", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
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
  {
    type: "function",
    name: "reserved",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "actionNonces",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nextId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type OfferState = {
  fund?: string;
  fillerRegister?: string;
  convertFusd?: string;
  fillerApprove?: string;
  convertFeth?: string;
  approve?: string;
  deposit?: string;
  clear?: string;
  open?: string;
  offerId?: string;
  attackWindow?: string;
  attackCancel?: string;
  attackPrice?: string;
  attackWithdraw?: string;
  attackClose?: string;
  startCancel?: string;
  fillerFethBefore?: string;
  recipientFusdBefore?: string;
  fill?: string;
  gross?: string;
  unitPrice?: string;
  fillHeight?: string;
};

export type Live = {
  transport: StargateClient;
  publicClient: PublicClient;
  maker: UnifiedAccount;
  filler: UnifiedAccount;
  book: Address;
  state: OfferState;
  save: () => void;
};

const convertType: GeneratedType = {
  encode(
    message: { coin: { denom: string; amount: string }; receiver: string; sender: string },
    writer = new BinaryWriter(),
  ) {
    const coin = Coin.encode(Coin.fromPartial(message.coin)).finish();
    writer.uint32(10).bytes(coin);
    writer.uint32(18).string(message.receiver);
    writer.uint32(26).string(message.sender);
    return writer;
  },
  decode() {
    throw new Error("MsgConvertCoin decode is unused");
  },
  fromPartial(object: { coin: { denom: string; amount: string }; receiver: string; sender: string }) {
    return object;
  },
};

export function loadEnvFile(): void {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function remember(name: string, value: string): void {
  const current = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  if (new RegExp(`^${name}=`, "m").test(current)) return;
  writeFileSync(
    ".env",
    `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${name}="${value}"\n`,
  );
}

export function loadState(): OfferState {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as OfferState;
}

export function saveState(state: OfferState): void {
  mkdirSync("broadcast", { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export function bookAddress(): Address {
  const book = process.env.BOOK_ADDRESS?.trim();
  if (!book) throw new Error("BOOK_ADDRESS is not set");
  return book as Address;
}

export async function accounts(): Promise<{ maker: UnifiedAccount; filler: UnifiedAccount }> {
  const makerPhrase = process.env.MAKER_MNEMONIC?.trim();
  if (!makerPhrase) throw new Error("MAKER_MNEMONIC is not set");
  if (!process.env.FILLER_MNEMONIC?.trim()) {
    const created = generateMnemonic();
    remember("FILLER_MNEMONIC", created);
    process.env.FILLER_MNEMONIC = created;
  }
  const maker = await deriveUnifiedAccount(makerPhrase);
  const filler = await deriveUnifiedAccount(process.env.FILLER_MNEMONIC!.trim());
  if (filler.evm.toLowerCase() === maker.evm.toLowerCase()) {
    throw new Error("filler and maker are the same key");
  }
  return { maker, filler };
}

export function publicClient(): PublicClient {
  return createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
}

export function signMlDsa(message: Hex, secretKey: Uint8Array): Hex {
  const signature = ml_dsa87.sign(hexToBytes(message), secretKey, {
    context: new Uint8Array(0),
    extraEntropy: false,
  });
  if (signature.length !== SIGNATURE_BYTES) {
    throw new Error(`signature length ${signature.length}, expected ${SIGNATURE_BYTES}`);
  }
  return toHex(signature);
}

export function verifyMlDsa(signature: Hex, message: Hex, publicKey: Uint8Array): void {
  const ok = ml_dsa87.verify(hexToBytes(signature), hexToBytes(message), publicKey, {
    context: new Uint8Array(0),
  });
  if (!ok) throw new Error("noble rejected the signature");
}

/** Same branch as `Curve.price`. */
export function curvePrice(startPrice: bigint, endPrice: bigint, startTime: bigint, endTime: bigint, t: bigint): bigint {
  if (endTime <= startTime) throw new Error("unordered time");
  if (t <= startTime) return startPrice;
  if (t >= endTime) return endPrice;
  const elapsed = t - startTime;
  const duration = endTime - startTime;
  if (endPrice >= startPrice) return startPrice + ((endPrice - startPrice) * elapsed) / duration;
  return startPrice - ((startPrice - endPrice) * elapsed) / duration;
}

export function curvePayment(amountIn: bigint, unitPrice: bigint): bigint {
  return (amountIn * unitPrice) / 10n ** 18n;
}

export function evmCall(sender: string, target: Address, data: Hex): EncodeObject {
  return crossvm.crossVmCall({
    sender,
    sourceVm: "cosmwasm",
    targetVm: "evm",
    targetContract: target,
    payload: hexToBytes(data),
    funds: [],
    async: false,
    asyncGasLimit: "0",
    asyncMaxFactor: "0",
  });
}

export function convertMsg(sender: string, receiver: string, denom: string, amount: bigint): EncodeObject {
  return {
    typeUrl: CONVERT_TYPE,
    value: {
      coin: { denom, amount: amount.toString() },
      receiver: receiver.toLowerCase(),
      sender,
    },
  };
}

export function approveData(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

async function accountSeq(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const rest = new RestClient(REST);
  const body = await rest.get<{ account?: { account_number?: string; sequence?: string } }>(
    `/cosmos/auth/v1beta1/accounts/${address}`,
  );
  if (!body.account?.account_number) throw new Error(`${address} is not on chain`);
  return {
    accountNumber: BigInt(body.account.account_number),
    sequence: BigInt(body.account.sequence ?? "0"),
  };
}

async function simulate(txRawBytes: Uint8Array): Promise<number> {
  const response = await fetch(`${REST}/cosmos/tx/v1beta1/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx_bytes: Buffer.from(txRawBytes).toString("base64") }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`simulate ${response.status}: ${text.slice(0, 800)}`);
  const body = JSON.parse(text) as { gas_info?: { gas_used?: string } };
  const used = Number(body.gas_info?.gas_used ?? "");
  if (!Number.isSafeInteger(used) || used <= 0) throw new Error(`simulate returned no gas_used: ${text.slice(0, 400)}`);
  return used;
}

export async function send(
  transport: StargateClient,
  account: UnifiedAccount,
  messages: readonly EncodeObject[],
  signMode: "hybrid" | "classical",
  probeGas = 5_000_000,
): Promise<string> {
  const { accountNumber, sequence } = await accountSeq(account.cosmos);
  const types = new Registry(qorechainRegistryTypes);
  types.register("/cosmos.bank.v1beta1.MsgSend", MsgSend);
  types.register(CONVERT_TYPE, convertType);
  const signer = new EthNativeSigner(account, { rest: REST, signMode, registry: types });
  const signBytesVersion = signMode === "hybrid" ? await signer.resolveSignBytesVersion(CHAIN_ID) : undefined;
  const probe = signer.sign({
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    messages,
    fee: calculateFee(probeGas, DEFAULT_GAS_PRICE),
    signBytesVersion,
  });
  const gas = exactHybridGas(await simulate(probe.txRawBytes));
  const result = await signer.signAndBroadcast(transport, {
    chainId: CHAIN_ID,
    accountNumber,
    sequence,
    messages,
    fee: calculateFee(gas, DEFAULT_GAS_PRICE),
    signBytesVersion,
  });
  return result.transactionHash;
}

type TxBody = {
  tx_response?: {
    code?: number;
    height?: string;
    raw_log?: string;
    events?: { type?: string; attributes?: { key?: string; value?: string }[] }[];
  };
};

export async function txBody(hash: string): Promise<TxBody> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${REST}/cosmos/tx/v1beta1/txs/${hash}`);
    if (response.status === 404) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!response.ok) throw new Error(`tx ${hash} query failed: ${response.status}`);
    return (await response.json()) as TxBody;
  }
  throw new Error(`tx ${hash} was not indexed`);
}

export async function confirm(hash: string, hybrid: boolean): Promise<string> {
  const body = await txBody(hash);
  if (body.tx_response?.code !== 0) {
    throw new Error(`tx ${hash} code ${body.tx_response?.code}: ${body.tx_response?.raw_log?.slice(0, 500)}`);
  }
  const height = body.tx_response.height ?? "";
  if (!hybrid) return height;
  const event = body.tx_response.events?.find((item) => item.type === "pqc_hybrid_verify");
  const status = event?.attributes?.find((item) => item.key === "status")?.value;
  if (status !== "verified") throw new Error(`tx ${hash} pqc_hybrid_verify is ${status ?? "missing"}`);
  return height;
}

export async function bankBalances(address: string): Promise<{ denom: string; amount: string }[]> {
  const response = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}`);
  if (!response.ok) throw new Error(`balances ${address} failed: ${response.status}`);
  const body = (await response.json()) as { balances?: { denom: string; amount: string }[] };
  return body.balances ?? [];
}

export function denomFor(balances: { denom: string; amount: string }[], token: Address): string {
  const needle = token.toLowerCase();
  const coin = balances.find((item) => item.denom.toLowerCase().endsWith(needle));
  if (!coin) throw new Error(`no bank denom ends with ${token}`);
  return coin.denom;
}

export type StoredOffer = {
  maker: Address;
  amountIn: bigint;
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  cancelReadyAt: bigint;
  status: number;
};

export async function readOffer(client: PublicClient, book: Address, id: bigint): Promise<StoredOffer> {
  const offer = await client.readContract({ address: book, abi: bookAbi, functionName: "offers", args: [id] });
  return {
    maker: offer[0],
    amountIn: offer[3],
    startPrice: offer[4],
    endPrice: offer[5],
    startTime: offer[6],
    endTime: offer[7],
    cancelReadyAt: offer[12],
    status: offer[13],
  };
}

export async function erc20Balance(client: PublicClient, token: Address, account: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

export async function connect(): Promise<StargateClient> {
  const client = createClient({ network: "testnet" });
  if (client.network.chainId !== CHAIN_ID) throw new Error(`client chain is ${client.network.chainId}`);
  return StargateClient.connect(client.network.endpoints.rpc);
}

export const FETH_TOKEN = FETH;
export const FUSD_TOKEN = FUSD;
