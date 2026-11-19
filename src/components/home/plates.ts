import type { Project } from "@/content/site";

/* Canvas art for the wheels: the 16:9 "proof" image cards, and the face of the
   letterpress die plates (stock + monogram + a relief normal map). */

const fontVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const luminance = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

export const monogram = (p: Project) =>
  p.mono ??
  (p.name.split(/\s+/).length > 1
    ? p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)
    : p.name.slice(0, 2)
  ).toUpperCase();

/* Placeholder proof (used when a project has no `image`). 16:9, power-of-two
   friendly width so mip-mapped depth-of-field looks smooth. */
export function drawCard(p: Project): HTMLCanvasElement {
  const w = 1024, h = 576;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const sans = fontVar("--font-geist", "sans-serif");
  const mono = fontVar("--font-geist-mono", "monospace");
  const light = luminance(p.tint) > 0.55;
  const ink = light ? "#1e1e1e" : "#f4f2ee";

  ctx.fillStyle = p.tint;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.72, h * 0.18, 0, w * 0.72, h * 0.18, w);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.65;
  ctx.font = `500 18px ${mono}`;
  ctx.fillText(p.collab.toUpperCase(), 44, 58);
  ctx.textAlign = "right";
  ctx.fillText(p.year, w - 44, 58);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  let size = 170;
  ctx.font = `560 ${size}px ${sans}`;
  while (ctx.measureText(p.name).width > w - 88 && size > 50) { size -= 6; ctx.font = `560 ${size}px ${sans}`; }
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${-size * 0.045}px`;
  ctx.fillText(p.name, 40, h - 52);

  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* Deterministic hash, so every plate keeps its own speckle across retints. */
const hash = (i: number, s: number) => {
  let n = (Math.imul(i, 374761393) + Math.imul(s + 1, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Stock colour for a tone (1 = bone, ~0.14 = graphite). */
export const stockRGB = (tone: number, seed: number): [number, number, number] => {
  const n = (seed - 0.5) * 6, r = 18 + tone * 224 + n;
  return [r, r - 1, r - 4 * tone];
};

const SIZE = 512;

/* Project logos, loaded once. Until a logo is in, the plate shows the monogram. */
const logos = new Map<string, Promise<HTMLImageElement>>();
const loadedLogos = new Map<string, HTMLImageElement>();

export function loadLogo(src: string) {
  let pending = logos.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { loadedLogos.set(src, img); resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
    logos.set(src, pending);
  }
  return pending;
}

/** The mark: the project's logo in its own colours (or as a flat silhouette
    when `ink` is given), else the inked monogram. */
function markCanvas(p: Project, ink: string, keepLogoColour = false) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const logo = p.logo ? loadedLogos.get(p.logo) : undefined;
  if (logo) {
    const w = logo.naturalWidth || 1, h = logo.naturalHeight || 1;
    // logos fill most of the plate: up to 86% of its width, 74% of its height
    const s = Math.min((SIZE * 0.86) / w, (SIZE * 0.74) / h);
    ctx.drawImage(logo, (SIZE - w * s) / 2, (SIZE - h * s) / 2, w * s, h * s);
    if (!keepLogoColour) {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = "source-over";
    }
    return c;
  }
  const mono = fontVar("--font-geist-mono", "monospace");
  ctx.fillStyle = ink;
  ctx.font = `600 ${SIZE * 0.34}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(monogram(p), SIZE / 2, SIZE / 2 + SIZE * 0.02);
  return c;
}

/** The die face: stock with flake (on graphite) and the inked mark. */
export function drawPlateFace(p: Project, tone: number, seed: number, out?: HTMLCanvasElement) {
  const c = out ?? document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const [r, g, b] = stockRGB(tone, seed);
  ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (tone < 0.5) {
    const s = Math.round(seed * 977);
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 2600; i++) {
      ctx.globalAlpha = (0.35 + hash(i, s + 104729) * 0.65) * 0.35 * 0.6;
      ctx.fillRect(hash(i, s) * SIZE, hash(i, s + 7919) * SIZE, 1 + hash(i, 17) * 1.2, 1 + hash(i, 19) * 1.2);
    }
    ctx.globalAlpha = 1;
  }
  // a project logo is printed on its own unlit layer (drawLogoLayer) so its colours stay true
  if (!(p.logo && loadedLogos.has(p.logo))) ctx.drawImage(markCanvas(p, tone < 0.5 ? "#e8e6e0" : "#1c1c1c", true), 0, 0);
  return c;
}

/** The project's logo in its original colours on a transparent sheet, laid out like the plate face. */
export function drawLogoLayer(p: Project) {
  if (!p.logo || !loadedLogos.has(p.logo)) return null;
  return markCanvas(p, "#000", true);
}

/** Relief normal map: the mark blurred into a bevel, then Sobel → normals. */
export function drawPlateRelief(p: Project, bevelPx = 3.5) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  // a project logo is shown as supplied, not pressed: the plate stays flat under it
  if (p.logo && loadedLogos.has(p.logo)) {
    ctx.fillStyle = "rgb(128, 128, 255)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    return c;
  }
  const mask = markCanvas(p, "#fff");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.filter = `blur(${bevelPx}px)`;
  ctx.drawImage(mask, 0, 0);
  ctx.filter = "none";
  const src = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = ctx.createImageData(SIZE, SIZE), d = out.data;
  const at = (x: number, y: number) => src[(Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))) * 4];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 1020;
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 1020;
      const i = (y * SIZE + x) * 4;
      // debossed: the mark is pressed into the stock
      d[i] = Math.round((0.5 + gx * 2.5) * 255);
      d[i + 1] = Math.round((0.5 + gy * 2.5) * 255);
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Rounded-square alpha mask for the die face. */
export function roundMask(radiusRatio: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 256, 256 * radiusRatio);
  ctx.fill();
  return c;
}

/** Fine speckle bump for the die body. */
export function speckle() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 118 + Math.floor(hash(i, 11) * 24);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(hash(i, 3) * 128, hash(i, 7) * 128, 1.4, 1.4);
  }
  return c;
}
