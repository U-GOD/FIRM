import { readOne, type LiveOffer } from "./chain.js";
import { curveInput } from "./book.js";
import { curve } from "./curve.js";
import { agrees, priceLabel, statusClass, statusName, when, wholeUnits } from "./format.js";
import { EXPLORER, recordedFor, runHash } from "./runs.js";
import { copyButton } from "./copy.js";

export async function sheetView(id: bigint): Promise<HTMLElement> {
  const read = await readOne(id);
  const page = document.createElement("article");
  page.className = "view";
  if (!read.offer) {
    const title = document.createElement("h1");
    title.textContent = `Offer ${id}`;
    const empty = document.createElement("p");
    empty.textContent = `Offer ${id} is not on this book.`;
    const back = document.createElement("a");
    back.href = "#/book";
    back.textContent = "Back to the book";
    page.append(title, empty, back);
    return page;
  }
  page.append(render(read.offer));
  return page;
}

function render(offer: LiveOffer): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const header = document.createElement("header");
  header.className = "sheet-head";
  const title = document.createElement("h1");
  title.textContent = `Offer ${offer.id}`;
  const status = document.createElement("p");
  status.className = `status ${statusClass(offer.status)}`.trim();
  status.textContent = statusName(offer.status);
  header.append(title, status);

  const intro = document.createElement("p");
  intro.className = "lede";
  intro.textContent = introLine(offer);

  const layout = document.createElement("div");
  layout.className = "sheet-layout";
  const curveWrap = document.createElement("div");
  curveWrap.className = "curve-wrap";
  const fields = definition(offer);
  layout.append(curveWrap, fields);

  const back = document.createElement("p");
  const backLink = document.createElement("a");
  backLink.href = "#/book";
  backLink.textContent = "Back to the book";
  back.append(backLink);
  const recorded = recordedBlock(offer);
  fragment.append(header, intro, layout, recorded, back);
  void curveInput(offer)
    .then((input) => {
      curveWrap.append(curve(input));
    })
    .catch(() => {
      const fail = document.createElement("p");
      fail.className = "note";
      fail.textContent = "The price line could not be drawn.";
      curveWrap.append(fail);
    });
  return fragment;
}

function introLine(offer: LiveOffer): string {
  const locked = `${wholeUnits(offer.amountIn, offer.tokenIn)} locked. Line from ${priceLabel(offer.startPrice, offer.tokenOut)} to ${priceLabel(offer.endPrice, offer.tokenOut)}.`;
  const ready = `cancelReadyAt ${offer.cancelReadyAt}.`;
  const recorded = recordedFor(offer.id);
  if (!recorded || !agrees(offer)) return `${locked} ${ready}`;
  const relation = recorded.fillBlock < offer.cancelReadyAt ? "before" : "after";
  return `${locked} ${ready} Fill block ${recorded.fillBlock} is ${relation} it.`;
}

function definition(offer: LiveOffer): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "fields";
  pair(list, "Maker", offer.maker, offer.maker);
  pair(list, "Input", wholeUnits(offer.amountIn, offer.tokenIn), offer.amountIn.toString());
  pair(list, "Start price", priceLabel(offer.startPrice, offer.tokenOut), offer.startPrice.toString());
  pair(list, "End price", priceLabel(offer.endPrice, offer.tokenOut), offer.endPrice.toString());
  pair(list, "Window", when(offer.startTime), `ends ${when(offer.endTime)}`);
  pair(list, "cancelReadyAt", offer.cancelReadyAt.toString(), `${offer.cancelDelay} block delay`);
  pair(list, "Fee", `${offer.feeBps} bps`, offer.feeBps === 0 ? "none taken" : offer.feeRecipient);
  pair(list, "Recipient", offer.recipient, "where the output goes");
  return list;
}

function pair(list: HTMLDListElement, label: string, whole: string, raw: string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const value = document.createElement("dd");
  value.append(whole);
  if (raw !== whole) {
    const small = document.createElement("span");
    small.className = "raw";
    small.textContent = raw;
    value.append(small);
  }
  if (label === "Maker" || label === "Recipient") value.append(" ", copyButton(whole, label));
  list.append(term, value);
}

function recordedBlock(offer: LiveOffer): HTMLElement {
  const block = document.createElement("section");
  block.className = "recorded";
  const recorded = recordedFor(offer.id);
  const text = document.createElement("p");
  if (!recorded) {
    text.textContent = "This offer is not in the run log. The fields above are the chain.";
    block.append(text);
    return block;
  }
  if (!agrees(offer)) {
    text.textContent = "The chain and docs/RUN.md disagree. The fields above are the chain.";
    block.append(text);
    return block;
  }
  if ("gross" in recorded && "unitPrice" in recorded) {
    const payment = priceLabel(recorded.gross, offer.tokenOut);
    text.textContent = `Recorded fill, ${recorded.recordedOn}, from docs/RUN.md. Unit price ${recorded.unitPrice}. Payment ${recorded.gross} output base units (${payment}). This payment is not stored on the offer after the fill.`;
  } else {
    text.textContent = `Recorded on ${recorded.recordedOn}, from docs/RUN.md. The fill in block ${recorded.fillBlock} reverted.`;
  }
  block.append(text);
  const hash = runHash(recorded.runTitle, recorded.fillStep);
  if (hash) {
    const warn = document.createElement("p");
    warn.className = "note";
    warn.textContent = "The explorer opens on mainnet. Set its header to Testnet before reading a Diana hash.";
    const link = document.createElement("a");
    link.className = "mono";
    link.href = `${EXPLORER}${hash}`;
    link.rel = "noreferrer";
    link.target = "_blank";
    link.textContent = hash;
    block.append(warn, link, " ", copyButton(hash, "fill hash"));
  }
  return block;
}
