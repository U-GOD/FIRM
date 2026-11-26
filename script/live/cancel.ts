import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closeEvmWindowMsg, fetchEvmWindow, openEvmWindowMsg } from "@qorechain/sdk";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  decodeErrorResult,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { diana } from "./chain.js";
import {
  FETH_TOKEN,
  REST,
  ZERO,
  approveData,
  bankBalances,
  bookAbi,
  bookAddress,
  accounts,
  confirm,
  connect,
  convertMsg,
  denomFor,
  erc20Abi,
  erc20Balance,
  evmCall,
  loadEnvFile,
  publicClient,
  readOffer,
  send,
  signMlDsa,
  verifyMlDsa,
} from "./book.js";
import {
  CHAIN_ID,
  DIANA_RPC,
  FUSD,
  OFFER_A_DELAY,
  OFFER_A_DURATION,
  OFFER_A_END_PRICE,
  OFFER_A_START_PRICE,
  OFFER_B_AMOUNT,
  encodeCancel,
  encodeOffer,
  type OfferTerms,
} from "./message.js";

const STATE_PATH = "broadcast/offer-b.json";
const FILL_GAS = 800_000n;
const FILL_FEE = 200_000_000_000n;

type State = {
  convert?: string;
  approve?: string;
  deposit?: string;
  clear?: string;
  open?: string;
  offerId?: string;
  startCancel?: string;
  readyAt?: string;
  fillWindow?: string;
  fillRevert?: string;
  fillClose?: string;
  finalize?: string;
};

function loadState(): State {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}

function saveState(state: State): void {
  mkdirSync("broadcast", { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function windowValue(): string {
  const unit = 10n ** 12n;
  const perTx = (FILL_GAS * FILL_FEE + unit - 1n) / unit;
  return (perTx * 2n).toString();
}

async function main(): Promise<void> {
  loadEnvFile();
  const { maker, filler } = await accounts();
  const book = bookAddress();
  const makerEvm = maker.evm as Address;
  const fillerEvm = filler.evm as Address;
  console.log(`maker ${maker.cosmos} ${maker.evm}`);
  console.log(`filler ${filler.cosmos} ${filler.evm}`);
  const state = loadState();
  const save = () => saveState(state);
  const transport = await connect();
  const client = publicClient();

  try {
    const held = await erc20Balance(client, FETH_TOKEN, makerEvm);
    if (held < OFFER_B_AMOUNT && !state.deposit && !state.offerId) {
      const balances = await bankBalances(maker.cosmos);
      state.convert = await send(
        transport,
        maker,
        [convertMsg(maker.cosmos, maker.evm, denomFor(balances, FETH_TOKEN), OFFER_B_AMOUNT - held)],
        "hybrid",
      );
      save();
      await confirm(state.convert, true);
      console.log(`converted fETH ${state.convert}`);
    }

    const allowance = await client.readContract({
      address: FETH_TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      args: [makerEvm, book],
    });
    if (allowance < OFFER_B_AMOUNT && !state.deposit && !state.offerId) {
      state.approve = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, FETH_TOKEN, approveData(book, OFFER_B_AMOUNT))],
        "hybrid",
      );
      save();
      await confirm(state.approve, true);
      console.log(`approved ${state.approve}`);
    }

    const idleBefore = await client.readContract({
      address: book,
      abi: bookAbi,
      functionName: "idle",
      args: [makerEvm, FETH_TOKEN],
    });
    if (idleBefore < OFFER_B_AMOUNT && !state.deposit && !state.offerId) {
      state.deposit = await send(
        transport,
        maker,
        [
          evmCall(
            maker.cosmos,
            book,
            encodeFunctionData({ abi: bookAbi, functionName: "deposit", args: [FETH_TOKEN, OFFER_B_AMOUNT] }),
          ),
        ],
        "hybrid",
      );
      save();
      await confirm(state.deposit, true);
      console.log(`deposited ${state.deposit}`);
    }

    if (!state.clear && !state.offerId) {
      state.clear = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, FETH_TOKEN, approveData(book, 0n))],
        "hybrid",
      );
      save();
      await confirm(state.clear, true);
      console.log(`allowance cleared ${state.clear}`);
    }

    const nextId = await client.readContract({ address: book, abi: bookAbi, functionName: "nextId" });
    if (!state.offerId && nextId === 3n) {
      state.offerId = "2";
      save();
    }
    if (!state.offerId) {
      if (nextId !== 2n) throw new Error(`book nextId is ${nextId}, expected 2`);
      const nonce = await client.readContract({ address: book, abi: bookAbi, functionName: "nonces", args: [makerEvm] });
      const block = await client.getBlock();
      const terms: OfferTerms = {
        maker: makerEvm,
        tokenIn: FETH_TOKEN,
        tokenOut: FUSD,
        amountIn: OFFER_B_AMOUNT,
        startPrice: OFFER_A_START_PRICE,
        endPrice: OFFER_A_END_PRICE,
        startTime: block.timestamp,
        endTime: block.timestamp + OFFER_A_DURATION,
        recipient: makerEvm,
        cancelDelay: OFFER_A_DELAY,
        nonce,
        feeBps: 0n,
        feeRecipient: ZERO,
      };
      const message = encodeOffer(terms, book, CHAIN_ID);
      const signature = signMlDsa(message, maker.pqc.secretKey);
      verifyMlDsa(signature, message, maker.pqc.publicKey);
      state.open = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, book, encodeFunctionData({ abi: bookAbi, functionName: "open", args: [terms, signature] }))],
        "hybrid",
        20_000_000,
      );
      save();
      await confirm(state.open, true);
      state.offerId = "2";
      save();
      console.log(`opened ${state.open} id 2 terms ${keccak256(message)}`);
    }

    const id = BigInt(state.offerId);
    const opened = await readOffer(client, book, id);
    if (getAddress(opened.maker) !== getAddress(makerEvm) || opened.amountIn !== OFFER_B_AMOUNT) {
      throw new Error(`offer ${id} is not the 0.01 fETH offer`);
    }

    if (!state.startCancel && opened.status === 1) {
      const actionNonce = await client.readContract({
        address: book,
        abi: bookAbi,
        functionName: "actionNonces",
        args: [makerEvm],
      });
      const message = encodeCancel({ offerId: id, maker: makerEvm, actionNonce }, book, CHAIN_ID);
      const signature = signMlDsa(message, maker.pqc.secretKey);
      verifyMlDsa(signature, message, maker.pqc.publicKey);
      state.startCancel = await send(
        transport,
        maker,
        [
          evmCall(
            maker.cosmos,
            book,
            encodeFunctionData({ abi: bookAbi, functionName: "startCancel", args: [id, signature] }),
          ),
        ],
        "hybrid",
        20_000_000,
      );
      save();
      await confirm(state.startCancel, true);
      console.log(`cancel started ${state.startCancel}`);
    }

    const pending = await readOffer(client, book, id);
    if (!state.finalize) {
      if (pending.status !== 3 && pending.status !== 4) {
        throw new Error(`offer ${id} status ${pending.status}, expected cancel pending`);
      }
      state.readyAt = pending.cancelReadyAt.toString();
      save();
      if (pending.status === 3) await waitFor(client, pending.cancelReadyAt);
    }

    if (!state.fillRevert) {
      const head = await client.getBlock();
      if (head.number < BigInt(state.readyAt ?? "0")) {
        throw new Error(`head ${head.number} is still before cancel block ${state.readyAt}`);
      }
      const data = encodeFunctionData({ abi: bookAbi, functionName: "fill", args: [id] });
      const name = await revertName(client, book, fillerEvm, data);
      if (name !== "NotOpen") throw new Error(`matured fill returned ${name}, expected NotOpen`);
      await openFillWindow(transport, filler, state, save);
      try {
        const account = privateKeyToAccount(filler.privateKey as Hex);
        const wallet = createWalletClient({ account, chain: diana, transport: http(DIANA_RPC) });
        const hash = await wallet.sendTransaction({
          account,
          to: book,
          data,
          gas: FILL_GAS,
          maxFeePerGas: FILL_FEE,
          maxPriorityFeePerGas: 12_500_000_000n,
          chain: diana,
        });
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status !== "reverted") throw new Error(`fill ${hash} status ${receipt.status}`);
        if (receipt.blockNumber < BigInt(state.readyAt ?? "0")) {
          throw new Error(`fill block ${receipt.blockNumber} is before cancel block ${state.readyAt}`);
        }
        state.fillRevert = hash;
        save();
        console.log(`matured fill reverted ${hash} block ${receipt.blockNumber}`);
      } finally {
        await closeFillWindow(transport, filler, state, save);
      }
    }

    if (!state.finalize) {
      state.finalize = await send(
        transport,
        maker,
        [evmCall(maker.cosmos, book, encodeFunctionData({ abi: bookAbi, functionName: "finalizeCancel", args: [id] }))],
        "hybrid",
      );
      save();
      await confirm(state.finalize, true);
      console.log(`finalized ${state.finalize}`);
    }

    const done = await readOffer(client, book, id);
    const idle = await client.readContract({
      address: book,
      abi: bookAbi,
      functionName: "idle",
      args: [makerEvm, FETH_TOKEN],
    });
    const reserved = await client.readContract({
      address: book,
      abi: bookAbi,
      functionName: "reserved",
      args: [FETH_TOKEN],
    });
    if (done.status !== 4) throw new Error(`offer ${id} status ${done.status}, expected cancelled`);
    if (idle !== 1n + OFFER_B_AMOUNT) throw new Error(`idle is ${idle}, expected ${1n + OFFER_B_AMOUNT}`);
    if (reserved !== 0n) throw new Error(`reserved is ${reserved}, expected 0`);
    const fillerWindow = await fetchEvmWindow({ rest: REST, address: filler.cosmos });
    if (fillerWindow.found || fillerWindow.live) {
      throw new Error(`filler window still stored (found=${fillerWindow.found} live=${fillerWindow.live})`);
    }
    console.log(`idle ${idle} reserved ${reserved} status ${done.status}`);
  } finally {
    transport.disconnect();
  }
}

async function waitFor(client: ReturnType<typeof publicClient>, ready: bigint): Promise<void> {
  const deadline = Date.now() + 180_000;
  for (;;) {
    const block = await client.getBlock();
    console.log(`block ${block.number} ready ${ready}`);
    if (block.number >= ready) return;
    if (Date.now() > deadline) throw new Error(`cancel block ${ready} was not reached`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function openFillWindow(
  transport: Awaited<ReturnType<typeof connect>>,
  filler: Awaited<ReturnType<typeof accounts>>["filler"],
  state: State,
  save: () => void,
): Promise<void> {
  let window = await fetchEvmWindow({ rest: REST, address: filler.cosmos });
  if (window.found && !window.live) {
    state.fillClose = await send(transport, filler, [closeEvmWindowMsg(filler.cosmos)], "hybrid");
    save();
    await confirm(state.fillClose, true);
    window = await fetchEvmWindow({ rest: REST, address: filler.cosmos });
  }
  if (window.live) return;
  state.fillWindow = await send(
    transport,
    filler,
    [openEvmWindowMsg({ sender: filler.cosmos, blocks: 80, maxTxs: 1, maxValue: windowValue() })],
    "hybrid",
  );
  save();
  await confirm(state.fillWindow, true);
  const opened = await fetchEvmWindow({ rest: REST, address: filler.cosmos });
  if (!opened.live) throw new Error("filler window did not go live");
  console.log(`fill window ${state.fillWindow}`);
}

async function closeFillWindow(
  transport: Awaited<ReturnType<typeof connect>>,
  filler: Awaited<ReturnType<typeof accounts>>["filler"],
  state: State,
  save: () => void,
): Promise<void> {
  const window = await fetchEvmWindow({ rest: REST, address: filler.cosmos });
  if (!window.found) return;
  state.fillClose = await send(transport, filler, [closeEvmWindowMsg(filler.cosmos)], "hybrid");
  save();
  await confirm(state.fillClose, true);
  console.log(`fill window closed ${state.fillClose}`);
}

async function revertName(
  client: ReturnType<typeof publicClient>,
  book: Address,
  account: Address,
  data: Hex,
): Promise<string> {
  try {
    await client.call({ to: book, data, account, gas: FILL_GAS });
  } catch (error) {
    const name = errorName(error);
    if (name) return name;
    throw new Error(`matured fill reverted without a named error: ${error instanceof Error ? error.message : error}`);
  }
  throw new Error("matured fill did not revert");
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
