import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  encodeFunctionData,
  http,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deriveEvmAccount } from "@qorechain/sdk";
import { diana } from "./chain.js";
import { ATTACK_FEE, ATTACK_GAS, FETH_TOKEN, bookAbi, loadEnvFile, type OfferState } from "./book.js";
import { DIANA_RPC } from "./message.js";

const BLOB = toHex(new Uint8Array(4627).fill(0x11));

/**
 * The maker's secp256k1 key only. This file does not derive or sign with ML-DSA.
 * Cancel and withdraw carry a 4,627-byte blob that is not an ML-DSA signature.
 * The price call uses `fill(uint256,uint256)`, which the book does not have.
 */
export async function runAttacker(book: Address, offerId: bigint, state: OfferState, save: () => void): Promise<void> {
  loadEnvFile();
  const phrase = process.env.MAKER_MNEMONIC?.trim();
  if (!phrase) throw new Error("MAKER_MNEMONIC is not set");
  const classical = await deriveEvmAccount(phrase);
  const account = privateKeyToAccount(toHex(classical.privateKey));
  const publicClient = createPublicClient({ chain: diana, transport: http(DIANA_RPC) });
  const wallet = createWalletClient({ account, chain: diana, transport: http(DIANA_RPC) });

  const cancelData = encodeFunctionData({
    abi: bookAbi,
    functionName: "startCancel",
    args: [offerId, BLOB],
  });
  const priceData = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "fill",
        stateMutability: "nonpayable",
        inputs: [
          { name: "id", type: "uint256" },
          { name: "price", type: "uint256" },
        ],
        outputs: [],
      },
    ],
    functionName: "fill",
    args: [offerId, 1n],
  });
  const withdrawData = encodeFunctionData({
    abi: bookAbi,
    functionName: "withdraw",
    args: [account.address, FETH_TOKEN, 1n, BLOB],
  });
  const emptyCancel = encodeFunctionData({
    abi: bookAbi,
    functionName: "startCancel",
    args: [offerId, "0x"],
  });
  const emptyWithdraw = encodeFunctionData({
    abi: bookAbi,
    functionName: "withdraw",
    args: [account.address, FETH_TOKEN, 1n, "0x"],
  });

  const emptyCancelError = await revertedName(publicClient, book, account.address, emptyCancel);
  const emptyWithdrawError = await revertedName(publicClient, book, account.address, emptyWithdraw);
  if (emptyCancelError !== "BadSignature" || emptyWithdrawError !== "BadSignature") {
    throw new Error(`empty signatures returned ${emptyCancelError} and ${emptyWithdrawError}`);
  }
  console.log("empty startCancel simulation BadSignature");
  console.log("empty withdraw simulation BadSignature");

  if (!state.attackCancel) {
    await expectNamedRevert(publicClient, book, account.address, cancelData, "BadSignature");
    state.attackCancel = await revertedTx(wallet, publicClient, book, cancelData, account);
    save();
    console.log(`attack cancel ${state.attackCancel}`);
  }
  if (!state.attackPrice) {
    await expectAnyRevert(publicClient, book, account.address, priceData);
    state.attackPrice = await revertedTx(wallet, publicClient, book, priceData, account);
    save();
    console.log(`attack price ${state.attackPrice}`);
  }
  if (!state.attackWithdraw) {
    await expectNamedRevert(publicClient, book, account.address, withdrawData, "BadSignature");
    state.attackWithdraw = await revertedTx(wallet, publicClient, book, withdrawData, account);
    save();
    console.log(`attack withdraw ${state.attackWithdraw}`);
  }
}

async function revertedName(client: ReturnType<typeof createPublicClient>, book: Address, account: Address, data: Hex): Promise<string> {
  try {
    await client.call({ to: book, data, account, gas: ATTACK_GAS });
  } catch (error) {
    const name = errorName(error);
    if (name) return name;
    throw new Error(`simulation reverted without a named error: ${error instanceof Error ? error.message : error}`);
  }
  throw new Error("simulation did not revert");
}

async function expectNamedRevert(
  client: ReturnType<typeof createPublicClient>,
  book: Address,
  account: Address,
  data: Hex,
  expected: string,
): Promise<void> {
  const name = await revertedName(client, book, account, data);
  if (name !== expected) throw new Error(`expected ${expected}, got ${name}`);
}

async function expectAnyRevert(
  client: ReturnType<typeof createPublicClient>,
  book: Address,
  account: Address,
  data: Hex,
): Promise<void> {
  try {
    await client.call({ to: book, data, account, gas: ATTACK_GAS });
  } catch {
    return;
  }
  throw new Error("price call did not revert");
}

function errorName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) return reverted.data.errorName;
  const raw = error.walk((item) => typeof item === "object" && item !== null && "data" in item);
  const data = raw && typeof raw === "object" && "data" in raw ? raw.data : undefined;
  if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return undefined;
  try {
    return decodeErrorResult({ abi: bookAbi, data: data as Hex }).errorName;
  } catch {
    return undefined;
  }
}

async function revertedTx(
  wallet: ReturnType<typeof createWalletClient>,
  client: ReturnType<typeof createPublicClient>,
  book: Address,
  data: Hex,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<Hex> {
  const hash = await wallet.sendTransaction({
    account,
    to: book,
    data,
    gas: ATTACK_GAS,
    maxFeePerGas: ATTACK_FEE,
    maxPriorityFeePerGas: 12_500_000_000n,
    chain: diana,
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "reverted") throw new Error(`attack tx ${hash} status ${receipt.status}`);
  return hash;
}
