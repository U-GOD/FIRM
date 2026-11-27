import { copyButton } from "./copy.js";
import { EXPLORER, RUNS } from "./runs.js";

export function recordView(): HTMLElement {
  const page = document.createElement("article");
  page.className = "view";
  const back = document.createElement("a");
  back.className = "back";
  back.href = "#/book";
  back.textContent = "Book";
  const title = document.createElement("h1");
  title.textContent = "Record";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "Every hash below is from the Diana runs. Open one, or copy it. Nothing on this page is a sample.";
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "Links open explore.qore.network. That site starts on mainnet. Set its header to Testnet before reading a Diana hash.";
  page.append(back, title, lede, note);
  for (const run of RUNS) {
    const heading = document.createElement("h2");
    heading.textContent = run.title;
    const list = document.createElement("ul");
    list.className = "blotter";
    for (const row of run.rows) {
      const item = document.createElement("li");
      const step = document.createElement("span");
      step.className = "step";
      step.textContent = row.step;
      const link = document.createElement("a");
      link.className = "mono";
      link.href = `${EXPLORER}${row.hash}`;
      link.rel = "noreferrer";
      link.target = "_blank";
      link.textContent = row.hash;
      item.append(step, link, copyButton(row.hash, row.step));
      list.append(item);
    }
    page.append(heading, list);
  }
  return page;
}
