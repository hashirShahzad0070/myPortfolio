"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { nav, site } from "@/content/site";
import { Roll } from "../ui";
import { Bell, Moon, Search, Sun } from "../Icons";
import { Hud } from "./Hud";
import { useUi } from "./UiContext";
import { useUnread } from "./Notifications";

/** "/" is only current on the home page itself; other links also match their sub-pages. */
const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function NavPill() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const list = listRef.current, pill = pillRef.current;
    if (!list || !pill) return;
    const nav = list.parentElement!;
    let shown = false;

    const moveTo = (el: HTMLElement | null) => {
      if (!el) {
        pill.style.opacity = "0";
        shown = false;
        return;
      }
      const nb = nav.getBoundingClientRect(), b = el.getBoundingClientRect();
      // First appearance jumps into place; afterwards it glides between links.
      pill.classList.toggle("is-instant", !shown);
      pill.style.width = `${b.width}px`;
      pill.style.height = `${b.height}px`;
      pill.style.transform = `translate(${b.left - nb.left}px, ${b.top - nb.top}px)`;
      pill.style.opacity = "1";
      if (!shown) requestAnimationFrame(() => pill.classList.remove("is-instant"));
      shown = true;
    };
    const current = () => list.querySelector<HTMLElement>('[aria-current="page"]');
    moveTo(current());

    const onOver = (e: Event) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>(".navpill__link");
      if (a) moveTo(a);
    };
    const onLeave = () => moveTo(current());
    list.addEventListener("pointerover", onOver);
    list.addEventListener("focusin", onOver);
    list.addEventListener("pointerleave", onLeave);
    list.addEventListener("focusout", onLeave);
    window.addEventListener("resize", onLeave);
    return () => {
      list.removeEventListener("pointerover", onOver);
      list.removeEventListener("focusin", onOver);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("focusout", onLeave);
      window.removeEventListener("resize", onLeave);
    };
  }, [pathname]);

  return (
    <nav className="navpill" aria-label="Primary">
      <span className="navpill__pill" ref={pillRef} />
      <ul className="navpill__list" ref={listRef}>
        {nav.map((n) => (
          <li key={n.href}>
            <Link className="navpill__link text-nav" href={n.href} aria-current={isCurrent(pathname, n.href) ? "page" : undefined}>
              <Roll text={n.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The header logo: the capsule rolls from the second initial to the current page's name. */
function HeaderLogo({ word }: { word: string }) {
  const capRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(word);
  const first = useRef(true);

  useEffect(() => {
    const cap = capRef.current!;
    const roller = cap.querySelector<HTMLElement>(".logo__roller")!;
    if (first.current) { first.current = false; roller.textContent = word; shown.current = word; return; }
    if (word === shown.current) return;
    const from = cap.getBoundingClientRect().width;
    const prev = shown.current;
    shown.current = word;
    // measure the new width, then animate width + roll the old word up and the new one in
    roller.textContent = word;
    const to = cap.getBoundingClientRect().width;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    roller.textContent = "";
    const out = document.createElement("span"), inn = document.createElement("span");
    out.className = inn.className = "logo__roll";
    out.textContent = prev; inn.textContent = word;
    roller.append(out, inn);
    gsap.fromTo(cap, { width: from }, { width: to, duration: 0.6, ease: "expo.out", clearProps: "width" });
    gsap.fromTo(out, { yPercent: 0 }, { yPercent: -110, duration: 0.45, ease: "expo.in" });
    gsap.fromTo(inn, { yPercent: 110 }, {
      yPercent: 0, duration: 0.6, ease: "expo.out", delay: 0.2,
      onComplete: () => { roller.textContent = word; },
    });
  }, [word]);

  return (
    <span className="logo" aria-label={site.name}>
      <span className="logo__shape logo__circle">{site.initials[0]}</span>
      <span className={`logo__shape logo__capsule${word.length === 1 ? " logo__capsule--single" : ""}`} ref={capRef}>
        <span className="logo__word"><span className="logo__roller">{word}</span></span>
      </span>
    </span>
  );
}

function ThemeToggle() {
  const { resolved, setTheme } = useUi();
  return (
    <div className="themetoggle" role="group" aria-label="Theme" data-mode={resolved}>
      <span className="themetoggle__bg" aria-hidden="true" />
      <button className="themetoggle__seg" type="button" aria-label="Light theme" aria-pressed={resolved === "light"} onClick={() => setTheme("light")}>
        <Sun />
      </button>
      <button className="themetoggle__seg" type="button" aria-label="Dark theme" aria-pressed={resolved === "dark"} onClick={() => setTheme("dark")}>
        <Moon />
      </button>
    </div>
  );
}

export function Header() {
  const { open, toggle, panel } = useUi();
  const pathname = usePathname();
  const unread = useUnread();
  const [hidden, setHidden] = useState(false);

  // Hide on scroll down, reveal on scroll up.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 120 && y > last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // on the home page the capsule keeps your initial instead of reading "Home"
  const crumb = nav.find((n) => n.href !== "/" && isCurrent(pathname, n.href))?.label;

  return (
    <header className={`header${hidden && !panel ? " is-hidden" : ""}`}>
      <Hud />
      <div className="header__bar">
        <div className="header__lead">
          <Link className="header__logo" href="/" aria-label="Home"><HeaderLogo word={crumb ?? site.initials[1]} /></Link>
        </div>
        <div className="header__center">
          <NavPill />
          <button className="cmdk" type="button" onClick={() => open("cmd")} aria-label="Open command menu" aria-keyshortcuts="Meta+K">
            <Roll text="⌘K" className="text-nav" />
          </button>
        </div>
        <div className="header__right">
          <button className="iconbtn notifbell" type="button" onClick={() => toggle("notif")} aria-label="What’s new" aria-expanded={panel === "notif"}>
            <Bell />
            {unread > 0 && <span className="notifbell__badge"><span className="notifbell__dot" /></span>}
          </button>
          <button className="iconbtn navsearch" type="button" onClick={() => open("cmd")} aria-label="Search"><Search /></button>
          <ThemeToggle />
          <button className="iconbtn navtrigger" type="button" onClick={() => toggle("drawer")} aria-label="Menu" aria-expanded={panel === "drawer"}>
            <span className="navtrigger__bars" />
          </button>
        </div>
      </div>
    </header>
  );
}
