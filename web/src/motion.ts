import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(DrawSVGPlugin, ScrollTrigger, SplitText);

let lenis: Lenis | null = null;
let ctx: gsap.Context | null = null;
let generation = 0;
let headerPlayed = false;

export function startScroll(): void {
  if (lenis) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  lenis = new Lenis({ autoRaf: false, respectReducedMotion: true });
  lenis.on("scroll", ScrollTrigger.update);
  if (!reduce) {
    gsap.ticker.add((time) => {
      lenis?.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }
  if (!headerPlayed && !reduce) {
    headerPlayed = true;
    gsap.from(".bar > *", { y: -16, opacity: 0, duration: 0.6, stagger: 0.06, ease: "power2.out" });
  }
}

export function scrollTop(): void {
  lenis?.scrollTo(0, { immediate: true });
}

export async function play(root: HTMLElement, kind: "landing" | "page"): Promise<void> {
  const mine = ++generation;
  ctx?.revert();
  ctx = null;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  await document.fonts.ready;
  if (mine !== generation || !root.isConnected) return;
  ctx = gsap.context(() => {
    if (kind === "landing") landingMotion();
    else pageMotion();
  }, root);
  ScrollTrigger.refresh();
}

function landingMotion(): void {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const heading = document.querySelector(".hero h1");
  if (heading) {
    const split = SplitText.create(heading, { type: "lines,words", mask: "lines", aria: "auto" });
    tl.from(split.words, { yPercent: 120, duration: 0.95, stagger: 0.035 }, 0);
  }
  tl.from(".hero .eyebrow, .hero .lede, .hero-actions a", {
    y: 22,
    opacity: 0,
    duration: 0.7,
    stagger: 0.08,
  }, 0.2);
  tl.from(".hero-rule", { scaleX: 0, duration: 1.15, ease: "power2.inOut" }, 0.25);
  const path = document.querySelector(".hero-figure path");
  if (path) tl.from(path, { drawSVG: 0, duration: 1.6, ease: "power2.inOut" }, 0.35);
  tl.from(".hero-figure .mark", { scale: 0, duration: 0.45, ease: "back.out(2)" }, 1.55);
  tl.from(".hero-figure text", { opacity: 0, duration: 0.45, stagger: 0.06 }, 1.15);

  const beats = document.querySelector(".beats");
  if (beats) {
    gsap.from(".beat", {
      scrollTrigger: { trigger: beats, start: "top 78%" },
      y: 48,
      opacity: 0,
      duration: 0.75,
      stagger: 0.12,
      ease: "power3.out",
    });
  }
  const book = document.querySelector(".landing-book");
  if (book) {
    gsap.from(".landing-book tbody tr", {
      scrollTrigger: { trigger: book, start: "top 75%" },
      y: 20,
      opacity: 0,
      duration: 0.55,
      stagger: 0.08,
      ease: "power2.out",
    });
  }
}

function pageMotion(): void {
  gsap.from("h1, .lede, .actions > *, tbody tr, .featured, .fields dt, .recorded, .blotter li", {
    y: 22,
    opacity: 0,
    duration: 0.55,
    stagger: 0.035,
    ease: "power2.out",
  });
  const path = document.querySelector(".curve path");
  if (path) gsap.from(path, { drawSVG: 0, duration: 1.3, ease: "power2.inOut", delay: 0.15 });
}
