"use client";

/* The page turn between routes: a sheet of the site's paper sweeps up over the page with a torn,
   living top edge (the old page sinks back and dims), the route changes underneath, then the sheet
   carries on up — its torn bottom edge tearing away — to reveal the new page. Ported from the
   reference site's veil. Internal link clicks are intercepted; code can call `pageTurn(href)`. */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";

const COVER = 1.3; // s, sheet rises over the old page
const REVEAL = 1.1; // s, sheet clears off the new page
const SWEEP = "expo.inOut";
// The loader between cover and reveal: a counter that hops through these values, odometer-style,
// climbing the screen as it counts; it rests on the next-to-last stop until the page is ready.
const CELLS = [0, 5, 9, 17, 27, 39, 52, 64, 78, 89, 100];
const RESTS = [0, 2, 4, 6, 8, 10];
const MIN_HOLD = 0.6; // s — the loader always shows at least this long
/** cubic-bezier(.4,0,.2,1) as a gsap ease — the hop: a slow lift, a quick roll, a soft landing */
const hop = (() => {
  const x1 = 0.4, y1 = 0, x2 = 0.2, y2 = 1;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x: number) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    return by(t);
  };
})();
// The writing shelf runs its own folder flight between the shelf and a post.
const ownTransition = (from: string, to: string) =>
  (from === "/writing" && to.startsWith("/writing/")) || (to === "/writing" && from.startsWith("/writing/"));

let turnTo: ((href: string) => boolean) | null = null;
/** Navigate with the page turn. Returns false when it can't run (the caller should navigate itself). */
export const pageTurn = (href: string) => turnTo?.(href) ?? false;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;    // drawing-buffer px
uniform float uTop;   // clip top inset, device px
uniform float uBot;   // clip bottom inset, device px
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uHi;
uniform float uStrength;
uniform float uTime;  // advances only while the sheet is moving
uniform vec4 uTune;   // sheetStep, shadow, lightTear, deckle
uniform float uPitch; // print-screen pitch, device px
uniform sampler2D uFiber;
out vec4 outColor;
#define PI 3.1415926538

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  float v = (vnoise(p) - 0.5) * 0.5;
  p = r * p * 2.03; v += (vnoise(p) - 0.5) * 0.25;
  p = r * p * 2.03; return v + (vnoise(p) - 0.5) * 0.125;
}
// How far a torn edge recedes behind its clip line (device px): a broad bump, rolling waves and a
// crawling rip, all held inside env so the sheet rests dead flat at both ends of its travel.
float limitRecession(float aU, float env, float travel, float seed, float vh, float t) {
  float bump = 0.2 * sin(travel * PI);
  float rip = fbm(vec2(aU * 3.5 + t * 0.12, seed + t * 0.3)) * 0.045 * 2.0;
  float wave = (vnoise(vec2(aU * 1.2 - t * 0.22, seed + 7.0 + t * 0.45)) - 0.5) * 0.09 * 2.0;
  return max((bump + rip + wave) * env, 0.0) * vh;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float y = uRes.y - px.y;
  float vh = uRes.y;
  float aU = px.x / vh;
  float pT = clamp(1.0 - uTop / vh, 0.0, 1.0);
  float pB = clamp(uBot / vh, 0.0, 1.0);
  float envT = sin(pT * PI);
  float envB = pow(sin(pB * PI), 0.6);
  float stripT = 0.07 * envT * vh;
  float stripB = 0.07 * 1.3 * envB * vh;
  float recSheetT = limitRecession(aU, envT, uTop / vh, 3.7, vh, uTime) + stripT;
  float recStripT = min(limitRecession(aU + 1.0, envT, uTop / vh, 11.3, vh, uTime), recSheetT - 1.0);
  float botLine = vh - uBot;
  float recSheetB = limitRecession(aU, envB, 1.0 - uBot / vh, 23.1, vh, uTime) * 1.1 + stripB;
  float recStripB = min(limitRecession(aU + 1.0, envB, 1.0 - uBot / vh, 31.9, vh, uTime) * 1.1, recSheetB - 1.0);
  float inSheet = min((y - uTop) - recSheetT, (botLine - y) - recSheetB);
  float inStrip = min((y - uTop) - recStripT, (botLine - y) - recStripB);

  if (inStrip < 0.0) {
    // beyond the tear: the sheet's soft shadow on the page
    outColor = vec4(0.0, 0.0, 0.0, exp(-(-inStrip) / (vh * 0.016)) * uTune.y);
    return;
  }
  if (inSheet < 0.0) {
    // the torn pulp strip between the two limits
    float lum = dot(texture(uFiber, vec2(aU * 1.4 + uTime * 0.02, y / vh * 1.4 - uTime * 0.013)).rgb, vec3(0.3333));
    float t = 0.45 + clamp((lum - 0.6) * 1.4, 0.0, 1.0) * 0.45;
    float isLight = step(dot(uInk, vec3(0.3333)), dot(uPaper, vec3(0.3333)));
    vec3 bright = mix(uInk, uHi, isLight);
    vec3 fib = mix(uPaper, bright, mix(t, t * uTune.z, isLight));
    fib *= mix(1.0, 0.88, smoothstep(-3.0, 0.0, inSheet));
    outColor = vec4(fib, 1.0);
    return;
  }
  // the solid sheet: house stock, its texture fixed in the viewport (only the torn edge travels)
  vec2 sp = vec2(aU, y / vh);
  float d = 0.0;
  d += (vnoise(sp * 900.0) - 0.5) * 0.032;
  d += (hash(px * 1.013) - 0.5) * 0.014;
  d += (vnoise(sp * 46.0) - 0.5) * 0.021;
  float H = fbm(sp * 4.6);
  vec2 g = vec2(dFdx(H), dFdy(H)) * vh;
  float tonal = dot(normalize(vec2(0.6, 0.8)), g) * 0.0018;
  float tone = clamp(0.5 + tonal * 9.0, 0.0, 1.0);
  vec2 hp = mat2(0.7071, 0.7071, -0.7071, 0.7071) * px / uPitch;
  float cellD = length(fract(hp) - 0.5);
  float dotR = mix(0.08, 0.66, tone);
  float ht = smoothstep(dotR + 0.16, dotR - 0.16, cellD);
  float ampH = (0.24 + 0.76 * smoothstep(0.0, 0.14, abs(tone - 0.5))) * 0.62;
  d += mix(tonal, (ht - 0.5) * 0.16, ampH);
  vec3 sheet = mix(uPaper, uInk, uTune.x);
  vec3 col = mix(sheet, uInk, clamp(max(d, 0.0) * uStrength, 0.0, 0.3));
  col = mix(col, uHi, clamp(max(-d, 0.0) * uStrength, 0.0, 0.25));
  col = mix(col, uInk, (1.0 - smoothstep(0.0, 2.5, inSheet)) * uTune.w);
  col += (hash(px * 1.7) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

/** Torn pulp: blotches, fibres and flecks on warm white. Only its luminance is used. */
function fiberCanvas(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const v = (225 + (Math.random() * 26 - 13)) | 0;
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 12},0.10)`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 8 + Math.random() * 42, 4 + Math.random() * 14, (Math.random() - 0.5) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * size, y = Math.random() * size, len = 4 + Math.random() * 34, v = (196 + Math.random() * 56) | 0;
    ctx.strokeStyle = `rgba(${v},${v - 5},${v - 14},${0.1 + Math.random() * 0.22})`;
    ctx.lineWidth = Math.random() < 0.85 ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }
  for (let i = 0; i < 380; i++) {
    const v = (120 + Math.random() * 60) | 0;
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 18},${0.12 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
  }
  return c;
}

/** Any CSS colour → linear-ish 0..1 rgb triple via a 1px canvas. */
function rgbOf(css: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

type Sheet = { render: (topPx: number, botPx: number) => void; resize: () => void; dispose: () => void };

function createSheet(canvas: HTMLCanvasElement): Sheet | null {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, alpha: true });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { res: u("uRes"), top: u("uTop"), bot: u("uBot"), paper: u("uPaper"), ink: u("uInk"), hi: u("uHi"), strength: u("uStrength"), time: u("uTime"), tune: u("uTune"), pitch: u("uPitch"), fiber: u("uFiber") };
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fiberCanvas());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const t0 = performance.now();
  const dpr = () => Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => {
    const w = Math.round(innerWidth * dpr()), h = Math.round(innerHeight * dpr());
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  resize();
  return {
    resize,
    render(topPx, botPx) {
      const cs = getComputedStyle(document.documentElement);
      const paper = rgbOf(cs.getPropertyValue("--paper").trim() || "#e8e8e7");
      const ink = rgbOf(cs.getPropertyValue("--ink").trim() || "#1e1e1e");
      const hi = paper.map((p, i) => Math.min(Math.max(p + (p - ink[i]) * 0.5, 0), 1));
      const dark = document.documentElement.dataset.theme === "dark";
      const k = dpr();
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.top, topPx * k);
      gl.uniform1f(U.bot, botPx * k);
      gl.uniform3fv(U.paper, paper);
      gl.uniform3fv(U.ink, ink);
      gl.uniform3fv(U.hi, hi);
      gl.uniform1f(U.strength, dark ? 0.68 : 1);
      const t = (performance.now() - t0) / 1000;
      gl.uniform1f(U.time, Math.floor(t * 8) / 8);
      gl.uniform4f(U.tune, dark ? 0 : 0.145, 0.065, 0.05, 0.045);
      const d = devicePixelRatio || 1;
      gl.uniform1f(U.pitch, (6 / Math.min(d, 1.5)) * Math.min(d, 1));
      gl.uniform1i(U.fiber, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() { gl.deleteTexture(tex); gl.deleteProgram(prog); },
  };
}

export function PageTurn() {
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const travelRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const ctl = useRef<{ onRoute: (path: string) => void } | null>(null);

  useEffect(() => {
    const panel = panelRef.current!, canvas = canvasRef.current!;
    const travel = travelRef.current!, strip = stripRef.current!;
    const sheet = createSheet(canvas);
    if (sheet) panel.classList.add("pageturn--gl");
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    // clip insets in % of the viewport: top (covers lead with it), bottom (reveals trail it)
    const clip = { top: 100, bot: 0 };
    const paint = () => {
      panel.style.clipPath = `inset(${clip.top}% 0% ${clip.bot}% 0%)`;
      sheet?.render((clip.top / 100) * innerHeight, (clip.bot / 100) * innerHeight);
    };
    let state: "idle" | "covering" | "covered" | "revealing" = "idle";
    let target: string | null = null;
    let routeChanged = false;
    let tl: gsap.core.Timeline | null = null;
    let watchdog = 0;
    let scrim: HTMLDivElement | null = null;
    let sunk: HTMLElement | null = null;

    /* ---------- the loader ---------- */
    let holdTl: gsap.core.Timeline | null = null;
    let holdAt = 0;
    let rolled = 0;
    const climb = () => Math.max(0, innerHeight - (travel.offsetHeight || innerHeight * 0.12) - 48);
    /** Show cell i (fractional while rolling): the strip rolls and the counter climbs with the value. */
    const setCell = (i: number) => {
      const k = Math.min(CELLS.length - 1, Math.max(rolled, i));
      rolled = k;
      strip.style.transform = `translateY(${-k}em)`;
      const a = Math.floor(k), b = Math.min(CELLS.length - 1, a + 1);
      const v = CELLS[a] + (CELLS[b] - CELLS[a]) * (k - a);
      gsap.set(travel, { y: -climb() * (v / 100) });
    };
    const startHold = () => {
      holdTl?.kill();
      rolled = 0;
      strip.style.transform = "translateY(0em)";
      holdAt = performance.now();
      travel.style.visibility = "visible";
      gsap.set(travel, { y: travel.offsetHeight + 48 });
      const h = gsap.timeline();
      holdTl = h;
      h.to(travel, { y: 0, duration: 0.5, ease: "expo.out" }, 0);
      const hops = gsap.timeline();
      const r = { i: 0 }, last = RESTS.length - 2; // rest on the next-to-last stop
      for (let t = 1; t <= last; t++) {
        const from = RESTS[t - 1], to = RESTS[t];
        const pace = 0.85 + 0.55 * (last > 1 ? (t - 1) / (last - 1) : 1); // later hops come slower
        hops.to(r, { i: to, duration: (0.16 + (to - from) * 0.11) * pace, ease: hop, onUpdate: () => setCell(r.i) })
          .to(r, { i: to, duration: t === last ? 0.22 : 0.1 * pace });
      }
      h.add(hops, 0.26);
    };
    /** Roll the rest of the way to 100, then let go. */
    const closeHold = () => new Promise<void>((resolve) => {
      holdTl?.kill();
      const r = { i: rolled }, end = CELLS.length - 1;
      const h = gsap.timeline({ onComplete: () => window.setTimeout(resolve, 120) });
      holdTl = h;
      if (r.i < end) h.to(r, { i: end, duration: 0.45, ease: "power2.out", onUpdate: () => setCell(r.i) });
      else h.call(() => {}, [], 0.01);
    });

    const reveal = () => {
      if (state !== "covered") return;
      state = "revealing";
      clearTimeout(watchdog);
      tl?.kill();
      if (sunk) gsap.set(sunk, { clearProps: "transform,transformOrigin" });
      sunk = null;
      html.removeAttribute("data-veil");
      document.dispatchEvent(new CustomEvent("veil:reveal", { detail: { mode: "nav", wipeDur: REVEAL } }));
      const done = () => {
        state = "idle";
        travel.style.visibility = "hidden";
        panel.style.visibility = "hidden";
        panel.style.pointerEvents = "none";
        scrim?.remove();
        scrim = null;
      };
      tl = gsap.timeline({ onComplete: done });
      if (scrim) tl.to(scrim, { opacity: 0, duration: 0.25, ease: "power2.out" }, 0);
      if (reduced()) { tl.to(panel, { opacity: 0, duration: 0.2, ease: "power1.out" }, 0); return; }
      clip.top = 0; clip.bot = 0;
      tl.to(clip, { bot: 100, duration: REVEAL, ease: SWEEP, onUpdate: paint }, 0);
      // the counter leaves up and away with the sheet
      tl.to(travel, { y: -(innerHeight + travel.offsetHeight + 48), duration: 0.8, ease: SWEEP }, 0);
    };
    // reveal once the new route has rendered and painted
    let settling = false;
    const settle = () => {
      if (state !== "covered" || !routeChanged || settling) return;
      settling = true;
      const wait = Math.max(0, MIN_HOLD * 1000 - (performance.now() - holdAt));
      window.setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(async () => {
          if (!reduced()) await closeHold();
          settling = false;
          reveal();
        }));
      }, wait);
    };

    const start = (href: string) => {
      if (state !== "idle") return true;
      const url = new URL(href, location.href);
      target = url.pathname + url.search + url.hash;
      routeChanged = false;
      state = "covering";
      html.setAttribute("data-veil", ""); // the new page's intros wait for veil:reveal
      router.prefetch(target);
      panel.style.visibility = "visible";
      panel.style.pointerEvents = "auto";
      panel.style.opacity = "1";
      sheet?.resize();
      clearTimeout(watchdog);
      watchdog = window.setTimeout(() => { if (state === "covered" || state === "covering") { state = "covered"; reveal(); } }, 8000);
      tl?.kill();
      const go = () => {
        state = "covered";
        if (!reduced()) startHold();
        router.push(target!);
        settle();
      };
      tl = gsap.timeline({ onComplete: go });
      // the old page sinks back and darkens under the coming sheet
      const main = document.querySelector<HTMLElement>("main");
      scrim = document.createElement("div");
      scrim.setAttribute("aria-hidden", "true");
      scrim.style.cssText = "position:fixed;inset:0;z-index:1150;background:#000;opacity:0;pointer-events:none;";
      document.body.append(scrim);
      if (reduced()) {
        clip.top = 0; clip.bot = 0; paint();
        tl.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out" });
        return true;
      }
      if (main) {
        sunk = main;
        gsap.set(main, { transformOrigin: `50% ${scrollY + innerHeight / 2}px` });
        tl.to(main, { scale: 0.96, y: 10, duration: COVER, ease: "power2.inOut" }, 0);
      }
      tl.to(scrim, { opacity: 0.55, duration: COVER * 0.7, ease: "power2.inOut" }, 0);
      clip.top = 100; clip.bot = 0;
      paint();
      tl.to(clip, { top: 0, duration: COVER, ease: SWEEP, onUpdate: paint }, 0);
      return true;
    };

    turnTo = (href) => {
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return false;
        if (url.pathname === location.pathname) return false;
        if (ownTransition(location.pathname, url.pathname)) return false;
        return start(href);
      } catch { return false; }
    };

    // intercept internal link clicks before Next's <Link> sees them
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target && a.target !== "_self" || a.hasAttribute("download") || a.closest("[data-no-pageturn]")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return; // same page / hash link
      if (ownTransition(location.pathname, url.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      start(a.href);
    };
    document.addEventListener("click", onClick, true);

    ctl.current = {
      onRoute: () => { if (state === "covered" || state === "covering") { routeChanged = true; settle(); } },
    };
    const onResize = () => { sheet?.resize(); if (state !== "idle") paint(); };
    addEventListener("resize", onResize);

    return () => {
      turnTo = null;
      document.removeEventListener("click", onClick, true);
      removeEventListener("resize", onResize);
      clearTimeout(watchdog);
      tl?.kill();
      holdTl?.kill();
      scrim?.remove();
      if (sunk) gsap.set(sunk, { clearProps: "transform,transformOrigin" });
      sheet?.dispose();
    };
  }, [router]);

  // the route has changed under the sheet
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    ctl.current?.onRoute(pathname);
  }, [pathname]);

  return (
    <div ref={panelRef} className="pageturn" aria-hidden="true">
      <canvas ref={canvasRef} className="pageturn__paper" />
      <div className="pageturn__travel" ref={travelRef}>
        <span className="pageturn__count">
          <span className="pageturn__digit">
            <span className="pageturn__strip" ref={stripRef}>
              {CELLS.map((c) => <span key={c} className="pageturn__cell">{c}</span>)}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}
