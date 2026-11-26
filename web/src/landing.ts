import { curveInput } from "./book.js";
import { readBook, type LiveOffer } from "./chain.js";
import { copyButton } from "./copy.js";
import { curve } from "./curve.js";
import { priceLabel, statusClass, statusName, wholeUnits } from "./format.js";
import { BOOK, RUN_LOG, SPEC } from "./runs.js";

export async function landingView(): Promise<HTMLElement> {
  const page = document.createElement("article");
  page.className = "landing";
  const read = await readBook();
  const focus = read.offers.find((offer) => offer.id === 1n) ?? read.offers.find((offer) => offer.status === 1) ?? read.offers[0];
  page.append(await hero(focus), beats(), liveBook(read.offers, read.truncated, read.nextId), close());
  return page;
}

async function hero(offer: LiveOffer | undefined): Promise<HTMLElement> {
  const section = document.createElement("section");
  section.className = "hero";
  const copy = document.createElement("div");
  copy.className = "hero-copy";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Diana testnet · chain 9800";
  const title = document.createElement("h1");
  title.textContent = "A Dutch offer the classical key cannot pull.";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "The maker signs a line. The contract prices the fill. A cancel waits out the delay the maker signed.";
  const actions = document.createElement("div");
  actions.className = "hero-actions";
  const book = document.createElement("a");
  book.className = "button";
  book.href = "#/book";
  book.textContent = "Open the book";
  const record = document.createElement("a");
  record.href = "#/record";
  record.textContent = "Record";
  actions.append(book, record);
  copy.append(eyebrow, title, lede, actions);

  const figure = document.createElement("figure");
  figure.className = "hero-figure";
  if (offer) {
    figure.append(curve(await curveInput(offer)));
    const caption = document.createElement("figcaption");
    caption.textContent = `Offer ${offer.id} · ${statusName(offer.status)} · ${wholeUnits(offer.amountIn, offer.tokenIn)} · ${priceLabel(offer.startPrice, offer.tokenOut)} to ${priceLabel(offer.endPrice, offer.tokenOut)}`;
    figure.append(caption);
  } else {
    const empty = document.createElement("p");
    empty.textContent = "This book has no offer to draw.";
    figure.append(empty);
  }

  const rule = document.createElement("div");
  rule.className = "hero-rule";
  section.append(copy, figure, rule);
  return section;
}

function beats(): HTMLElement {
  const section = document.createElement("section");
  section.className = "stage";
  const heading = document.createElement("h2");
  heading.textContent = "How it settles";
  const grid = document.createElement("div");
  grid.className = "beats";
  const items: [string, string, string][] = [
    ["01", "The maker signs a line", "Start price, end price, and the window are in the signature. The book stores that line."],
    ["02", "The contract prices the fill", "The price is the point on the line at the time of the fill. The page does not choose it."],
    ["03", "A cancel waits", "The maker's post-quantum cancel cannot land in the same block as a fill. It waits out the signed delay."],
  ];
  for (const [num, title, body] of items) {
    const beat = document.createElement("article");
    beat.className = "beat";
    const index = document.createElement("span");
    index.className = "num";
    index.textContent = num;
    const name = document.createElement("h3");
    name.textContent = title;
    const text = document.createElement("p");
    text.textContent = body;
    beat.append(index, name, text);
    grid.append(beat);
  }
  section.append(heading, grid);
  return section;
}

function liveBook(offers: LiveOffer[], truncated: boolean, nextId: bigint): HTMLElement {
  const section = document.createElement("section");
  section.className = "landing-book";
  const heading = document.createElement("h2");
  heading.textContent = "On this book";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "These rows are the offers the contract returned. The page only reads them.";
  section.append(heading, lede);
  if (truncated) {
    const cap = document.createElement("p");
    cap.className = "note";
    cap.textContent = `Showing the first 32 offers. Next id is ${nextId}.`;
    section.append(cap);
  }
  if (offers.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "This book has no offers.";
    section.append(empty);
    return section;
  }
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Offer", "Input", "Line", "Status", "cancelReadyAt"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const offer of offers) {
    const row = document.createElement("tr");
    row.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) return;
      location.hash = `#/offer/${offer.id}`;
    });
    const id = document.createElement("th");
    id.scope = "row";
    id.dataset.label = "Offer";
    const link = document.createElement("a");
    link.href = `#/offer/${offer.id}`;
    link.textContent = offer.id.toString();
    id.append(link);
    const input = dataCell("Input", wholeUnits(offer.amountIn, offer.tokenIn));
    const line = dataCell("Line", `${priceLabel(offer.startPrice, offer.tokenOut)} → ${priceLabel(offer.endPrice, offer.tokenOut)}`);
    const status = document.createElement("td");
    status.dataset.label = "Status";
    const word = document.createElement("span");
    word.className = `status ${statusClass(offer.status)}`.trim();
    word.textContent = statusName(offer.status);
    status.append(word);
    const ready = dataCell("cancelReadyAt", offer.cancelReadyAt.toString());
    ready.classList.add("mono");
    row.append(id, input, line, status, ready);
    body.append(row);
  }
  table.append(head, body);
  section.append(table);
  return section;
}

function dataCell(label: string, value: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = value;
  return cell;
}

function close(): HTMLElement {
  const foot = document.createElement("footer");
  foot.className = "colophon";
  const address = document.createElement("p");
  address.className = "mono";
  address.append(BOOK, " ", copyButton(BOOK, "book address"));
  const chain = document.createElement("p");
  chain.textContent = "Diana testnet, chain 9800. The filler of the recorded offer is our second key. ";
  const run = document.createElement("a");
  run.href = RUN_LOG;
  run.rel = "noreferrer";
  run.target = "_blank";
  run.textContent = "docs/RUN.md";
  chain.append(run);
  const license = document.createElement("p");
  const spec = document.createElement("a");
  spec.href = SPEC;
  spec.rel = "noreferrer";
  spec.target = "_blank";
  spec.textContent = "Repository";
  license.append("MIT. ", spec, ".");
  foot.append(address, chain, license);
  return foot;
}
