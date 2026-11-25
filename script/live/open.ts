import { encodeFunctionData, getAddress, keccak256, type Address, type Hex } from "viem";
import {
  FETH_TOKEN,
  ZERO,
  bookAbi,
  confirm,
  convertMsg,
  denomFor,
  erc20Abi,
  erc20Balance,
  evmCall,
  readOffer,
  send,
  signMlDsa,
  verifyMlDsa,
  approveData,
  bankBalances,
  type Live,
} from "./book.js";
import {
  FUSD,
  OFFER_A_AMOUNT,
  OFFER_A_DELAY,
  OFFER_A_DURATION,
  OFFER_A_END_PRICE,
  OFFER_A_START_PRICE,
  encodeOffer,
  type OfferTerms,
} from "./message.js";

/** One extra base unit stays idle so a withdraw reaches the signature check. */
const DEPOSIT = OFFER_A_AMOUNT + 1n;

export async function runOpen(live: Live): Promise<void> {
  const { transport, publicClient, maker, book, state, save } = live;
  const makerEvm = maker.evm as Address;
  const balances = await bankBalances(maker.cosmos);
  const held = await erc20Balance(publicClient, FETH_TOKEN, makerEvm);

  if (held < DEPOSIT && !state.convertFeth) {
    const denom = denomFor(balances, FETH_TOKEN);
    state.convertFeth = await send(
      transport,
      maker,
      [convertMsg(maker.cosmos, maker.evm, denom, DEPOSIT - held)],
      "hybrid",
    );
    save();
    await confirm(state.convertFeth, true);
    console.log(`converted fETH ${state.convertFeth}`);
  }

  const allowance = await publicClient.readContract({
    address: FETH_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [makerEvm, book],
  });
  if (allowance < DEPOSIT && !state.deposit) {
    state.approve = await send(
      transport,
      maker,
      [evmCall(maker.cosmos, FETH_TOKEN, approveData(book, DEPOSIT))],
      "hybrid",
    );
    save();
    await confirm(state.approve, true);
    console.log(`approved ${state.approve}`);
  }

  const idle = await publicClient.readContract({
    address: book,
    abi: bookAbi,
    functionName: "idle",
    args: [makerEvm, FETH_TOKEN],
  });
  if (idle < DEPOSIT && !state.deposit) {
    state.deposit = await send(
      transport,
      maker,
      [evmCall(maker.cosmos, book, encodeFunctionData({ abi: bookAbi, functionName: "deposit", args: [FETH_TOKEN, DEPOSIT] }))],
      "hybrid",
    );
    save();
    await confirm(state.deposit, true);
    console.log(`deposited ${state.deposit}`);
  }

  if (!state.clear) {
    state.clear = await send(transport, maker, [evmCall(maker.cosmos, FETH_TOKEN, approveData(book, 0n))], "hybrid");
    save();
    await confirm(state.clear, true);
    console.log(`allowance cleared ${state.clear}`);
  }

  const nextId = await publicClient.readContract({ address: book, abi: bookAbi, functionName: "nextId" });
  if (!state.offerId && nextId === 2n) {
    state.offerId = "1";
    save();
  }
  if (!state.offerId) {
    if (nextId !== 1n) throw new Error(`book nextId is ${nextId}, expected 1 before the first offer`);
    const nonce = await publicClient.readContract({
      address: book,
      abi: bookAbi,
      functionName: "nonces",
      args: [makerEvm],
    });
    const block = await publicClient.getBlock();
    const terms: OfferTerms = {
      maker: makerEvm,
      tokenIn: FETH_TOKEN,
      tokenOut: FUSD,
      amountIn: OFFER_A_AMOUNT,
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
    const message = encodeOffer(terms, book, 9800n);
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
    state.offerId = "1";
    save();
    console.log(`opened ${state.open} id ${state.offerId} terms ${keccak256(message)}`);
  }

  const offer = await readOffer(publicClient, book, BigInt(state.offerId));
  if (getAddress(offer.maker) !== getAddress(makerEvm) || offer.amountIn !== OFFER_A_AMOUNT || offer.status === 0) {
    throw new Error(`offer ${state.offerId} is not the 0.1 fETH offer (status ${offer.status})`);
  }
}
