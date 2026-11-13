"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

/** Table of contents: a reading-progress ring, the active section highlighted, collapsible. */
export function Toc({ items }: { items: { id: string; text: string }[] }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  const ringRef = useRef<SVGCircleElement>(null);
  const bgRef = useRef<HTMLSpanElement>(null);
  const lastTop = useRef<number | null>(null);

  useEffect(() => {
    const heads = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const article = document.querySelector<HTMLElement>("[data-post-article]");
    const C = 2 * Math.PI * 5.5;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = 140;
      let a = 0;
      heads.forEach((h, i) => { if (h.getBoundingClientRect().top <= line) a = i; });
      setActive(a);
      if (article && ringRef.current) {
        const r = article.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (innerHeight * 0.5 - r.top) / Math.max(1, r.height)));
        ringRef.current.style.strokeDashoffset = String(C * (1 - p));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [items]);

  // the highlight glides from the previous item to the new one
  useLayoutEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    const top = bg.getBoundingClientRect().top;
    if (lastTop.current !== null && lastTop.current !== top && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(bg, { y: lastTop.current - top }, { y: 0, duration: 0.45, ease: "expo.out" });
    }
    lastTop.current = top;
  }, [active]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav className={`toc${open ? " is-open" : ""}`} aria-label="Table of contents">
      <div className="toc__head">
        <span className="toc__id">
          <svg className="toc__ring" viewBox="0 0 14 14" aria-hidden="true">
            <circle className="toc__ring-track" cx="7" cy="7" r="5.5" />
            <circle ref={ringRef} className="toc__ring-fill" cx="7" cy="7" r="5.5" strokeDasharray={2 * Math.PI * 5.5} strokeDashoffset={2 * Math.PI * 5.5} />
          </svg>
          <span className="toc__label text-label">Table of content</span>
        </span>
        <button
          className="toc__chev"
          type="button"
          aria-expanded={open}
          aria-controls="toc-list"
          aria-label={open ? "Collapse table of contents" : "Expand table of contents"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="toc__chev-icon" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M3 1.5 5.5 4 3 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="toc__body" id="toc-list">
        <div className="toc__clip">
          <ol className="toc__list">
            {items.map((it, i) => (
              <li key={it.id}>
                <a className="toc__item text-meta" href={`#${it.id}`} data-toc-active={i === active ? "" : undefined} onClick={(e) => go(e, it.id)}>
                  {i === active && <span className="toc__item-bg" ref={bgRef} aria-hidden="true" />}
                  <span className="toc__dot" aria-hidden="true" />
                  <span className="toc__text">{it.text}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </nav>
  );
}
