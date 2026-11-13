"use client";

import { useEffect, useId, useRef } from "react";
import { site } from "@/content/site";
import { Socials } from "../ui";

const SW = 208, SH = 260; // stamp size in px
const PITCH = 10.625, HOLE = 9.043, GAP = PITCH - HOLE;

/** The stamp outline: straight edges bitten by half-circle perforations, walked clockwise. */
function perforation(w: number, h: number) {
  const r = HOLE / 2;
  const side = (len: number) => {
    const n = Math.floor((len + GAP - 6) / PITCH);
    const m = (len - (n * PITCH - GAP)) / 2;
    return Array.from({ length: n }, (_, i) => [m + i * PITCH, m + i * PITCH + HOLE]);
  };
  const f = (v: number) => v.toFixed(2);
  const arc = (x: number, y: number) => `A${r} ${r} 0 0 0 ${f(x)} ${f(y)}`;
  let d = "M0 0";
  for (const [a, b] of side(w)) d += ` L${f(a)} 0 ${arc(b, 0)}`;
  d += ` L${w} 0`;
  for (const [a, b] of side(h)) d += ` L${w} ${f(a)} ${arc(w, b)}`;
  d += ` L${w} ${h}`;
  for (const [a, b] of side(w)) d += ` L${f(w - a)} ${h} ${arc(w - b, h)}`;
  d += ` L0 ${h}`;
  for (const [a, b] of side(h)) d += ` L0 ${f(h - a)} ${arc(0, h - b)}`;
  return `${d} Z`;
}
const CUT = perforation(SW, SH);

/** The front-office envelope: a postage-stamp portrait, its postmark, rubber marks and your links. */
export function Envelope() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cardRef = useRef<HTMLElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);

  // the stamp leans toward the pointer and catches a dotted glint
  useEffect(() => {
    const card = cardRef.current, tilt = tiltRef.current, shine = shineRef.current;
    if (!card || !tilt || !shine || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const cx = Math.max(-1, Math.min(1, x * 2 - 1)), cy = Math.max(-1, Math.min(1, y * 2 - 1));
      tilt.style.transform = `rotateY(${cx * 9}deg) rotateX(${-cy * 9}deg)`;
      shine.style.setProperty("--shx", `${x * 100}%`);
      shine.style.setProperty("--shy", `${y * 100}%`);
      shine.style.opacity = "1";
    };
    const leave = () => { tilt.style.transform = ""; shine.style.opacity = "0"; };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    return () => { card.removeEventListener("pointermove", move); card.removeEventListener("pointerleave", leave); };
  }, []);

  const route = site.about.route;
  const top = route.from.toUpperCase(); // postmark: "IMAGINATION" over "WORLDWIDE · WEB"
  const bottom = `${route.to.toUpperCase()} · ${route.toCode}`;

  return (
    <>
      <svg className="ov3__clip" viewBox="0 0 40 96" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={`clip-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8d9096" />
            <stop offset=".45" stopColor="#e6e8ec" />
            <stop offset="1" stopColor="#74777d" />
          </linearGradient>
        </defs>
        <path d="M13 30v44a8 8 0 0 0 16 0V16a11 11 0 0 0-22 0v58a14 14 0 0 0 28 0V34" stroke={`url(#clip-${uid})`} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <article className="ov3__env u-card" ref={cardRef}>
        <span className="ov3__field" aria-hidden="true">
          <span className="mark" style={{ right: "16%", top: "18%", width: 84, height: 84, rotate: "8deg" }}>
            <svg viewBox="0 0 84 84" fill="none">
              <g filter={`url(#pm-ink-${uid})`} stroke="currentColor">
                <rect x="4" y="4" width="76" height="76" rx="9" strokeWidth="2" />
                <path d="M18 56a24 24 0 0 1 48 0M25 56a17 17 0 0 1 34 0M32 56a10 10 0 0 1 20 0" strokeWidth="2" />
                <path d="M14 60h56" strokeWidth="1.4" />
                <text x="42" y="73" textAnchor="middle" fill="currentColor" stroke="none" className="mark__t" fontSize="9" letterSpacing="2">{route.fromCode}</text>
              </g>
            </svg>
          </span>
        </span>

        <span className="ov3__imprints">
          <a className="ov3__imprint" href="#record" aria-label="The record: where I’ve worked">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="4.5" width="12" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 4.5V3.3c0-.5.4-.8.8-.8h2.4c.4 0 .8.3.8.8v1.2M2 8.5h12" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </a>
          <a className="ov3__imprint" href="#onfile" aria-label="On file: education and stack">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5 2.5h6v3.2a3 3 0 0 1-6 0V2.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5 3.8H3.2c0 1.8.8 2.8 2 3M11 3.8h1.8c0 1.8-.8 2.8-2 3M8 8.7v2.6M5.5 13.5h5M6.5 11.3h3v2.2h-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </a>
        </span>

        <div className="frank" style={{ ["--sw" as string]: `${SW}px`, ["--sh" as string]: `${SH}px`, ["--cut" as string]: `url(#stamp-cut-${uid})` }}>
          <svg className="frank__defs" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={`stamp-cut-${uid}`}><path d={CUT} /></clipPath>
              <filter id={`stamp-print-${uid}`} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0" />
                <feComponentTransfer>
                  <feFuncR type="discrete" tableValues=".00 .11 .22 .33 .44 .56 .67 .78 .89 1" />
                  <feFuncG type="discrete" tableValues=".00 .11 .22 .33 .44 .56 .67 .78 .89 1" />
                  <feFuncB type="discrete" tableValues=".00 .11 .22 .33 .44 .56 .67 .78 .89 1" />
                </feComponentTransfer>
              </filter>
              <filter id={`pm-ink-${uid}`} x="-8%" y="-8%" width="116%" height="116%">
                <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="41" result="r" />
                <feDisplacementMap in="SourceGraphic" in2="r" scale="1.2" result="d" />
                <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="48" result="m" />
                <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3 -0.9" result="mm" />
                <feComposite in="d" in2="mm" operator="in" />
              </filter>
              <path id={`pm-top-${uid}`} d="M11 48a37 37 0 0 1 74 0" />
              <path id={`pm-bot-${uid}`} d="M15 48a33 33 0 0 0 66 0" />
            </defs>
          </svg>
          <div className="frank__tilt" ref={tiltRef}>
            <div className="frank__stamp" style={{ ["--print" as string]: `url(#stamp-print-${uid})` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span className="frank__window">
                <img className="frank__photo u-cover" src="/about22.jpeg" alt={site.name} draggable={false} />
              </span>
              <span className="frank__cap">
                {site.name}
                <svg className="frank__waves" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                  <path d="M1 2c3-1.6 5-1.6 8 0s5 1.6 8 0 5-1.6 8 0" />
                  <path d="M1 5c3-1.6 5-1.6 8 0s5 1.6 8 0 5-1.6 8 0" />
                  <path d="M1 8c3-1.6 5-1.6 8 0s5 1.6 8 0 5-1.6 8 0" />
                </svg>
              </span>
            </div>
            <span className="frank__shine" ref={shineRef} aria-hidden="true" />
          </div>
          <svg className="frank__postmark" viewBox="0 0 190 96" fill="none" aria-hidden="true" focusable="false">
            <g filter={`url(#pm-ink-${uid})`}>
              <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="48" cy="48" r="33" stroke="currentColor" strokeWidth="1" />
              <text className="frank__postmark-type" fill="currentColor"><textPath href={`#pm-top-${uid}`} startOffset="50%" textAnchor="middle">{top}</textPath></text>
              <text className="frank__postmark-type" fill="currentColor"><textPath href={`#pm-bot-${uid}`} startOffset="50%" textAnchor="middle">{bottom}</textPath></text>
              <path d="M31 44h34M31 52h34" stroke="currentColor" strokeWidth="1.6" />
              {[30, 42, 54, 66].map((y) => (
                <path key={y} d={`M94 ${y}q11-5 22 0t22 0 22 0 22 0`} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ))}
            </g>
          </svg>
        </div>

        <div className="ov3__conn">
          <div className="ov3__conn-row"><Socials /></div>
          <div className="ov3__conn-row">
            <a href="#letter" className="btn btn--solid text-tag">About me</a>
            <span className="ov3__conn-from text-label">{site.from}</span>
          </div>
        </div>
      </article>
    </>
  );
}
