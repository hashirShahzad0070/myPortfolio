"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { nav } from "@/content/site";
import { Logo, Socials } from "../ui";
import { HudChips } from "./Hud";
import { useUi } from "./UiContext";

/** Smooth scrolling (Lenis) driven by GSAP's ticker, plus the top scroll-progress bar. */
export function SmoothScroll() {
  const bar = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenisRef.current = lenis;
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(raf); lenis.destroy(); lenisRef.current = null; };
  }, []);

  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); };
  }, [pathname]);

  return <div className="progress" ref={bar} aria-hidden="true" />;
}

/** Boot veil: logo bottom-left, counter 0→100 bottom-right, then the paper wipes up. Once per session. */
export function Veil() {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem("veil:seen"); sessionStorage.setItem("veil:seen", "1"); } catch { /* ignore */ }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root.current!;
    const html = document.documentElement;
    // Page intros (the wheels) wait for this signal so they play as the veil lifts.
    const reveal = () => {
      html.removeAttribute("data-veil");
      document.dispatchEvent(new CustomEvent("veil:reveal"));
    };
    html.setAttribute("data-veil", "");
    if (seen || reduced) {
      const t = gsap.to(el, { opacity: 0, duration: 0.35, ease: "power1.out", onStart: reveal, onComplete: () => setDone(true) });
      return () => { t.kill(); html.removeAttribute("data-veil"); };
    }
    const n = { v: 0 };
    const tl = gsap.timeline({ onComplete: () => setDone(true) });
    tl.from(".veil__count", { yPercent: 110, duration: 0.6, ease: "expo.out" })
      .to(n, {
        v: 100, duration: 1.5, ease: "power2.inOut",
        onUpdate: () => { if (count.current) count.current.textContent = String(Math.round(n.v)); },
      }, 0.1)
      .to(".veil__count, .veil__word", { yPercent: -110, opacity: 0, duration: 0.45, ease: "expo.in", stagger: 0.05 }, "+=0.1")
      .add(reveal, "-=0.1")
      .to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "expo.inOut" }, "<");
    return () => { tl.kill(); html.removeAttribute("data-veil"); };
  }, []);

  if (done) return null;
  return (
    <div className="veil" ref={root} style={{ clipPath: "inset(0 0 0 0)" }} aria-hidden="true">
      <div className="veil__boot">
        <span className="veil__word"><Logo /></span>
        <div className="veil__travel"><span className="veil__count" ref={count}>0</span></div>
      </div>
    </div>
  );
}

export function Drawer() {
  const { panel, close } = useUi();
  const isOpen = panel === "drawer";
  return (
    <div className={`drawer${isOpen ? " is-open" : ""}`} aria-hidden={!isOpen}>
      <div className="drawer__sheet">
        <span className="drawer__handle" />
        <nav className="drawer__nav">
          {nav.map((n) => (
            <Link key={n.href} className="drawer__link" href={n.href} onClick={close}>{n.label}</Link>
          ))}
        </nav>
        <div className="drawer__hud"><HudChips compact /></div>
        <Socials />
      </div>
    </div>
  );
}

export function Scrim() {
  const { panel, close } = useUi();
  return <div className={`scrim${panel ? " is-open" : ""}`} onClick={close} aria-hidden="true" />;
}

/** Close any open panel when the route changes. */
export function RouteWatcher() {
  const pathname = usePathname();
  const { close } = useUi();
  useEffect(() => { close(); }, [pathname, close]);
  return null;
}

export function Footer() {
  return (
    <footer className="footer container">
      <div className="footer__grid">
        <Link href="/" aria-label="Home" className="header__logo"><Logo /></Link>
        <nav className="footer__nav text-nav">
          {nav.map((n) => <Link key={n.href} className="footer__link" href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="footer__meta"><HudChips compact /></div>
        <Socials />
      </div>
    </footer>
  );
}
