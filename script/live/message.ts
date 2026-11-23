import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

/** Domain separators. Same strings as `OfferBytes.sol`. */
export const OFFER_DOMAIN = keccak256(toBytes("FIRM_OFFER_V1"));
export const CANCEL_DOMAIN = keccak256(toBytes("FIRM_CANCEL_V1"));
export const WITHDRAW_DOMAIN = keccak256(toBytes("FIRM_WITHDRAW_V1"));

export const CHAIN_ID = 9800n;
export const PQC_VERIFY = "0x0000000000000000000000000000000000000a01" as const;
export const DIANA_RPC = "https://evm-testnet.qore.host";

/** Public vector only. Not a maker key, and not for a deposit. */
export const VECTOR_SEED_LABEL = "FIRM_VECTOR_SEED_V1";

export const VECTOR_BOOK = "0x000000000000000000000000000000000000f19d" as const;
export const VECTOR_MAKER = "0x000000000000000000000000000000000000f19e" as const;

/** Official Diana fest tokens, checked by `decimals()` on 23 November 2026. */
export const FETH = "0x02292293c13880a26242690eb70a0e42B8E91c28" as const;
export const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as const;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export type OfferTerms = {
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
  nonce: bigint;
  feeBps: bigint;
  feeRecipient: Address;
};

export type CancelTerms = {
  offerId: bigint;
  maker: Address;
  actionNonce: bigint;
};

export type WithdrawTerms = {
  maker: Address;
  token: Address;
  amount: bigint;
  actionNonce: bigint;
};

const offerAbi = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
] as const;

const cancelAbi = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
] as const;

const withdrawAbi = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
] as const;

/** `abi.encode` of an offer. 16 words, 512 bytes. */
export function encodeOffer(terms: OfferTerms, book: Address, chainId: bigint): Hex {
  return encodeAbiParameters(offerAbi, [
    OFFER_DOMAIN,
    chainId,
    book,
    terms.maker,
    terms.tokenIn,
    terms.tokenOut,
    terms.amountIn,
    terms.startPrice,
    terms.endPrice,
    terms.startTime,
    terms.endTime,
    terms.recipient,
    terms.cancelDelay,
    terms.nonce,
    terms.feeBps,
    terms.feeRecipient,
  ]);
}

export function encodeCancel(terms: CancelTerms, book: Address, chainId: bigint): Hex {
  return encodeAbiParameters(cancelAbi, [
    CANCEL_DOMAIN,
    chainId,
    book,
    terms.offerId,
    terms.maker,
    terms.actionNonce,
  ]);
}

export function encodeWithdraw(terms: WithdrawTerms, book: Address, chainId: bigint): Hex {
  return encodeAbiParameters(withdrawAbi, [
    WITHDRAW_DOMAIN,
    chainId,
    book,
    terms.maker,
    terms.token,
    terms.amount,
    terms.actionNonce,
  ]);
}

/**
 * The sample in the vector file.
 * 10 fETH, 20 fUSD down to 16 fUSD, two hours, cancel delay 40.
 * fUSD has 6 decimals, so the prices are `20 * 10^6` and `16 * 10^6`.
 * The book address is a placeholder until deploy.
 */
export function vectorOffer(): OfferTerms {
  const startTime = 1_767_225_600n;
  return {
    maker: VECTOR_MAKER,
    tokenIn: FETH,
    tokenOut: FUSD,
    amountIn: 10n * 10n ** 18n,
    startPrice: 20n * 10n ** 6n,
    endPrice: 16n * 10n ** 6n,
    startTime,
    endTime: startTime + 7_200n,
    recipient: VECTOR_MAKER,
    cancelDelay: 40n,
    nonce: 0n,
    feeBps: 0n,
    feeRecipient: ZERO,
  };
}

export function vectorCancel(): CancelTerms {
  return { offerId: 1n, maker: VECTOR_MAKER, actionNonce: 0n };
}

export function vectorWithdraw(): WithdrawTerms {
  return { maker: VECTOR_MAKER, token: FETH, amount: 1n, actionNonce: 0n };
}
