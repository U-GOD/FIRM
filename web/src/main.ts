import { bookView } from "./book.js";
import { landingView } from "./landing.js";
import { play, scrollTop, startScroll } from "./motion.js";
import { recordView } from "./record.js";
import { sheetView } from "./sheet.js";

type Route = { name: "landing" } | { name: "book" } | { name: "record" } | { name: "sheet"; id: bigint };

const outlet = document.querySelector("#outlet");
const notice = document.querySelector("#notice");

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

async function render(): Promise<void> {
  if (!outlet || !notice) return;
  const here = route();
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
    await play(view, here.name === "landing" ? "landing" : "page");
    const heading = view.querySelector("h1");
    if (booted && heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  } catch (error) {
    outlet.replaceChildren();
    notice.textContent = error instanceof Error ? error.message : "The book could not be read.";
  }
  booted = true;
}

function titleFor(here: Route, view: HTMLElement): string {
  if (here.name === "landing") return "FIRM";
  if (here.name === "record") return "Record — FIRM";
  if (here.name === "sheet") {
    const heading = view.querySelector("h1")?.textContent;
    return heading ? `${heading} — FIRM` : "FIRM";
  }
  return "FIRM — read-only book";
}

window.addEventListener("hashchange", () => {
  void render();
});

startScroll();
void render();
