import { encodeFunctionData, getAddress, hexToBytes, type Address, type Hex } from "viem";
import {
  bank,
  buildRegisterPqcKeyMsg,
  fetchPqcStatus,
  signProofOfPossession,
} from "@qorechain/sdk";
import {
  CHAIN_ID,
  FETH_TOKEN,
  FUSD_TOKEN,
  REST,
  approveData,
  bankBalances,
  bookAbi,
  confirm,
  convertMsg,
  curvePayment,
  curvePrice,
  denomFor,
  erc20Abi,
  erc20Balance,
  evmCall,
  readOffer,
  send,
  signMlDsa,
  txBody,
  verifyMlDsa,
  type Live,
} from "./book.js";
import { encodeCancel } from "./message.js";

const FILLER_FUSD = 5n * 10n ** 6n;
const FILLER_QOR = "5000000";

export async function runFill(live: Live): Promise<void> {
  await prepareFiller(live);
  await startCancel(live);
  await fillOffer(live);
  await assertCurve(live);
}

async function prepareFiller(live: Live): Promise<void> {
  const { transport, publicClient, maker, filler, book, state, save } = live;
  const balances = await bankBalances(filler.cosmos);
  const uqor = BigInt(balances.find((coin) => coin.denom === "uqor")?.amount ?? "0");
  const fusdCoin = balances.find((coin) => coin.denom.toLowerCase().endsWith(FUSD_TOKEN.toLowerCase()));
  const fusdBank = BigInt(fusdCoin?.amount ?? "0");
  if ((uqor === 0n || fusdBank < FILLER_FUSD) && !state.fund) {
    const makerBalances = await bankBalances(maker.cosmos);
    const coins = [
      { denom: "uqor", amount: FILLER_QOR },
      { denom: denomFor(makerBalances, FUSD_TOKEN), amount: FILLER_FUSD.toString() },
    ].sort((left, right) => (left.denom < right.denom ? -1 : left.denom > right.denom ? 1 : 0));
    state.fund = await send(
      transport,
      maker,
      [
        bank.send({
          fromAddress: maker.cosmos,
          toAddress: filler.cosmos,
          amount: coins,
        }),
      ],
      "hybrid",
    );
    save();
    await confirm(state.fund, true);
    console.log(`funded filler ${state.fund}`);
  }

  const status = await fetchPqcStatus({ rest: REST, address: filler.cosmos });
  if (!status.registered && !state.fillerRegister) {
    const proof = signProofOfPossession({
      chainId: CHAIN_ID,
      account: filler.cosmos,
      algorithmId: 1,
      keypair: filler.pqc,
    });
    state.fillerRegister = await send(
      transport,
      filler,
      [
        buildRegisterPqcKeyMsg(filler.cosmos, {
          pqcKeypair: filler.pqc,
          ecdsaPubkey: hexToBytes(filler.publicKey as Hex),
          keyType: "hybrid",
          proofOfPossession: proof,
        }),
      ],
      "classical",
    );
    save();
    await confirm(state.fillerRegister, false);
    console.log(`filler registered ${state.fillerRegister}`);
  }
  const proven = await fetchPqcStatus({ rest: REST, address: filler.cosmos });
  if (!proven.registered || proven.possessionProven !== true) {
    throw new Error(`filler key is not possession-proven (registered=${proven.registered})`);
  }

  const fillerEvm = filler.evm as Address;
  const fusd = await erc20Balance(publicClient, FUSD_TOKEN, fillerEvm);
  if (fusd < FILLER_FUSD && !state.convertFusd) {
    const fresh = await bankBalances(filler.cosmos);
    state.convertFusd = await send(
      transport,
      filler,
      [convertMsg(filler.cosmos, filler.evm, denomFor(fresh, FUSD_TOKEN), FILLER_FUSD - fusd)],
      "hybrid",
    );
    save();
    await confirm(state.convertFusd, true);
    console.log(`converted fUSD ${state.convertFusd}`);
  }

  const allowance = await publicClient.readContract({
    address: FUSD_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [fillerEvm, book],
  });
  if (allowance < FILLER_FUSD && !state.fillerApprove) {
    state.fillerApprove = await send(
      transport,
      filler,
      [evmCall(filler.cosmos, FUSD_TOKEN, approveData(book, FILLER_FUSD))],
      "hybrid",
    );
    save();
    await confirm(state.fillerApprove, true);
    console.log(`filler approved ${state.fillerApprove}`);
  }
}

async function startCancel(live: Live): Promise<void> {
  const { transport, publicClient, maker, book, state, save } = live;
  if (!state.offerId) throw new Error("offer id is missing");
  if (state.startCancel) return;
  const id = BigInt(state.offerId);
  const actionNonce = await publicClient.readContract({
    address: book,
    abi: bookAbi,
    functionName: "actionNonces",
    args: [maker.evm as Address],
  });
  const message = encodeCancel({ offerId: id, maker: maker.evm as Address, actionNonce }, book, 9800n);
  const signature = signMlDsa(message, maker.pqc.secretKey);
  verifyMlDsa(signature, message, maker.pqc.publicKey);
  state.fillerFethBefore = (
    await erc20Balance(publicClient, FETH_TOKEN, live.filler.evm as Address)
  ).toString();
  state.recipientFusdBefore = (
    await erc20Balance(publicClient, FUSD_TOKEN, maker.evm as Address)
  ).toString();
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

async function fillOffer(live: Live): Promise<void> {
  const { transport, publicClient, filler, book, state, save } = live;
  if (!state.offerId) throw new Error("offer id is missing");
  if (state.fill) return;
  const id = BigInt(state.offerId);
  const offer = await readOffer(publicClient, book, id);
  const block = await publicClient.getBlock();
  if (offer.status !== 3) throw new Error(`offer status ${offer.status}, expected cancel pending`);
  if (block.number >= offer.cancelReadyAt) {
    throw new Error(`cancel already matured at block ${offer.cancelReadyAt}, head is ${block.number}`);
  }
  state.fill = await send(
    transport,
    filler,
    [evmCall(filler.cosmos, book, encodeFunctionData({ abi: bookAbi, functionName: "fill", args: [id] }))],
    "hybrid",
  );
  save();
  const height = await confirm(state.fill, true);
  state.fillHeight = height;
  save();
  console.log(`filled ${state.fill} height ${height} ready ${offer.cancelReadyAt}`);
}

async function assertCurve(live: Live): Promise<void> {
  const { publicClient, maker, filler, book, state, save } = live;
  if (!state.offerId || !state.fill || !state.fillHeight) throw new Error("fill evidence is missing");
  const id = BigInt(state.offerId);
  const offer = await readOffer(publicClient, book, id);
  const filledBlock = await publicClient.getBlock({ blockNumber: BigInt(state.fillHeight) });
  if (filledBlock.number >= offer.cancelReadyAt) {
    throw new Error(`fill block ${filledBlock.number} is not before cancel block ${offer.cancelReadyAt}`);
  }
  const unitPrice = curvePrice(offer.startPrice, offer.endPrice, offer.startTime, offer.endTime, filledBlock.timestamp);
  const gross = curvePayment(offer.amountIn, unitPrice);
  const fillerAfter = await erc20Balance(publicClient, FETH_TOKEN, filler.evm as Address);
  const recipientAfter = await erc20Balance(publicClient, FUSD_TOKEN, maker.evm as Address);
  const fillerBefore = BigInt(state.fillerFethBefore ?? "0");
  const recipientBefore = BigInt(state.recipientFusdBefore ?? "0");
  if (fillerAfter - fillerBefore !== offer.amountIn) {
    throw new Error(`filler fETH increased by ${fillerAfter - fillerBefore}, expected ${offer.amountIn}`);
  }
  if (recipientAfter - recipientBefore !== gross) {
    throw new Error(`recipient fUSD increased by ${recipientAfter - recipientBefore}, curve says ${gross}`);
  }
  if (getAddress(offer.maker) !== getAddress(maker.evm) || offer.status !== 2) {
    throw new Error(`offer ${state.offerId} status ${offer.status} after fill`);
  }
  state.unitPrice = unitPrice.toString();
  state.gross = gross.toString();
  save();
  const body = await txBody(state.fill);
  if (body.tx_response?.code !== 0) throw new Error("fill tx is not code 0");
  console.log(
    `price ${unitPrice} gross ${gross} filler fETH ${fillerAfter} recipient fUSD ${recipientAfter} ready ${offer.cancelReadyAt}`,
  );
}
