import { accountDock } from "./desk.js";
import { blockTime, readBook, type LiveOffer } from "./chain.js";
import { curve } from "./curve.js";
import { copyButton } from "./copy.js";
import { agrees, priceLabel, statusClass, statusName, wholeUnits } from "./format.js";
import { BOOK, recordedFor, RUN_LOG, SPEC } from "./runs.js";

export async function bookView(): Promise<HTMLElement> {
  const read = await readBook();
  const page = document.createElement("article");
  page.className = "view";
  const title = document.createElement("h1");
  title.textContent = "The book";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "Deposit either token, or fill an offer while its window is open. The contract prices the fill. A browser wallet cannot open, cancel, or withdraw, because those need the maker's post-quantum signature.";
  page.append(title, lede, accountDock(), actions(read.offers));

  if (read.truncated) {
    const cap = document.createElement("p");
    cap.className = "note";
    cap.textContent = `Showing the first 32 offers. Next id is ${read.nextId}.`;
    page.append(cap);
  }

  if (read.offers.length === 0) {
    const empty = document.createElement("section");
    empty.className = "empty";
    const heading = document.createElement("h2");
    heading.textContent = "No offers yet";
    const text = document.createElement("p");
    text.textContent = "A deposit sits in idle until a post-quantum signature opens an offer. The wallet panel above can make that deposit.";
    empty.append(heading, text);
    page.append(empty);
  } else {
    page.append(table(read.offers));
    const featured = read.offers.find((offer) => offer.id === 1n) ?? read.offers.find((offer) => offer.status === 1) ?? read.offers[0];
    if (featured) page.append(await featuredCurve(featured));
  }

  page.append(principles(), colophon());
  return page;
}

function actions(offers: LiveOffer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "actions";
  const open = offers.find((offer) => offer.status === 1);
  if (open) {
    const primary = document.createElement("a");
    primary.className = "button";
    primary.href = `#/offer/${open.id}`;
    primary.textContent = `Fill offer ${open.id}`;
    row.append(primary);
  }
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "button ghost";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", () => {
    refresh.disabled = true;
    refresh.textContent = "Reading";
    window.dispatchEvent(new Event("firm-refresh"));
  });
  const record = document.createElement("a");
  record.href = "#/record";
  record.textContent = "Record";
  row.append(refresh, record);
  return row;
}

function table(offers: LiveOffer[]): HTMLTableElement {
  const table = document.createElement("table");
  table.id = "book-table";
  const caption = document.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent = "Offers on the book";
  const head = document.createElement("thead");
  const labels = ["Offer", "Input", "Line", "Status", "cancelReadyAt"];
  const headRow = document.createElement("tr");
  for (const label of labels) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const offer of offers) body.append(offerRow(offer));
  table.append(caption, head, body);
  return table;
}

function offerRow(offer: LiveOffer): HTMLTableRowElement {
  const row = document.createElement("tr");
  const id = document.createElement("th");
  id.scope = "row";
  id.dataset.label = "Offer";
  const link = document.createElement("a");
  link.href = `#/offer/${offer.id}`;
  link.textContent = offer.id.toString();
  id.append(link);
  row.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) return;
    location.hash = `#/offer/${offer.id}`;
  });
  row.append(
    id,
    cell("Input", wholeUnits(offer.amountIn, offer.tokenIn)),
    cell("Line", `${priceLabel(offer.startPrice, offer.tokenOut)} → ${priceLabel(offer.endPrice, offer.tokenOut)}`),
    statusCell(offer.status),
    cell("cancelReadyAt", offer.cancelReadyAt.toString(), true),
  );
  return row;
}

function cell(label: string, value: string, mono = false): HTMLTableCellElement {
  const node = document.createElement("td");
  node.dataset.label = label;
  node.textContent = value;
  if (mono) node.className = "mono";
  return node;
}

function statusCell(status: number): HTMLTableCellElement {
  const node = document.createElement("td");
  node.dataset.label = "Status";
  const word = document.createElement("span");
  word.className = `status ${statusClass(status)}`.trim();
  word.textContent = statusName(status);
  node.append(word);
  return node;
}

async function featuredCurve(offer: LiveOffer): Promise<HTMLElement> {
  const wrap = document.createElement("figure");
  wrap.className = "featured";
  const caption = document.createElement("figcaption");
  caption.textContent = `Offer ${offer.id}, from the start price to the end price.`;
  wrap.append(caption, curve(await curveInput(offer)));
  return wrap;
}

export async function curveInput(offer: LiveOffer): Promise<Parameters<typeof curve>[0]> {
  const startLabel = priceLabel(offer.startPrice, offer.tokenOut);
  const endLabel = priceLabel(offer.endPrice, offer.tokenOut);
  const recorded = recordedFor(offer.id);
  let mark: { at: bigint; price: bigint; label: string } | null = null;
  if (recorded && "unitPrice" in recorded && agrees(offer)) {
    try {
      const at = await blockTime(recorded.fillBlock);
      if (at >= offer.startTime && at <= offer.endTime) {
        mark = { at, price: recorded.unitPrice, label: priceLabel(recorded.unitPrice, offer.tokenOut) };
      }
    } catch {
      mark = null;
    }
  }
  return {
    startPrice: offer.startPrice,
    endPrice: offer.endPrice,
    startTime: offer.startTime,
    endTime: offer.endTime,
    startLabel,
    endLabel,
    mark,
  };
}

function principles(): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "principles";
  const items: [string, string][] = [
    ["Full fill", "The contest book takes the whole input or none of it."],
    ["Signed recipient", "The filler does not choose where the output goes."],
    ["Classical key", "It can pay gas. The book does not treat it as the maker."],
    ["This wallet", "It can deposit and fill. Opening, cancelling, and withdrawing stay with the post-quantum key."],
  ];
  for (const [term, detail] of items) {
    const group = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = detail;
    group.append(dt, dd);
    list.append(group);
  }
  return list;
}

function colophon(): HTMLElement {
  const foot = document.createElement("footer");
  foot.className = "colophon";
  const address = document.createElement("p");
  address.className = "mono";
  address.append(BOOK, " ", copyButton(BOOK, "book address"));
  const chain = document.createElement("p");
  chain.textContent = "Diana testnet, chain 9800. ";
  const run = document.createElement("a");
  run.href = RUN_LOG;
  run.rel = "noreferrer";
  run.target = "_blank";
  run.textContent = "docs/RUN.md";
  chain.append(run);
  const filler = document.createElement("p");
  filler.textContent = "The filler of the recorded offer is our second key.";
  const license = document.createElement("p");
  license.append("MIT. ");
  const spec = document.createElement("a");
  spec.href = SPEC;
  spec.rel = "noreferrer";
  spec.target = "_blank";
  spec.textContent = "Repository.";
  license.append(spec);
  foot.append(address, chain, filler, license);
  return foot;
}
