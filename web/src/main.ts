import { createPublicClient, formatUnits, http, type Address } from "viem";
import { BOOK, EXPLORER, RECORDED, RUNS } from "./runs.js";

const diana = {
  id: 9800,
  name: "qorechain-diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 6 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
} as const;

const bookAbi = [
  {
    type: "function",
    name: "offers",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "maker", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "startPrice", type: "uint256" },
      { name: "endPrice", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cancelDelay", type: "uint64" },
      { name: "feeBps", type: "uint16" },
      { name: "feeRecipient", type: "address" },
      { name: "cancelReadyAt", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "nextId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const STATUS = ["None", "Open", "Filled", "Cancel pending", "Cancelled"];

type Stored = {
  maker: Address;
  amountIn: bigint;
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  cancelDelay: bigint;
  feeBps: number;
  cancelReadyAt: bigint;
  status: number;
};

const client = createPublicClient({ chain: diana, transport: http(diana.rpcUrls.default.http[0]) });

function text(parent: HTMLElement, tag: string, value: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

function row(list: HTMLElement, label: string, whole: string, raw: string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const value = document.createElement("dd");
  value.append(whole);
  const small = document.createElement("span");
  small.className = "raw";
  small.textContent = raw;
  value.append(small);
  list.append(term, value);
}

function chart(offer: Stored, mark: { at: bigint; price: bigint; label: string } | null): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 200");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Price line from the start price to the end price");
  const pad = 28;
  const width = 640 - pad * 2;
  const height = 140;
  const hi = offer.startPrice > offer.endPrice ? offer.startPrice : offer.endPrice;
  const lo = offer.startPrice < offer.endPrice ? offer.startPrice : offer.endPrice;
  const span = hi - lo || 1n;
  const yOf = (price: bigint) => pad + (Number(hi - price) / Number(span)) * height;
  const y0 = yOf(offer.startPrice);
  const y1 = yOf(offer.endPrice);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${pad} ${y0} L ${pad + width} ${y1}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#1c1915");
  path.setAttribute("stroke-width", "2");
  svg.append(path);
  if (mark && offer.endTime > offer.startTime) {
    const elapsed = mark.at < offer.startTime ? 0n : mark.at > offer.endTime ? offer.endTime - offer.startTime : mark.at - offer.startTime;
    const x = pad + (Number(elapsed) / Number(offer.endTime - offer.startTime)) * width;
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(yOf(mark.price)));
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", "#9a3412");
    svg.append(dot);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(Math.min(x + 8, 520)));
    label.setAttribute("y", String(yOf(mark.price) - 8));
    label.setAttribute("fill", "#9a3412");
    label.setAttribute("font-size", "13");
    label.textContent = mark.label;
    svg.append(label);
  }
  return svg;
}

function offerCard(offer: Stored, id: bigint, recorded: string, mark: { at: bigint; price: bigint; label: string } | null): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";
  const header = document.createElement("header");
  text(header, "h2", `Offer ${id}`);
  const status = text(header, "p", STATUS[offer.status] ?? `Status ${offer.status}`, "status");
  if (offer.status === 2) status.classList.add("filled");
  card.append(header);
  const list = document.createElement("dl");
  row(list, "Input", `${formatUnits(offer.amountIn, 18)} fETH`, offer.amountIn.toString());
  row(list, "Start price", `${formatUnits(offer.startPrice, 6)} fUSD`, offer.startPrice.toString());
  row(list, "End price", `${formatUnits(offer.endPrice, 6)} fUSD`, offer.endPrice.toString());
  row(list, "Window", new Date(Number(offer.startTime) * 1000).toISOString(), `ends ${new Date(Number(offer.endTime) * 1000).toISOString()}`);
  row(list, "cancelReadyAt", offer.cancelReadyAt.toString(), `${offer.cancelDelay} block delay`);
  row(list, "Fee", `${offer.feeBps} bps`, "taken in the output token");
  row(list, "Maker", offer.maker, "the account that signed the offer");
  card.append(list, chart(offer, mark));
  text(card, "p", recorded, "match");
  return card;
}

function hashSection(): HTMLElement {
  const section = document.createElement("section");
  text(section, "h2", "Recorded transactions");
  text(
    section,
    "p",
    "Links open explore.qore.network. That site starts on mainnet. Set its header to Testnet before reading a Diana hash.",
    "note",
  );
  for (const run of RUNS) {
    text(section, "h3", run.title);
    const list = document.createElement("ul");
    list.className = "hash-list";
    for (const row of run.rows) {
      const item = document.createElement("li");
      text(item, "span", row.step);
      const link = document.createElement("a");
      link.href = `${EXPLORER}${row.hash}`;
      link.textContent = row.hash;
      link.rel = "noreferrer";
      link.target = "_blank";
      item.append(link);
      list.append(item);
    }
    section.append(list);
  }
  return section;
}

async function readOffer(id: bigint): Promise<Stored> {
  const offer = await client.readContract({
    address: BOOK,
    abi: bookAbi,
    functionName: "offers",
    args: [id],
  });
  return {
    maker: offer[0],
    amountIn: offer[3],
    startPrice: offer[4],
    endPrice: offer[5],
    startTime: offer[6],
    endTime: offer[7],
    cancelDelay: offer[9],
    feeBps: offer[10],
    cancelReadyAt: offer[12],
    status: offer[13],
  };
}

function agrees(offer: Stored, recorded: { amount: bigint; status: number; cancelReadyAt: bigint }): boolean {
  return offer.amountIn === recorded.amount && offer.status === recorded.status && offer.cancelReadyAt === recorded.cancelReadyAt;
}

async function main(): Promise<void> {
  const meta = document.querySelector("#meta");
  const offers = document.querySelector("#offers");
  const runs = document.querySelector("#runs");
  if (!meta || !offers || !runs) return;
  try {
    const nextId = await client.readContract({ address: BOOK, abi: bookAbi, functionName: "nextId" });
    const [first, second] = await Promise.all([readOffer(1n), readOffer(2n)]);
    const fillBlock = await client.getBlock({ blockNumber: RECORDED.offerA.fillBlock });
    meta.textContent = `Book ${BOOK}. Next id ${nextId}. Offer 1 is ${STATUS[first.status] ?? first.status}.`;
    const aMatch = agrees(first, RECORDED.offerA);
    const bMatch = agrees(second, RECORDED.offerB);
    offers.append(
      offerCard(
        first,
        1n,
        aMatch
          ? `Matches docs/RUN.md. Filled in block ${RECORDED.offerA.fillBlock}, before cancel block ${first.cancelReadyAt}. Paid ${formatUnits(RECORDED.offerA.gross, 6)} fUSD.`
          : "The chain read does not match docs/RUN.md.",
        { at: fillBlock.timestamp, price: RECORDED.offerA.unitPrice, label: `${formatUnits(RECORDED.offerA.unitPrice, 6)} fUSD` },
      ),
      offerCard(
        second,
        2n,
        bMatch
          ? `Matches docs/RUN.md. The fill in block ${RECORDED.offerB.fillBlock} is after cancel block ${second.cancelReadyAt}.`
          : "The chain read does not match docs/RUN.md.",
        null,
      ),
    );
    runs.append(hashSection());
  } catch (error) {
    meta.textContent = "";
    text(meta, "p", error instanceof Error ? error.message : "The book could not be read.", "error");
  }
}

void main();
