import type { LiveOffer } from "./chain.js";
import { when } from "./format.js";

const SCALE = 10n ** 18n;

/** Same arithmetic as Curve.price. Output base units per 1e18 input base units. */
export function unitPrice(offer: LiveOffer, t: bigint): bigint {
  if (offer.endTime <= offer.startTime) return offer.startPrice;
  if (t <= offer.startTime) return offer.startPrice;
  if (t >= offer.endTime) return offer.endPrice;
  const elapsed = t - offer.startTime;
  const duration = offer.endTime - offer.startTime;
  if (offer.endPrice >= offer.startPrice) {
    return offer.startPrice + ((offer.endPrice - offer.startPrice) * elapsed) / duration;
  }
  return offer.startPrice - ((offer.startPrice - offer.endPrice) * elapsed) / duration;
}

/** Same arithmetic as Curve.payment. */
export function payment(amountIn: bigint, price: bigint): bigint {
  if (amountIn === 0n || price === 0n) return 0n;
  return (amountIn * price) / SCALE;
}

export function fillGate(offer: LiveOffer, now: bigint, block: bigint): { ok: boolean; reason: string } {
  if (offer.status === 2) return { ok: false, reason: "This offer is filled. The input has already moved." };
  if (offer.status === 4) return { ok: false, reason: "This offer was cancelled. The input is back in the maker's idle balance." };
  if (offer.status !== 1 && offer.status !== 3) return { ok: false, reason: "This offer is not open." };
  if (now < offer.startTime) return { ok: false, reason: `The window opens at ${when(offer.startTime)}.` };
  if (now > offer.endTime) return { ok: false, reason: "The window has closed. A fill reverts." };
  if (offer.cancelReadyAt !== 0n && block >= offer.cancelReadyAt) {
    return { ok: false, reason: "The cancel has matured. A fill reverts." };
  }
  if (offer.status === 3) return { ok: true, reason: "A cancel is waiting. A fill still clears before that block." };
  return { ok: true, reason: "The offer is open. The contract sets the price at the block time." };
}
