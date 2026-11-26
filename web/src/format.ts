import { formatUnits, type Address } from "viem";
import { recordedFor } from "./runs.js";
import type { LiveOffer } from "./chain.js";

const known: Record<string, { symbol: string; decimals: number }> = {
  "0x02292293c13880a26242690eb70a0e42b8e91c28": { symbol: "fETH", decimals: 18 },
  "0x97143b771d34ddb9130b807b135ae675a5a963ca": { symbol: "fUSD", decimals: 6 },
};

export const STATUS = ["None", "Open", "Filled", "Cancel pending", "Cancelled"];

export function statusName(status: number): string {
  return STATUS[status] ?? `Status ${status}`;
}

export function statusClass(status: number): string {
  if (status === 1) return "open";
  if (status === 2) return "filled";
  if (status === 3) return "pending";
  if (status === 4) return "cancelled";
  return "";
}

export function tokenLabel(address: Address): { symbol: string; decimals: number } | null {
  return known[address.toLowerCase()] ?? null;
}

export function wholeUnits(amount: bigint, address: Address): string {
  const token = tokenLabel(address);
  if (!token) return amount.toString();
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

export function priceLabel(price: bigint, tokenOut: Address): string {
  const token = tokenLabel(tokenOut);
  if (!token) return price.toString();
  return `${formatUnits(price, token.decimals)} ${token.symbol}`;
}

export function when(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

export function agrees(offer: LiveOffer): boolean {
  const recorded = recordedFor(offer.id);
  if (!recorded) return false;
  return offer.amountIn === recorded.amount && offer.status === recorded.status && offer.cancelReadyAt === recorded.cancelReadyAt;
}
