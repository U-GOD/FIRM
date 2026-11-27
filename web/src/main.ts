import { bookView } from "./book.js";
import { landingView } from "./landing.js";
import { play, scrollTop, startScroll } from "./motion.js";
import { recordView } from "./record.js";
import { sheetView } from "./sheet.js";
import { mountWallet } from "./wallet.js";

type Route = { name: "landing" } | { name: "book" } | { name: "record" } | { name: "sheet"; id: bigint };

const outlet = document.querySelector("#outlet");
const notice = document.querySelector("#notice");
const connect = document.querySelector("#connect");
const walletNote = document.querySelector("#wallet-note");
if (connect instanceof HTMLButtonElement && walletNote instanceof HTMLElement) mountWallet(connect, walletNote);

function route(): Route {
  const hash = location.hash.replace(/^#/, "");
  const offer = /^\/offer\/(\d+)$/.exec(hash);
  if (offer) return { name: "sheet", id: BigInt(offer[1]) };
  if (hash === "/book") return { name: "book" };
  if (hash === "/record") return { name: "record" };
  if (hash === "" || hash === "/" || hash === "/home") return { name: "landing" };
  return { name: "book" };
}

function markNav(here: Route): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-nav]")) {
    const current = here.name === "sheet" ? "book" : here.name;
    const on = link.dataset.nav === current;
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

let booted = false;
let rendering = false;
let queued = false;

async function render(): Promise<void> {
  if (rendering) {
    queued = true;
    return;
  }
  rendering = true;
  try {
    await paint();
  } finally {
    rendering = false;
    if (queued) {
      queued = false;
      void render();
    }
  }
}

async function paint(): Promise<void> {
  if (!outlet || !notice) return;
  const here = route();
  document.body.classList.toggle("is-landing", here.name === "landing");
  document.body.classList.toggle("is-app", here.name !== "landing");
  markNav(here);
  scrollTop();
  outlet.replaceChildren();
  notice.textContent = here.name === "record" ? "" : "Reading the book.";
  try {
    const view =
      here.name === "landing"
        ? await landingView()
        : here.name === "record"
          ? recordView()
          : here.name === "sheet"
            ? await sheetView(here.id)
            : await bookView();
    notice.textContent = "";
    outlet.replaceChildren(view);
    document.title = titleFor(here, view);
    scrollTop();
    await play(view, here.name === "landing" ? "landing" : "page");
    const heading = view.querySelector("h1");
    if (booted && heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  } catch (error) {
    notice.textContent = "";
    outlet.replaceChildren(failure(here, error));
    document.title = "FIRM";
  }
  booted = true;
}

function failure(here: Route, error: unknown): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "empty";
  if (here.name !== "landing" && here.name !== "book") {
    const back = document.createElement("a");
    back.className = "back";
    back.href = "#/book";
    back.textContent = "Book";
    panel.append(back);
  }
  const title = document.createElement("h1");
  title.textContent = "The book did not answer.";
  const text = document.createElement("p");
  text.textContent = error instanceof Error ? error.message : "The read failed.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => {
    void render();
  });
  panel.append(title, text, retry);
  return panel;
}

function titleFor(here: Route, view: HTMLElement): string {
  if (here.name === "landing") return "FIRM";
  if (here.name === "record") return "Record — FIRM";
  if (here.name === "sheet") {
    const heading = view.querySelector("h1")?.textContent;
    return heading ? `${heading} — FIRM` : "FIRM";
  }
  return "Book — FIRM";
}

window.addEventListener("hashchange", () => {
  void render();
});

window.addEventListener("firm-refresh", () => {
  void render();
});

startScroll();
void render();
