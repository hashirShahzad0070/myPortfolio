"use client";

import { useEffect, useRef } from "react";
import { PAPER_MAIN, PAPER_SIM, PAPER_VERT } from "./paperShaders";

/* Full-viewport WebGL2 paper. Renders on demand (scroll / resize / theme), and
   runs a frame loop only while the pointer wake or a click ripple is alive. */

const MAX_DPR = 1.5;
const TRAIL_DOWNSCALE = 8;
const RETINT_MS = 400;
const RING_LIFE = 1900, RING_GAP = 150, RING_DIE = 220;

const P = {
  tooth: 0.055, felt: 0.035, crumple: 0.0038, streak1: 0.018, streak2: 0.014, stain: 0.022,
  crease: 0.58, edge: 1, warp: 0.16, emboss: 0.9, sheen: 0.03, drift: 0,
  darkMul: 0.68, darkLines: 0.8, darkTooth: 1.6, darkFelt: 0.45, darkCrumple: 0.6, darkHalf: 0.45,
  parallax: 0.06, halftone: 0.6, pitch: 6, fleck: 0.14, halfTrail: 0.35, wakeDots: 0.4, wakeScale: 1, pulse: 0.5,
};

type RGB = [number, number, number];
const parseColor = (v: string): RGB | null => {
  const t = v.trim();
  const hex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const h = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
  }
  const rgb = t.match(/^rgba?\(([\d.\s,]+)/)?.[1];
  if (rgb) return rgb.split(",").slice(0, 3).map((x) => parseFloat(x) / 255) as RGB;
  return null;
};
const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const same3 = (a: RGB, b: RGB) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const NO_PULSE = 'a, button, input, select, textarea, label, summary, [role="button"], [data-no-pulse]';

export function PaperGround() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[paper]", gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const program = (frag: string) => {
      const v = compile(gl.VERTEX_SHADER, PAPER_VERT), f = compile(gl.FRAGMENT_SHADER, frag);
      if (!v || !f) return null;
      const p = gl.createProgram()!;
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("[paper]", gl.getProgramInfoLog(p)); return null; }
      return p;
    };
    const main = program(PAPER_MAIN), sim = program(PAPER_SIM);
    if (!main || !sim) return;

    const uM: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ["uRes", "uScroll", "uPaper", "uInk", "uHi", "uStrength", "uTrail", "uTrailTexel", "uMouse", "uA", "uB", "uC", "uD", "uE", "uAlive", "uDim", "uR0", "uR1", "uR2", "uR3", "uR4", "uR5"])
      uM[n] = gl.getUniformLocation(main, n);
    const uS: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ["uPrev", "uTexel", "uSplat", "uDir", "uShift", "uForce", "uRadius", "uAspect"])
      uS[n] = gl.getUniformLocation(sim, n);

    document.documentElement.setAttribute("data-paper-gl", "");

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let paper: RGB = [0.84, 0.84, 0.835], ink: RGB = [0.12, 0.12, 0.12];
    let fade: object | null = null;
    let raf = 0, looping = false, quiet = 0, ping = 0, simScroll = scrollY;
    let trailW = 8, trailH = 8;
    const trailTex: (WebGLTexture | null)[] = [null, null];
    const trailFbo: (WebGLFramebuffer | null)[] = [null, null];
    let target = { x: 0.5, y: 0.5 }, mouse = { x: 0.5, y: 0.5 }, lastEvt = { x: 0.5, y: 0.5, t: 0 };
    let force = 0;
    const dir = { x: 0, y: 0 };
    let pulseAmp = 0, pulseT0 = 0, pulseNext = 0;
    type Ring = { x: number; y: number; t0: number; rMax: number; die?: number };
    let rings: Ring[] = [];
    let ringSpawned = 0;
    let disposed = false;

    const makeTrail = () => {
      trailW = Math.max(Math.ceil(innerWidth / TRAIL_DOWNSCALE), 8);
      trailH = Math.max(Math.ceil(innerHeight / TRAIL_DOWNSCALE), 8);
      for (let i = 0; i < 2; i++) {
        if (trailTex[i]) gl.deleteTexture(trailTex[i]);
        if (trailFbo[i]) gl.deleteFramebuffer(trailFbo[i]);
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, trailW, trailH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        trailTex[i] = t; trailFbo[i] = f;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const clearTrail = () => {
      gl.clearColor(0, 0, 0, 1);
      for (const f of trailFbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const stepTrail = () => {
      const from = ping, to = 1 - ping;
      gl.useProgram(sim);
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFbo[to]);
      gl.viewport(0, 0, trailW, trailH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTex[from]);
      gl.uniform1i(uS.uPrev, 0);
      gl.uniform2f(uS.uTexel, 1 / trailW, 1 / trailH);
      gl.uniform2f(uS.uSplat, mouse.x, mouse.y);
      const dl = Math.hypot(dir.x, dir.y) || 1;
      gl.uniform2f(uS.uDir, dir.x / dl, dir.y / dl);
      const shift = ((scrollY - simScroll) * P.parallax) / innerHeight;
      simScroll = scrollY;
      gl.uniform2f(uS.uShift, 0, shift);
      gl.uniform1f(uS.uForce, force * 0.1);
      gl.uniform1f(uS.uRadius, 0.085);
      gl.uniform1f(uS.uAspect, innerWidth / innerHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      ping = to;
    };

    const render = () => {
      if (disposed) return;
      const dpr = canvas.width / innerWidth || 1;
      const dark = document.documentElement.dataset.theme === "dark";
      gl.useProgram(main);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trailTex[ping]);
      gl.uniform1i(uM.uTrail, 0);
      gl.uniform2f(uM.uTrailTexel, 1 / trailW, 1 / trailH);
      gl.uniform2f(uM.uMouse, mouse.x, mouse.y);
      gl.uniform2f(uM.uRes, canvas.width, canvas.height);
      gl.uniform1f(uM.uScroll, reduce ? 0 : -scrollY * dpr * P.parallax);
      gl.uniform3fv(uM.uPaper, paper);
      gl.uniform3fv(uM.uInk, ink);
      gl.uniform3fv(uM.uHi, mix3(paper, ink, -0.5).map((v) => Math.min(Math.max(v, 0), 1)));
      gl.uniform1f(uM.uStrength, dark ? P.darkMul : 1);
      const lines = dark ? P.darkLines : 1;
      gl.uniform4f(uM.uA, dark ? P.tooth * P.darkTooth : P.tooth, dark ? P.felt * P.darkFelt : P.felt, dark ? P.crumple * P.darkCrumple : P.crumple, P.streak1 * lines);
      gl.uniform4f(uM.uB, P.streak2 * lines, P.stain, P.crease * lines, P.edge);
      gl.uniform4f(uM.uC, P.warp, P.emboss, P.sheen, P.drift);
      gl.uniform4f(uM.uD, dark ? P.halftone * P.darkHalf : P.halftone, P.pitch, P.fleck, P.halfTrail);
      gl.uniform4f(uM.uE, P.wakeDots, P.wakeScale, pulseAmp * P.pulse * 0.006, Math.floor(performance.now() / 125) / 8);
      gl.uniform1f(uM.uAlive, looping ? 1 : 0);
      gl.uniform1f(uM.uDim, 0);
      const now = performance.now();
      for (let i = 0; i < 6; i++) {
        const r = rings[i], loc = uM["uR" + i];
        if (!r) { gl.uniform4f(loc, 0, 0, 0, 0); continue; }
        const o = Math.min((now - r.t0) / RING_LIFE, 1);
        const radius = (1 - (1 - o) ** 2) * r.rMax;
        const life = o < 0.7 ? 1 : 1 - ((o - 0.7) / 0.3) ** 2;
        const die = r.die === undefined ? 1 : Math.max(1 - (now - r.die) / RING_DIE, 0);
        gl.uniform4f(loc, r.x, r.y, radius, 0.85 * life * die);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const request = () => {
      if (looping || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; render(); });
    };

    const loop = () => {
      if (looping || reduce || disposed) return;
      looping = true;
      simScroll = scrollY;
      let last = performance.now();
      const frame = () => {
        if (disposed) return;
        const now = performance.now();
        const n = Math.min(now - last, 50) / (1000 / 60);
        last = now;
        const k = 1 - 0.86 ** n;
        mouse.x += (target.x - mouse.x) * k;
        mouse.y += (target.y - mouse.y) * k;
        if (now >= pulseNext) { pulseT0 = now; pulseNext = now + 1100 + 900 + Math.random() * 1300; }
        const o = Math.min((now - pulseT0) / 1100, 1);
        pulseAmp = o < 0.3 ? o / 0.3 : o > 0.7 ? Math.max((1 - o) / 0.3, 0) : 1;
        stepTrail();
        render();
        force *= 0.82 ** n;
        if (rings.length) rings = rings.filter((r) => now - r.t0 < RING_LIFE && (r.die === undefined || now - r.die < RING_DIE));
        quiet = force > 0.004 || rings.length ? 0 : quiet + n;
        if (quiet < 55) requestAnimationFrame(frame);
        else { looping = false; pulseAmp = 0; clearTrail(); render(); }
      };
      requestAnimationFrame(frame);
    };

    const themeColors = () => {
      const cs = getComputedStyle(document.documentElement);
      return { paper: parseColor(cs.getPropertyValue("--paper")) ?? paper, ink: parseColor(cs.getPropertyValue("--ink")) ?? ink };
    };
    const retint = (animate: boolean) => {
      const t = themeColors();
      if (!animate) { paper = t.paper; ink = t.ink; request(); return; }
      if (!fade && same3(paper, t.paper) && same3(ink, t.ink)) { request(); return; }
      const f = { from: { paper, ink }, t0: performance.now() };
      fade = f;
      const step = () => {
        if (fade !== f) return;
        const e = Math.min((performance.now() - f.t0) / RETINT_MS, 1), k = 1 - (1 - e) ** 3;
        paper = mix3(f.from.paper, t.paper, k);
        ink = mix3(f.from.ink, t.ink, k);
        render();
        if (e < 1) requestAnimationFrame(step); else fade = null;
      };
      requestAnimationFrame(step);
    };

    const resize = () => {
      const cap = innerWidth > 1920 ? 1.25 : MAX_DPR;
      const dpr = Math.min(devicePixelRatio || 1, cap);
      const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w; canvas.height = h;
        makeTrail();
        simScroll = scrollY;
        request();
      }
    };

    /* events */
    const ac = new AbortController();
    const sig = { signal: ac.signal, passive: true } as const;
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = window.setTimeout(resize, 40); }, sig);
    addEventListener("scroll", request, sig);
    addEventListener("pointermove", (e) => {
      if (reduce) return;
      const t = performance.now();
      const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
      if ((e.target as Element | null)?.closest?.("[data-no-wake]")) {
        lastEvt = { x, y, t }; target = { x, y };
        if (!looping) mouse = { x, y };
        return;
      }
      const dt = Math.max(t - lastEvt.t, 1);
      const dx = (x - lastEvt.x) * innerWidth, dy = (y - lastEvt.y) * innerHeight;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        const inv = 1 / dist;
        dir.x += (dx * inv - dir.x) * 0.2;
        dir.y += (dy * inv - dir.y) * 0.2;
      }
      lastEvt = { x, y, t };
      target = { x, y };
      force = Math.min(force + (dist / dt) * 0.05, 0.35);
      loop();
    }, sig);
    addEventListener("pointerdown", (e) => {
      if (reduce || e.button !== 0 || (e.target as Element | null)?.closest?.(NO_PULSE)) return;
      const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
      const asp = innerWidth / innerHeight;
      const rMax = Math.hypot(Math.max(x, 1 - x) * asp, Math.max(y, 1 - y)) + 0.08;
      const now = performance.now();
      if (now - ringSpawned < RING_GAP) return;
      ringSpawned = now;
      rings.push({ x, y, t0: now, rMax });
      if (rings.length > 6) { const r = rings.find((r) => r.die === undefined); if (r) r.die = now; }
      if (rings.length > 8) rings.shift();
      loop();
    }, { signal: ac.signal, passive: true, capture: true });

    const mo = new MutationObserver(() => retint(true));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); document.documentElement.removeAttribute("data-paper-gl"); }, { signal: ac.signal });

    retint(false);
    resize();
    // a short "settle" pulse on load so the sheet breathes once
    if (!reduce) { pulseT0 = performance.now(); pulseNext = pulseT0 + 4000; force = 0.02; loop(); }

    return () => {
      disposed = true;
      ac.abort();
      mo.disconnect();
      cancelAnimationFrame(raf);
      document.documentElement.removeAttribute("data-paper-gl");
      for (let i = 0; i < 2; i++) { gl.deleteTexture(trailTex[i]); gl.deleteFramebuffer(trailFbo[i]); }
      gl.deleteProgram(main); gl.deleteProgram(sim);
    };
  }, []);

  return <canvas ref={ref} className="paper-gl" aria-hidden="true" />;
}
