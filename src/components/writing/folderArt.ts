/* The folders' print shop: every texture a folder wears (cover, spine, sheets, preview card),
   the fibre relief, the contact shadow, and the geometry that lets the paper bend. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ShelfPost } from "@/content/posts";

export type Tokens = { paper: string; ink: string; theme: "light" | "dark" };

/* ---- dimensions (world units: a folder is 1 tall) ---- */
export const FH = 1; // folder height
export const FW = 0.78; // folder width (back board)
export const DEPTH = 0.012;
export const TAB_Z = 0.055;
export const R_L = 0.075;
export const R_R = 0.075;
export const BEVEL = 0.003;
export const TAB_IN = 0.062;
export const CW = 0.718; // cover width
export const NOTCH_H = 0.24;
export const NOTCH_W = 0.07;
export const NOTCH_Y = 0.02;
export const PREVIEW_X = -0.06;
export const PREVIEW_RUN = 0.62;

export const TONES = {
  slate: { light: "#2f4a63", dark: "#93a9bd" },
  cobalt: { light: "#23407a", dark: "#8fa6d6" },
  indigo: { light: "#3a2f6b", dark: "#b4aad5" },
  oxblood: { light: "#5a2035", dark: "#cf97b2" },
  teal: { light: "#1f474c", dark: "#7fb5ab" },
  racing: { light: "#22392f", dark: "#9bbfa8" },
} as const;

const FAM: Record<"dark" | "light" | "grey", Tokens> = {
  dark: { paper: "#1c1c1c", ink: "#f2f1ee", theme: "dark" },
  light: { paper: "#e8e8e7", ink: "#1e1e1e", theme: "light" },
  grey: { paper: "#b0b0ad", ink: "#1e1e1e", theme: "light" },
};

/** Stable 0..1 hash of an integer. */
export const hash = (e: number) => (((e + 1) * 2654435761) % 4294967296) / 4294967296;
export const smooth = (e: number) => e * e * (3 - 2 * e);

export function rng(seed: number) {
  let t = (seed * 9301 + 49297) >>> 0;
  return () => ((t = (Math.imul(t, 1664525) + 1013904223) >>> 0), t / 4294967296);
}

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  return {
    paper: cs.getPropertyValue("--paper").trim() || "#d6d6d5",
    ink: cs.getPropertyValue("--ink").trim() || "#1e1e1e",
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  };
}

const tone = (p: ShelfPost) => (p.tone && TONES[p.tone]) || null;

/** Which paper family a folder is cut from (null when it has a coloured tone). */
function family(i: number, p: ShelfPost) {
  if (tone(p)) return null;
  if (p.stock && p.stock in FAM) return p.stock;
  const n = hash(i * 61);
  return n < 0.45 ? "dark" : n < 0.8 ? "light" : "grey";
}
const familyTokens = (tk: Tokens, i: number, p: ShelfPost) => {
  const f = family(i, p);
  return f ? FAM[f] : tk;
};

/** The folder board colour. */
export function stockColor(tk: Tokens, i: number, p: ShelfPost) {
  const t = tone(p);
  if (t) return new THREE.Color(t.light);
  const f = familyTokens(tk, i, p);
  return new THREE.Color(f.paper).lerp(new THREE.Color(f.ink), f.theme === "dark" ? 0.03 + 0.06 * hash(i) : 0.05 + 0.06 * hash(i));
}
/** The board's cut edge: the stock lightened (or greyed) toward its core. */
export function coreColor(stock: THREE.Color, tk: Tokens, i: number, p: ShelfPost) {
  const dark = !!tone(p) || familyTokens(tk, i, p).theme === "dark";
  return stock.clone().lerp(new THREE.Color(dark ? "#8c8b87" : "#f4f1ea"), 0.42);
}
const inkFor = (tk: Tokens, p: ShelfPost, i: number) => (tone(p) ? "#ffffff" : familyTokens(tk, i, p).ink);
export const sheetColor = (tk: Tokens, i: number, n: number) =>
  new THREE.Color(tk.paper).lerp(new THREE.Color("#ffffff"), tk.theme === "dark" ? 0.09 + 0.05 * hash(i * 7 + n) : 0.5 + 0.12 * hash(i * 7 + n));

const spacing = (ctx: CanvasRenderingContext2D, px: number) => {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* older canvas */ }
};

/* Fonts resolve from the page's next/font variables, so the canvas uses the same Geist faces. */
let SANS = "system-ui, sans-serif";
let MONO = "ui-monospace, monospace";
export function resolveFonts() {
  const cs = getComputedStyle(document.documentElement);
  const g = cs.getPropertyValue("--font-geist").trim();
  const m = cs.getPropertyValue("--font-geist-mono").trim();
  SANS = `${g ? `${g}, ` : ""}system-ui, sans-serif`;
  MONO = `${m ? `${m}, ` : ""}ui-monospace, monospace`;
  return { sans: SANS, mono: MONO };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (cur && lines.length === maxLines) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  return lines;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number) {
  let a = (seed * 9301 + 49297) >>> 0;
  const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0), a / 4294967296);
  ctx.fillStyle = color;
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = 0.015 + r() * 0.03;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1);
  }
  ctx.globalAlpha = 1;
}

type CoverCtx = {
  ctx: CanvasRenderingContext2D;
  post: ShelfPost;
  ink: string;
  stock: string;
  theme: Tokens["theme"];
  CW: number;
  CH: number;
  M: number;
  titleY: number;
  seed: number;
};

function title(e: CoverCtx, y: number, max = 3) {
  e.ctx.font = `500 64px ${SANS}`;
  spacing(e.ctx, -1.792);
  e.ctx.fillStyle = e.ink;
  const lines = wrap(e.ctx, e.post.title, e.CW - 2 * e.M, max);
  lines.forEach((l, i) => e.ctx.fillText(l, e.M, y + i * 64 * 1.06));
  return y + (lines.length - 1) * 64 * 1.06 + 22;
}

const firstGlyph = (p: ShelfPost) => (p.title.match(/[A-Za-z0-9]/)?.[0] ?? "H").toUpperCase();

/** Cover species: each draws a different print onto the front board. */
const COVERS: Record<string, (e: CoverCtx) => void> = {
  glyph(e) {
    e.ctx.save();
    e.ctx.font = `500 ${Math.round(e.CH * 1.5)}px ${SANS}`;
    spacing(e.ctx, 0);
    e.ctx.fillStyle = e.ink;
    e.ctx.globalAlpha = 0.09;
    e.ctx.fillText(firstGlyph(e.post), e.CW * 0.22, e.CH * 1.18);
    e.ctx.restore();
    title(e, e.titleY);
  },
  scatter(e) {
    const r = rng(e.seed);
    const parts: string[] = [];
    for (const w of e.post.title.toUpperCase().split(/\s+/)) {
      let n = 0;
      while (n < w.length) {
        const k = w.length - n <= 3 ? w.length - n : 1 + Math.floor(r() * 3);
        parts.push(w.slice(n, n + k));
        n += k;
      }
      parts.push(" ");
    }
    const room = e.CH - e.titleY - 300;
    const rows = Math.max(4, Math.ceil(parts.length / 2.4));
    const lh = Math.min(170, room / rows);
    const size = Math.round(lh * 0.86);
    e.ctx.font = `500 ${size}px ${SANS}`;
    spacing(e.ctx, size * -0.042);
    e.ctx.fillStyle = e.ink;
    let x = e.M, y = e.titleY;
    for (const s of parts) {
      if (s === " ") {
        if (r() < 0.55) { y += lh; x = e.M + (r() < 0.4 ? e.CW * (0.08 + r() * 0.3) : 0); }
        else x += size * (0.4 + r() * 0.6);
        continue;
      }
      const w = e.ctx.measureText(s).width;
      if (x + w > e.CW - e.M) { y += lh; x = e.M + (r() < 0.5 ? e.CW * (0.05 + r() * 0.25) : 0); }
      if (y > e.CH - 280) break;
      e.ctx.fillText(s, x, y);
      x += w + size * (0.25 + r() * 0.7);
    }
  },
  field(e) {
    const r = rng(e.seed);
    const y = e.CH * 0.64;
    e.ctx.fillStyle = e.ink;
    e.ctx.globalAlpha = 0.14;
    e.ctx.fillRect(e.M, y, e.CW - 2 * e.M, 2);
    e.ctx.globalAlpha = 1;
    const x = e.CW * (0.52 + r() * 0.22), s = 34 + r() * 14;
    if (r() < 0.5) { e.ctx.beginPath(); e.ctx.arc(x, y - s, s, 0, Math.PI * 2); e.ctx.fill(); }
    else e.ctx.fillRect(x - s, y - s * 2, s * 2, s * 2);
    title(e, e.titleY);
  },
  band(e) {
    const t = tone(e.post);
    e.ctx.fillStyle = t ? (e.theme === "dark" ? t.dark : t.light) : e.ink;
    e.ctx.fillRect(0, e.CH * 0.56, e.CW, e.CH * 0.14);
    title(e, e.titleY);
  },
  tiles(e) {
    const r = rng(e.seed);
    const end = title(e, e.titleY);
    const top = Math.max(e.CH * 0.44, end + 50);
    const s = Math.min((e.CW - 2 * e.M) / 4, (e.CH - 250 - top) / 3);
    e.ctx.fillStyle = e.ink;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++) {
        if (r() < 0.22) continue;
        const x = e.M + col * s, y = top + row * s, k = r();
        e.ctx.beginPath();
        if (k < 0.45) {
          const q = Math.floor(r() * 4);
          e.ctx.save();
          e.ctx.beginPath(); e.ctx.rect(x, y, s, s); e.ctx.clip();
          e.ctx.beginPath(); e.ctx.arc(q & 1 ? x + s : x, q & 2 ? y + s : y, s * 0.92, 0, Math.PI * 2); e.ctx.fill();
          e.ctx.restore();
        } else if (k < 0.75) { e.ctx.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2); e.ctx.fill(); }
        else e.ctx.fillRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84);
      }
  },
  checker(e) {
    const r = rng(e.seed);
    const end = title(e, e.titleY);
    const top = Math.max(e.CH * 0.44, end + 50);
    const s = Math.min((e.CW - 2 * e.M) / 5, (e.CH - 250 - top) / 3);
    e.ctx.fillStyle = e.ink;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 5; col++) {
        if ((col + row) % 2 || r() < 0.18) continue;
        const off = r() < 0.3 ? (r() < 0.5 ? -0.5 : 0.5) * s : 0;
        e.ctx.fillRect(e.M + col * s + off, top + row * s, s, s);
      }
  },
  lines(e) {
    const end = title(e, e.titleY - 60);
    const top = Math.max(e.CH * 0.42, end + 50), bottom = e.CH - 250;
    e.ctx.fillStyle = e.ink;
    e.ctx.globalAlpha = 0.85;
    for (let y = top; y < bottom; y += 26) e.ctx.fillRect(e.M, y, e.CW - 2 * e.M, 9);
    e.ctx.globalAlpha = 1;
    e.ctx.save();
    e.ctx.font = `700 ${Math.round(e.CH * 0.52)}px ${SANS}`;
    spacing(e.ctx, 0);
    e.ctx.fillStyle = e.stock;
    const g = firstGlyph(e.post), w = e.ctx.measureText(g).width;
    e.ctx.fillText(g, (e.CW - w) / 2, bottom - 40);
    e.ctx.restore();
  },
  index(e) {
    const n = String(e.post.num).padStart(2, "0");
    e.ctx.font = `500 ${Math.round(e.CH * 0.42)}px ${SANS}`;
    spacing(e.ctx, e.CH * 0.42 * -0.042);
    e.ctx.fillStyle = e.ink;
    const w = e.ctx.measureText(n).width;
    e.ctx.fillText(n, e.CW - e.M - w, e.CH * 0.62);
    e.ctx.globalAlpha = 0.12;
    e.ctx.fillRect(e.M, e.CH * 0.655, e.CW - 2 * e.M, 2);
    e.ctx.globalAlpha = 1;
    title(e, e.CH * 0.73, 2);
  },
  plan(e) {
    const r = rng(e.seed);
    const end = title(e, e.titleY - 60);
    e.ctx.fillStyle = e.ink;
    const top = Math.max(e.CH * 0.42, end + 50), bottom = e.CH - 240, w = e.CW - 2 * e.M;
    e.ctx.globalAlpha = 0.16;
    for (let c = 0; c <= 6; c++) e.ctx.fillRect(e.M + (w / 6) * c - 1, top, 2, bottom - top);
    for (let y = top; y <= bottom; y += (bottom - top) / 8) e.ctx.fillRect(e.M, y - 1, w, 2);
    e.ctx.globalAlpha = 1;
    const c = Math.floor(r() * 6), rr = Math.floor(r() * 8);
    e.ctx.fillRect(e.M + (w / 6) * c, top + ((bottom - top) / 8) * rr, w / 6, (bottom - top) / 8);
  },
};

/** Handling wear: scuffs along the top and bottom edges and a few marks down the hinge. */
function wear(ctx: CanvasRenderingContext2D, w: number, h: number, num: number, light: boolean) {
  const r = rng(num * 59 + 17);
  ctx.save();
  ctx.strokeStyle = light ? "#ddd6c9" : "#777267";
  ctx.lineCap = "round";
  for (let i = 0; i < 58; i++) {
    const top = r() < 0.5, x = w * (0.13 + r() * 0.7), y = top ? 3 + r() * 4 : h - 3 - r() * 4;
    ctx.globalAlpha = 0.055 + r() * 0.1;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 + r() * 12, y + (r() - 0.5) * 2); ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const y = h * (0.09 + r() * 0.82);
    ctx.globalAlpha = 0.055 + r() * 0.06;
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(w * 0.054 + r() * 3, y); ctx.lineTo(w * 0.054 + r() * 3, y + 3 + r() * 13); ctx.stroke();
  }
  ctx.restore();
}

/** The hinge: a soft shade and a scored crease near the spine. */
function hinge(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string) {
  const light = parseInt(ink.replace("#", "").slice(0, 2), 16) / 255 > 0.5;
  const a = w * 0.058, s = light ? 0.34 : 0.16;
  const g = ctx.createLinearGradient(0, 0, a, 0);
  g.addColorStop(0, `rgba(0,0,0,${s})`);
  g.addColorStop(0.45, `rgba(0,0,0,${s * 0.35})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, a, h);
  ctx.fillStyle = `rgba(0,0,0,${light ? 0.28 : 0.1})`;
  ctx.fillRect(a * 0.92, 0, 2, h);
  ctx.fillStyle = `rgba(255,255,255,${light ? 0.09 : 0.32})`;
  ctx.fillRect(a * 0.92 + 2, 0, 1.5, h);
}

/** The front board: masthead, the species print, the date, a category pill, wear and the notch's die line. */
export function drawCover(canvas: HTMLCanvasElement, post: ShelfPost, tk: Tokens, i: number) {
  const W = 1024, H = 1423;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stock = `#${stockColor(tk, i, post).getHexString()}`;
  const ink = inkFor(tk, post, i);
  ctx.fillStyle = stock;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, ink, i + 1);
  const num = String(post.num).padStart(2, "0");
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.62;
  ctx.font = `500 27px ${MONO}`;
  spacing(ctx, 0.5);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`WRITING:: N°${num}`, 92, 116);
  ctx.globalAlpha = 0.12;
  ctx.fillRect(92, 144, 840, 2);
  ctx.globalAlpha = 1;
  const species = post.cover ? COVERS[post.cover] : null;
  if (species) {
    species({ ctx, post, ink, stock, theme: tk.theme, CW: W, CH: H, M: 92, titleY: 370, seed: i * 31 + post.num });
    ctx.fillStyle = ink;
  } else {
    ctx.font = `500 96px ${SANS}`;
    spacing(ctx, -4.032);
    wrap(ctx, post.title, 840, 5).forEach((l, n) => ctx.fillText(l, 92, 370 + n * 96 * 0.98));
  }
  ctx.font = `500 27px ${MONO}`;
  spacing(ctx, 0.5);
  ctx.globalAlpha = 0.62;
  const dw = ctx.measureText(post.date).width;
  ctx.fillText(post.date, 932 - dw, 1309);
  ctx.globalAlpha = 1;
  ctx.font = `500 27px ${MONO}`;
  spacing(ctx, 1);
  const cat = post.cat.toUpperCase();
  const cw = ctx.measureText(cat).width;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.roundRect(92, 1270, cw + 52, 61, 30.5);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.fillText(cat, 118, 1309);
  ctx.globalAlpha = 1;
  hinge(ctx, W, H, ink);
  wear(ctx, W, H, post.num, new THREE.Color(ink).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5);
  // the notch's die line, drawn in the cover's own shape coordinates
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(W / 0.724, -1423 / 1.006);
  ctx.beginPath();
  const h = CW / 2 - 0.003;
  ctx.moveTo(h, NOTCH_Y - NOTCH_H / 2);
  ctx.bezierCurveTo(h, NOTCH_Y - NOTCH_H * 0.32, 0.286, NOTCH_Y - NOTCH_H * 0.16, 0.286, NOTCH_Y);
  ctx.bezierCurveTo(0.286, 0.0584, h, 0.0968, h, 0.14);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.13;
  ctx.lineWidth = 0.0015;
  ctx.stroke();
  ctx.restore();
}

/** Roughness from the print: ink sits glossier than the bare board. */
export function drawFinish(cover: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const c = tex.image as HTMLCanvasElement;
  c.width = 384;
  c.height = Math.round((c.width * cover.height) / cover.width);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(cover, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const o = (Math.round(c.height * 0.15) * c.width + Math.round(c.width * 0.5)) * 4;
  const r0 = d[o], g0 = d[o + 1], b0 = d[o + 2];
  for (let k = 0; k < d.length; k += 4) {
    const t = Math.min(1, (Math.abs(d[k] - r0) + Math.abs(d[k + 1] - g0) + Math.abs(d[k + 2] - b0)) / 160);
    d[k] = d[k + 1] = d[k + 2] = Math.round(250 - t * 48);
    d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.needsUpdate = true;
}

export function drawSpine(canvas: HTMLCanvasElement, post: ShelfPost, tk: Tokens, i: number) {
  const H = 1312;
  canvas.width = 128; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const ink = inkFor(tk, post, i);
  ctx.fillStyle = `#${stockColor(tk, i, post).lerp(new THREE.Color(familyTokens(tk, i, post).ink), 0.05).getHexString()}`;
  ctx.fillRect(0, 0, 128, H);
  speckle(ctx, 128, H, ink, i + 77);
}

const SYL = "ver.sal.tin.mor.pla.der.con.ika.ren.sto.gra.lum.pres.oto.ne.ma.ri.ta.sen.dio.fel.ur.ba.lith.cor.em.va.nis.ol.dra".split(".");
/** Filler copy for the lower half of a sheet, so a page reads as a page at a glance. */
function lorem(seed: number, sentences: number) {
  const r = rng(seed);
  const word = () => { let w = ""; const n = 1 + Math.floor(r() * 3); for (let i = 0; i < n; i++) w += SYL[Math.floor(r() * SYL.length)]; return w; };
  const out: string[] = [];
  for (let s = 0; s < sentences; s++) {
    const n = 5 + Math.floor(r() * 9), ws: string[] = [];
    for (let k = 0; k < n; k++) ws.push(word());
    ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
    out.push(ws.join(" ") + ".");
  }
  return out.join(" ");
}

/** The excerpt's first sentence, trimmed to fit the preview card. */
export function firstSentence(p: ShelfPost) {
  const t = (p.excerpt || p.summary).trim();
  const s = t.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || t;
  return s.length > 175 ? `${s.slice(0, 172).replace(/\s+\S*$/, "")}…` : s;
}

/** The little card that slides out of the notch on hover. */
export function drawPreview(canvas: HTMLCanvasElement, post: ShelfPost, tk: Tokens) {
  canvas.width = 704;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `400 40px ${SANS}`;
  spacing(ctx, -0.4);
  const lines = wrap(ctx, firstSentence(post), canvas.width - 92, 7);
  canvas.height = 112 + (lines.length - 1) * 49 + 42;
  ctx.fillStyle = `#${new THREE.Color(tk.paper).lerp(new THREE.Color("#ffffff"), tk.theme === "dark" ? 0.16 : 0.62).getHexString()}`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  speckle(ctx, canvas.width, canvas.height, tk.ink, post.num + 191);
  const g = ctx.createLinearGradient(0, 0, 70, 0);
  g.addColorStop(0, "rgba(0,0,0,0.2)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 70, canvas.height);
  ctx.fillStyle = tk.ink;
  ctx.globalAlpha = 0.5;
  ctx.font = `400 23px ${MONO}`;
  spacing(ctx, 1);
  ctx.fillText(`N°${String(post.num).padStart(2, "0")} / 01`, 46, 48);
  ctx.globalAlpha = 0.92;
  ctx.font = `400 40px ${SANS}`;
  spacing(ctx, -0.4);
  lines.forEach((l, i) => ctx.fillText(l, 46, 111 + i * 49));
  ctx.globalAlpha = 1;
}

const SHEET_H = Math.round((FH * 0.95 * 1024) / (FW * 0.97));

/** The top sheet: the post's first page, typeset like the article. */
export function drawSheet(canvas: HTMLCanvasElement, post: ShelfPost, tk: Tokens, i: number, name: string) {
  const W = 1024;
  canvas.width = W; canvas.height = SHEET_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${new THREE.Color(tk.paper).lerp(new THREE.Color("#ffffff"), tk.theme === "dark" ? 0.11 : 0.55).getHexString()}`;
  ctx.fillRect(0, 0, W, SHEET_H);
  speckle(ctx, W, SHEET_H, tk.ink, i + 41);
  const num = String(post.num).padStart(2, "0");
  ctx.fillStyle = tk.ink;
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 22px ${MONO}`;
  spacing(ctx, 1);
  ctx.globalAlpha = 0.5;
  ctx.fillText(`${name.toUpperCase()}:: WRITING`, 58, 76);
  const nw = ctx.measureText(`N°${num}`).width;
  ctx.fillText(`N°${num}`, 966 - nw, 76);
  ctx.globalAlpha = 0.14;
  ctx.fillRect(58, 98, 908, 2);
  ctx.font = `400 24px ${MONO}`;
  spacing(ctx, 0);
  ctx.globalAlpha = 0.55;
  let y = 154;
  ctx.fillText(`:: ${post.longDate}`, 58, y);
  y += 64;
  ctx.font = `500 73px ${SANS}`;
  spacing(ctx, -2.044);
  ctx.globalAlpha = 0.94;
  wrap(ctx, post.title, 908, 4).forEach((l) => { ctx.fillText(l, 58, y + 73 * 0.78); y += 73 * 1.06; });
  y += 46;
  if (post.tldr) {
    const top = y - 27;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(58, top, 908, 2);
    let ty = top + 24 + 18;
    ctx.globalAlpha = 0.55;
    ctx.font = `400 18px ${SANS}`;
    spacing(ctx, 0);
    ctx.fillText("TL;DR", 58, ty);
    ty += 46;
    ctx.globalAlpha = 0.9;
    ctx.font = `400 27px ${SANS}`;
    spacing(ctx, -0.3);
    const lines = wrap(ctx, post.tldr, 908, 8);
    lines.forEach((l, k) => ctx.fillText(l, 58, ty + k * 41));
    const end = ty + (lines.length - 1) * 41 + 12 + 24;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(58, end, 908, 2);
    y = end + 41 + 27;
  }
  ctx.globalAlpha = 0.82;
  ctx.font = `400 27px ${SANS}`;
  spacing(ctx, -0.3);
  const body = post.excerpt || post.summary || "";
  if (body) {
    for (const l of wrap(ctx, body, 908, 200)) { ctx.fillText(l, 58, y); y += 41; if (y >= 1190) break; }
    y += 24;
  }
  ctx.globalAlpha = 0.45;
  for (let d = 0; y < 1190; d++) {
    for (const l of wrap(ctx, lorem(i * 97 + d * 13 + post.num, 3 + (d % 3)), 908, 200)) { ctx.fillText(l, 58, y); y += 41; if (y >= 1190) break; }
    y += 24;
  }
  ctx.globalAlpha = 1;
}

/** A filled page for the sheet under the top one. */
export function drawBlank(canvas: HTMLCanvasElement, tk: Tokens) {
  const W = 1024;
  canvas.width = W; canvas.height = SHEET_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${new THREE.Color(tk.paper).lerp(new THREE.Color("#ffffff"), tk.theme === "dark" ? 0.1 : 0.55).getHexString()}`;
  ctx.fillRect(0, 0, W, SHEET_H);
  ctx.fillStyle = tk.ink;
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 28px ${SANS}`;
  spacing(ctx, -0.3);
  ctx.globalAlpha = 0.38;
  let y = 92;
  for (let o = 0; y < 1206; o++) {
    for (const l of wrap(ctx, lorem(700 + o * 31, 4), 908, 200)) { ctx.fillText(l, 58, y); y += 41; if (y >= 1206) break; }
    y += 24;
  }
  ctx.globalAlpha = 1;
}

/** Paper fibre relief. */
export function fibreBump(seed: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed * 13 + 7);
  const lean = (r() - 0.5) * 0.35, n = 850 + Math.floor(r() * 500);
  for (let i = 0; i < n; i++) {
    const v = Math.round(80 + r() * 96);
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 0.7 + r();
    const x = r() * 256, y = r() * 256, len = 4 + r() * 16, a = lean + (r() - 0.5) * 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 1600; i++) {
    const v = Math.round(64 + r() * 128);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r(), 1 + r());
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.center.set(0.5, 0.5);
  t.rotation = (r() - 0.5) * 0.14;
  t.repeat.set(2 + r() * 0.8, 2.5 + r() * 0.9);
  return t;
}

/** A soft round contact shadow. */
export function contactShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 127);
  g.addColorStop(0, "rgba(0,0,0,0.82)");
  g.addColorStop(0.35, "rgba(0,0,0,0.45)");
  g.addColorStop(0.7, "rgba(0,0,0,0.15)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** A rounded rectangle with separate left and right corner radii. */
export function roundedShape(w: number, h: number, rl: number, rr: number) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + rl, -y);
  s.lineTo(x - rr, -y);
  s.quadraticCurveTo(x, -y, x, -y + rr);
  s.lineTo(x, y - rr);
  s.quadraticCurveTo(x, y, x - rr, y);
  s.lineTo(-x + rl, y);
  s.quadraticCurveTo(-x, y, -x, y - rl);
  s.lineTo(-x, -y + rl);
  s.quadraticCurveTo(-x, -y, -x + rl, -y);
  return s;
}

/** The front cover's outline, with the thumb notch bitten out of its leading edge. */
export function coverShape() {
  const e = CW / 2, t = FH / 2, r = NOTCH_Y, lo = r - NOTCH_H / 2, hi = 0.14;
  const s = new THREE.Shape();
  s.moveTo(-0.284, -0.5);
  s.lineTo(0.284, -0.5);
  s.quadraticCurveTo(e, -0.5, e, -0.425);
  s.lineTo(e, lo);
  s.bezierCurveTo(e, -0.0568, 0.289, r - NOTCH_H * 0.16, 0.289, r);
  s.bezierCurveTo(0.289, 0.0584, e, hi - NOTCH_H * 0.18, e, hi);
  s.lineTo(e, 0.425);
  s.quadraticCurveTo(e, t, 0.284, t);
  s.lineTo(-0.284, t);
  s.quadraticCurveTo(-0.359, t, -0.359, 0.425);
  s.lineTo(-0.359, -0.425);
  s.quadraticCurveTo(-0.359, -0.5, -0.284, -0.5);
  return s;
}

export const extrude = (shape: THREE.Shape) =>
  new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2 });

/** Map a canvas onto extruded-shape UVs (which are in shape units). */
export function fitToShape(t: THREE.Texture, width: number) {
  t.repeat.set(1 / (width + 2 * BEVEL), 1 / 1.006);
  t.offset.set((width / 2 + BEVEL) / (width + 2 * BEVEL), 0.503 / 1.006);
}

/** Split long triangle edges until none is longer than maxEdge, so a flat board can bend smoothly. */
function tessellate(src: THREE.BufferGeometry, maxEdge: number, maxIter: number) {
  const geo = src.index !== null ? src.toNonIndexed() : src;
  const max2 = maxEdge * maxEdge;
  let pos = Array.from(geo.attributes.position.array as Float32Array);
  let nor = Array.from(geo.attributes.normal.array as Float32Array);
  let uv = Array.from(geo.attributes.uv.array as Float32Array);
  const P = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const N = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const U = [0, 1, 2, 3].map(() => new THREE.Vector2());
  let outP: number[] = [], outN: number[] = [], outU: number[] = [];
  const emit = (a: number, b: number, c: number) => {
    for (const k of [a, b, c]) {
      outP.push(P[k].x, P[k].y, P[k].z);
      outN.push(N[k].x, N[k].y, N[k].z);
      outU.push(U[k].x, U[k].y);
    }
  };
  let again = true;
  for (let iter = 0; again && iter < maxIter; iter++) {
    again = false;
    outP = []; outN = []; outU = [];
    for (let i = 0, j = 0; i < pos.length; i += 9, j += 6) {
      P[0].fromArray(pos, i); P[1].fromArray(pos, i + 3); P[2].fromArray(pos, i + 6);
      N[0].fromArray(nor, i); N[1].fromArray(nor, i + 3); N[2].fromArray(nor, i + 6);
      U[0].fromArray(uv, j); U[1].fromArray(uv, j + 2); U[2].fromArray(uv, j + 4);
      const ab = P[0].distanceToSquared(P[1]), bc = P[1].distanceToSquared(P[2]), ac = P[0].distanceToSquared(P[2]);
      if (ab > max2 || bc > max2 || ac > max2) {
        again = true;
        if (ab >= bc && ab >= ac) {
          P[3].lerpVectors(P[0], P[1], 0.5); N[3].lerpVectors(N[0], N[1], 0.5); U[3].lerpVectors(U[0], U[1], 0.5);
          emit(0, 3, 2); emit(3, 1, 2);
        } else if (bc >= ab && bc >= ac) {
          P[3].lerpVectors(P[1], P[2], 0.5); N[3].lerpVectors(N[1], N[2], 0.5); U[3].lerpVectors(U[1], U[2], 0.5);
          emit(0, 1, 3); emit(3, 2, 0);
        } else {
          P[3].lerpVectors(P[0], P[2], 0.5); N[3].lerpVectors(N[0], N[2], 0.5); U[3].lerpVectors(U[0], U[2], 0.5);
          emit(0, 1, 3); emit(3, 1, 2);
        }
      } else emit(0, 1, 2);
    }
    pos = outP; nor = outN; uv = outU;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** Tessellate each material group of an extruded board separately, then merge them back. */
export function bendable(geo: THREE.BufferGeometry) {
  const parts = geo.groups.map(({ start, count }) => {
    const g = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const a = geo.getAttribute(name) as THREE.BufferAttribute;
      g.setAttribute(name, new THREE.Float32BufferAttribute((a.array as Float32Array).slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
    }
    const t = tessellate(g, 0.065, 8);
    g.dispose();
    return t;
  });
  const merged = mergeGeometries(parts, true)!;
  merged.groups.forEach((g, i) => { g.materialIndex = geo.groups[i].materialIndex; });
  parts.forEach((p) => p.dispose());
  return merged;
}

export type Flex = { geometry: THREE.BufferGeometry; update: (amount: number) => void; dispose: () => void };

/** Curl a flat piece away from its hinge (x = -width/2): "card" for the cover, "paper" for sheets, "flag" for the sticky tab. */
export function flex(src: THREE.BufferGeometry, width: number, kind: "card" | "paper" | "flag", seed = 0): Flex {
  const geo = src.clone();
  const base = (geo.getAttribute("position").array as Float32Array).slice();
  const baseN = (geo.getAttribute("normal").array as Float32Array).slice();
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let last = NaN;
  const update = (e: number) => {
    if (Math.abs(last - e) < 25e-6) return;
    last = e;
    for (let i = 0; i < pos.count; i++) {
      const k = i * 3, x = base[k], y = base[k + 1];
      const p = Math.max(0, Math.min(1, (x + width / 2) / width));
      let dz: number, sx: number, sy: number;
      if (kind === "card") {
        const n = 0.3 * (1 - Math.exp(-p * 24)) + 0.7 * p * p;
        dz = e * n * (1 - 0.65 * y * y);
        sx = ((e * (7.2 * Math.exp(-p * 24) + 1.4 * p)) / width) * (1 - 0.65 * y * y);
        sy = e * n * -1.3 * y;
      } else {
        const w = kind === "flag" ? 0 : 0.08 * Math.sin(seed * 2.7);
        const a = 0.45 + 2.2 * (y + w) * (y + w);
        dz = e * p * p * a;
        sx = ((e * 2 * p) / width) * a;
        sy = e * p * p * 4.4 * (y + w);
      }
      pos.setXYZ(i, x, y, base[k + 2] + dz);
      v.set(baseN[k] - sx * baseN[k + 2], baseN[k + 1] - sy * baseN[k + 2], baseN[k + 2]).normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = nor.needsUpdate = true;
  };
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius += 0.12;
  return { geometry: geo, update, dispose: () => geo.dispose() };
}

/** A soft studio for reflections: grey sweep with a big softbox, a strip and a flag. */
export function studioEnv(renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#6e7075"); g.addColorStop(0.46, "#3a3b3e"); g.addColorStop(1, "#17181a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(150, 40, 300, 150); ctx.fillRect(620, 70, 60, 210);
  ctx.fillStyle = "#4a4a50"; ctx.fillRect(760, 120, 190, 130);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(tex);
  tex.dispose();
  return { envRT, pmrem };
}
