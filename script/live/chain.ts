import { defineChain } from "viem";

export const diana = defineChain({
  id: 9800,
  name: "qorechain-diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 6 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
});
