import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider, type Hash, type WalletClient } from "viem";
import { diana } from "./chain.js";

const DIANA_HEX = "0x2648";

interface Eip1193 {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type WalletState =
  | { status: "idle" }
  | { status: "pending"; label: string }
  | { status: "connected"; address: Address; chainId: number };

type Listener = () => void;

let state: WalletState = { status: "idle" };
let note = "";
const listeners = new Set<Listener>();
let listening = false;

export function walletState(): WalletState {
  return state;
}

export function walletNote(): string {
  return note;
}

export function subscribeWallet(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: WalletState, message = ""): void {
  state = next;
  note = message;
  emit();
}

function provider(): Eip1193 {
  const injected = window.ethereum;
  if (!injected) throw new Error("This browser has no wallet.");
  return injected;
}

function asProvider(injected: Eip1193): EIP1193Provider {
  return injected as EIP1193Provider;
}

export function txMessage(error: unknown): string {
  if (error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string") {
    if (/reject/i.test(error.shortMessage)) return "The wallet declined.";
    return error.shortMessage;
  }
  if (error && typeof error === "object" && "code" in error && error.code === 4001) return "The wallet declined.";
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return "The wallet did not finish.";
}

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { code?: number; data?: { originalError?: { code?: number } } };
  return value.code ?? value.data?.originalError?.code;
}

async function chainIdOf(injected: Eip1193): Promise<number> {
  const hex = await injected.request({ method: "eth_chainId" });
  return Number(hex);
}

export async function switchToDiana(): Promise<void> {
  const injected = provider();
  const previous = state.status === "connected" ? state : null;
  setState({ status: "pending", label: "Switching to Diana" }, "Confirm Diana, chain 9800, in the wallet.");
  try {
    try {
      await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: DIANA_HEX }] });
    } catch (error) {
      if (errorCode(error) !== 4902) throw error;
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: DIANA_HEX,
            chainName: "QoreChain Diana",
            nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
            rpcUrls: ["https://evm-testnet.qore.host"],
            blockExplorerUrls: ["https://explore.qore.network"],
          },
        ],
      });
    }
    const accounts = (await injected.request({ method: "eth_accounts" })) as string[];
    const account = accounts[0];
    if (!account) {
      setState({ status: "idle" }, "The wallet returned no account.");
      return;
    }
    const chainId = await chainIdOf(injected);
    const message = chainId === diana.id ? "The wallet is on Diana." : "The wallet did not switch to Diana.";
    setState({ status: "connected", address: getAddress(account), chainId }, message);
  } catch (error) {
    if (previous) setState(previous, txMessage(error));
    else setState({ status: "idle" }, txMessage(error));
  }
}

export async function connectWallet(): Promise<void> {
  if (state.status === "pending") return;
  if (!window.ethereum) {
    setState({ status: "idle" }, "This browser has no wallet. Install one that can add chain 9800, then press Connect again.");
    return;
  }
  const injected = window.ethereum;
  setState({ status: "pending", label: "Waiting for the wallet" }, "Approve the connection in the wallet.");
  try {
    const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
    const account = accounts[0];
    if (!account) {
      setState({ status: "idle" }, "The wallet returned no account.");
      return;
    }
    let chainId = await chainIdOf(injected);
    setState({ status: "connected", address: getAddress(account), chainId }, "");
    if (chainId !== diana.id) await switchToDiana();
    else setState({ status: "connected", address: getAddress(account), chainId }, "Connected. This wallet can deposit and fill.");
    listen(injected);
  } catch (error) {
    setState({ status: "idle" }, txMessage(error));
  }
}

export function disconnectWallet(): void {
  setState({ status: "idle" }, "Disconnected in the page. The wallet may still list FIRM as connected.");
}

export async function requireAccount(): Promise<Address> {
  if (state.status !== "connected") throw new Error("Connect a wallet first.");
  if (state.chainId !== diana.id) await switchToDiana();
  const next = walletState();
  if (next.status !== "connected" || next.chainId !== diana.id) {
    throw new Error("Switch the wallet to Diana, chain 9800.");
  }
  return next.address;
}

export function walletClient(account: Address): WalletClient {
  return createWalletClient({ account, chain: diana, transport: custom(asProvider(provider())) });
}

export async function writeContract(call: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}): Promise<Hash> {
  const account = await requireAccount();
  const wallet = walletClient(account);
  return wallet.writeContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args,
    account,
    chain: diana,
  } as Parameters<WalletClient["writeContract"]>[0]);
}

function listen(injected: Eip1193): void {
  if (listening || !injected.on) return;
  listening = true;
  injected.on("accountsChanged", (...args) => {
    const accounts = args[0];
    if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== "string") {
      setState({ status: "idle" }, "The wallet has no account selected.");
      return;
    }
    const chainId = state.status === "connected" ? state.chainId : diana.id;
    setState({ status: "connected", address: getAddress(accounts[0]), chainId }, "Account changed.");
  });
  injected.on("chainChanged", (...args) => {
    if (state.status !== "connected") return;
    const chainId = Number(args[0]);
    const message = chainId === diana.id ? "The wallet is on Diana." : "This wallet is not on Diana. Switch before a deposit or a fill.";
    setState({ status: "connected", address: state.address, chainId }, message);
  });
}

function short(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function mountWallet(button: HTMLButtonElement, noteNode: HTMLElement): void {
  const menu = document.createElement("div");
  menu.className = "wallet-menu";
  menu.hidden = true;
  button.after(menu);

  const paint = (): void => {
    noteNode.textContent = note;
    menu.replaceChildren();
    if (state.status === "pending") {
      button.disabled = true;
      button.textContent = state.label;
      menu.hidden = true;
      return;
    }
    button.disabled = false;
    if (state.status !== "connected") {
      button.textContent = "Connect";
      button.classList.remove("ghost");
      menu.hidden = true;
      return;
    }
    button.classList.add("ghost");
    button.textContent = state.chainId === diana.id ? short(state.address) : "Switch to Diana";
    const address = document.createElement("p");
    address.className = "mono";
    address.textContent = state.address;
    const chain = document.createElement("p");
    chain.className = "note";
    chain.textContent = state.chainId === diana.id ? "Diana · 9800" : `Chain ${state.chainId}. Diana is 9800.`;
    const disconnect = document.createElement("button");
    disconnect.type = "button";
    disconnect.className = "button ghost";
    disconnect.textContent = "Disconnect";
    disconnect.addEventListener("click", () => {
      menu.hidden = true;
      disconnectWallet();
    });
    menu.append(address, chain, disconnect);
  };

  button.addEventListener("click", () => {
    if (state.status === "pending") return;
    if (state.status === "connected" && state.chainId !== diana.id) {
      void switchToDiana();
      return;
    }
    if (state.status === "connected") {
      menu.hidden = !menu.hidden;
      return;
    }
    void connectWallet();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (button.contains(event.target) || menu.contains(event.target)) return;
    menu.hidden = true;
  });

  subscribeWallet(paint);
  paint();
}
