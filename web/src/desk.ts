import { formatUnits, parseUnits, type Address, type Hash } from "viem";
import { allowanceOf, head, holdings, publicClient, type Holdings, type LiveOffer } from "./chain.js";
import { priceLabel, tokenLabel, wholeUnits } from "./format.js";
import { fillGate, payment, unitPrice } from "./quote.js";
import { BOOK, EXPLORER } from "./runs.js";
import { copyButton } from "./copy.js";
import { connectWallet, subscribeWallet, txMessage, walletState, writeContract } from "./wallet.js";

const erc20Write = [
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

const bookWrite = [
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
    name: "fill",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
] as const;

function stopWhenDetached(node: HTMLElement, stop: () => void): void {
  const outlet = document.querySelector("#outlet");
  if (!outlet) return;
  const observer = new MutationObserver(() => {
    if (node.isConnected) return;
    stop();
    observer.disconnect();
  });
  observer.observe(outlet, { childList: true });
}

export function accountDock(): HTMLElement {
  const section = document.createElement("section");
  section.className = "dock";
  const heading = document.createElement("h2");
  heading.textContent = "Wallet";
  const read = document.createElement("div");
  read.className = "dock-read";
  const form = depositForm();
  section.append(heading, read, form);

  let busy = false;
  const paint = (): void => {
    if (busy) return;
    busy = true;
    void paintHoldings(read, form).finally(() => {
      busy = false;
    });
  };
  const unsubscribe = subscribeWallet(paint);
  const timer = window.setInterval(paint, 15_000);
  stopWhenDetached(section, () => {
    unsubscribe();
    window.clearInterval(timer);
  });
  paint();
  return section;
}

async function paintHoldings(read: HTMLElement, form: HTMLFormElement): Promise<void> {
  const state = walletState();
  form.hidden = state.status !== "connected" || state.chainId !== 9800;
  if (state.status === "pending") {
    read.replaceChildren(line(state.label));
    return;
  }
  if (state.status !== "connected") {
    const text = document.createElement("p");
    text.textContent = "Connect a wallet to see balances, deposit into the book, or fill an open offer.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Connect";
    button.addEventListener("click", () => {
      void connectWallet();
    });
    read.replaceChildren(text, button);
    return;
  }
  if (state.chainId !== 9800) {
    read.replaceChildren(line("This wallet is not on Diana. Use Switch to Diana in the header before depositing or filling."));
    return;
  }
  if (read.childElementCount === 0) read.replaceChildren(line("Reading balances."));
  try {
    const held = await holdings(state.address);
    if (walletState().status !== "connected") return;
    syncTokens(form, held);
    read.replaceChildren(holdingList(state.address, held));
  } catch (error) {
    read.replaceChildren(line(txMessage(error)));
  }
}

function holdingList(address: Address, held: Holdings): HTMLElement {
  const wrap = document.createElement("div");
  const who = document.createElement("p");
  who.className = "mono";
  who.append(address, " ", copyButton(address, "wallet address"));
  const list = document.createElement("dl");
  list.className = "balances";
  row(list, "QOR", `${formatUnits(held.native, 18)} QOR`);
  row(list, tokenLabel(held.tokenA)?.symbol ?? "Token A", `${wholeUnits(held.walletA, held.tokenA)} in the wallet`);
  row(list, tokenLabel(held.tokenB)?.symbol ?? "Token B", `${wholeUnits(held.walletB, held.tokenB)} in the wallet`);
  row(list, "Idle", `${wholeUnits(held.idleA, held.tokenA)} · ${wholeUnits(held.idleB, held.tokenB)}`);
  const hint = document.createElement("p");
  hint.className = "note";
  hint.textContent = "A deposit credits this wallet's idle balance. Opening, cancelling, and withdrawing need the maker's post-quantum signature, so this wallet cannot do those.";
  wrap.append(who, list, hint);
  return wrap;
}

function row(list: HTMLDListElement, label: string, value: string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function line(text: string): HTMLParagraphElement {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

function syncTokens(form: HTMLFormElement, held: Holdings): void {
  const select = form.elements.namedItem("token");
  if (!(select instanceof HTMLSelectElement) || document.activeElement === select) return;
  const current = select.value;
  select.replaceChildren();
  for (const token of [held.tokenA, held.tokenB]) {
    const option = document.createElement("option");
    option.value = token;
    option.textContent = tokenLabel(token)?.symbol ?? token;
    select.append(option);
  }
  const match = [held.tokenA, held.tokenB].find((token) => token.toLowerCase() === current.toLowerCase());
  if (match) select.value = match;
}

function depositForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "deposit";
  form.hidden = true;
  const tokenLabelNode = document.createElement("label");
  tokenLabelNode.textContent = "Token";
  const token = document.createElement("select");
  token.name = "token";
  const waiting = document.createElement("option");
  waiting.value = "";
  waiting.textContent = "Reading the pair";
  token.append(waiting);
  tokenLabelNode.append(token);
  const amountLabel = document.createElement("label");
  amountLabel.textContent = "Amount";
  const amount = document.createElement("input");
  amount.name = "amount";
  amount.inputMode = "decimal";
  amount.autocomplete = "off";
  amount.placeholder = "0.0";
  amountLabel.append(amount);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Deposit";
  const status = document.createElement("p");
  status.className = "note";
  status.setAttribute("aria-live", "polite");
  form.append(tokenLabelNode, amountLabel, submit, status);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runDeposit(token.value as Address, amount, submit, status);
  });
  return form;
}

async function runDeposit(token: Address, amount: HTMLInputElement, submit: HTMLButtonElement, status: HTMLElement): Promise<void> {
  const known = tokenLabel(token);
  const decimals = known?.decimals;
  const symbol = known?.symbol ?? "token";
  if (!token) {
    status.textContent = "Wait for the pair, then choose a token.";
    return;
  }
  if (decimals === undefined) {
    status.textContent = "This token is not one of the two the book holds.";
    return;
  }
  let units: bigint;
  try {
    units = parseUnits(amount.value.trim(), decimals);
  } catch {
    status.textContent = "Enter an amount, such as 0.01.";
    return;
  }
  if (units <= 0n) {
    status.textContent = "Enter an amount greater than zero.";
    return;
  }
  submit.disabled = true;
  try {
    const current = walletState();
    if (current.status !== "connected") throw new Error("Connect a wallet first.");
    const owner = current.address;
    const allowed = await allowanceOf(token, owner);
    if (allowed < units) {
      status.textContent = `Approve ${symbol} in the wallet.`;
      const approval = await writeContract({ address: token, abi: erc20Write, functionName: "approve", args: [BOOK, units] });
      await settled(approval, status, `${symbol} approval`);
    }
    status.textContent = "Confirm the deposit in the wallet.";
    const hash = await writeContract({ address: BOOK, abi: bookWrite, functionName: "deposit", args: [token, units] });
    await settled(hash, status, "Deposit");
    amount.value = "";
    window.dispatchEvent(new Event("firm-refresh"));
  } catch (error) {
    status.textContent = txMessage(error);
  } finally {
    submit.disabled = false;
  }
}

export function fillDesk(offer: LiveOffer): HTMLElement {
  const section = document.createElement("section");
  section.className = "fill-desk";
  const heading = document.createElement("h2");
  heading.textContent = "Fill";
  const body = document.createElement("div");
  section.append(heading, body);
  const paint = (): void => {
    void paintFill(offer, body);
  };
  const unsubscribe = subscribeWallet(paint);
  const timer = window.setInterval(paint, 12_000);
  stopWhenDetached(section, () => {
    unsubscribe();
    window.clearInterval(timer);
  });
  paint();
  return section;
}

async function paintFill(offer: LiveOffer, body: HTMLElement): Promise<void> {
  if (body.dataset.busy === "1") return;
  body.replaceChildren(line("Reading the curve."));
  try {
    const now = await head();
    const gate = fillGate(offer, now.time, now.block);
    const price = unitPrice(offer, now.time);
    const gross = payment(offer.amountIn, price);
    const summary = document.createElement("p");
    summary.textContent = gate.reason;
    const quote = document.createElement("p");
    quote.className = "quote";
    quote.textContent = `At this block the line is ${priceLabel(price, offer.tokenOut)}. A full fill pays ${wholeUnits(gross, offer.tokenOut)}.`;
    body.replaceChildren(summary, quote);
    if (!gate.ok) return;
    const state = walletState();
    if (state.status !== "connected" || state.chainId !== 9800) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = "Connect to fill";
      button.addEventListener("click", () => {
        void connectWallet();
      });
      body.append(button);
      return;
    }
    const [balance, allowed] = await Promise.all([
      holdings(state.address).then((held) => {
        const out = offer.tokenOut.toLowerCase();
        if (out === held.tokenA.toLowerCase()) return held.walletA;
        if (out === held.tokenB.toLowerCase()) return held.walletB;
        return 0n;
      }),
      allowanceOf(offer.tokenOut, state.address),
    ]);
    const have = document.createElement("p");
    have.className = "note";
    have.textContent = `Wallet holds ${wholeUnits(balance, offer.tokenOut)}. Approved ${wholeUnits(allowed, offer.tokenOut)}.`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = balance < gross ? "Balance is short" : allowed < gross ? "Approve and fill" : "Fill";
    button.disabled = balance < gross;
    const status = document.createElement("p");
    status.className = "note";
    status.setAttribute("aria-live", "polite");
    button.addEventListener("click", () => {
      void runFill(offer, gross, button, status);
    });
    body.append(have, button, status);
  } catch (error) {
    body.replaceChildren(line(txMessage(error)));
  }
}

async function runFill(offer: LiveOffer, gross: bigint, button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  const body = button.parentElement;
  if (body) body.dataset.busy = "1";
  button.disabled = true;
  try {
    const current = walletState();
    if (current.status !== "connected") throw new Error("Connect a wallet first.");
    const owner = current.address;
    const allowed = await allowanceOf(offer.tokenOut, owner);
    if (allowed < gross) {
      const symbol = tokenLabel(offer.tokenOut)?.symbol ?? "the output token";
      status.textContent = `Approve ${symbol} in the wallet.`;
      const approval = await writeContract({
        address: offer.tokenOut,
        abi: erc20Write,
        functionName: "approve",
        args: [BOOK, gross],
      });
      await settled(approval, status, `${symbol} approval`);
    }
    status.textContent = "Confirm the fill in the wallet. The contract chooses the price.";
    const hash = await writeContract({ address: BOOK, abi: bookWrite, functionName: "fill", args: [offer.id] });
    await settled(hash, status, "Fill");
    window.dispatchEvent(new Event("firm-refresh"));
  } catch (error) {
    status.textContent = txMessage(error);
    button.disabled = false;
  } finally {
    if (body) delete body.dataset.busy;
  }
}

async function settled(hash: Hash, status: HTMLElement, name: string): Promise<void> {
  status.replaceChildren(`${name} submitted. Waiting for Diana. `);
  const link = document.createElement("a");
  link.className = "mono";
  link.href = `${EXPLORER}${hash}`;
  link.rel = "noreferrer";
  link.target = "_blank";
  link.textContent = hash;
  status.append(link);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  status.replaceChildren(receipt.status === "success" ? `${name} confirmed. ` : `${name} reverted. `);
  status.append(link);
}
