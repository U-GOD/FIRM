import { curveInput } from "./book.js";
import { readBook, type LiveOffer } from "./chain.js";
import { copyButton } from "./copy.js";
import { curve } from "./curve.js";
import { priceLabel, statusName, wholeUnits } from "./format.js";
import { BOOK, RUN_LOG, SPEC } from "./runs.js";

export async function landingView(): Promise<HTMLElement> {
  const page = document.createElement("article");
  page.className = "landing";
  const read = await readBook();
  const focus = read.offers.find((offer) => offer.id === 1n) ?? read.offers.find((offer) => offer.status === 1) ?? read.offers[0];
  page.append(await hero(focus), beats(), facts(read.offers.length, read.nextId), close());
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
  const enter = document.createElement("a");
  enter.className = "button";
  enter.href = "#/book";
  enter.textContent = "Enter the app";
  actions.append(enter);
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

function facts(count: number, nextId: bigint): HTMLElement {
  const section = document.createElement("section");
  section.className = "facts";
  const heading = document.createElement("h2");
  heading.textContent = "Already on Diana";
  const grid = document.createElement("div");
  grid.className = "fact-grid";
  const items: [string, string, string][] = [
    ["Offers", String(count), "Returned by the book just now."],
    ["Next id", nextId.toString(), "The id the next open would take."],
    ["Your wallet", "Deposit and fill", "Enter the app to connect. The post-quantum key still opens and cancels."],
  ];
  for (const [kicker, value, detail] of items) {
    const card = document.createElement("article");
    const label = document.createElement("p");
    label.className = "eyebrow";
    label.textContent = kicker;
    const strong = document.createElement("p");
    strong.className = "fact";
    strong.textContent = value;
    const text = document.createElement("p");
    text.textContent = detail;
    card.append(label, strong, text);
    grid.append(card);
  }
  section.append(heading, grid);
  return section;
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
