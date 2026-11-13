/* Canvas art for the studio badge: card front/back, the woven strap, and its bump. */

export type BadgeInfo = {
  name: string; role: string; studio: string; line: string; addr: string; place: string; year: string;
};

export const CARD_W = 1000, CARD_H = 1400;
const M = 88;
const STOCK = "#efeeeb", INK = "#1e1e1e", MUTED = "rgba(30,30,30,0.58)";

const fonts = () => {
  const cs = getComputedStyle(document.documentElement);
  return {
    sans: cs.getPropertyValue("--font-geist").trim() || "system-ui, sans-serif",
    mono: cs.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace",
  };
};
const rand = (e: number) => { const t = Math.sin(e * 127.1 + 311.7) * 43758.5453; return t - Math.floor(t); };
const track = (ctx: CanvasRenderingContext2D, size: number, em: number) => {
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(size * em).toFixed(2)}px`; } catch { /* unsupported */ }
};

/** Paper speckle: dark flecks and light fibres. */
function speck(ctx: CanvasRenderingContext2D, seed: number) {
  for (let n = 0; n < 9000; n++) {
    const x = rand(seed + n * 2.1) * CARD_W, y = rand(seed + n * 3.7) * CARD_H, a = rand(seed + n * 5.3);
    ctx.fillStyle = a > 0.5 ? `rgba(0,0,0,${0.03 + a * 0.05})` : `rgba(255,255,255,${0.15 + a * 0.3})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function drawFront(c: HTMLCanvasElement, b: BadgeInfo) {
  const { sans, mono } = fonts();
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = STOCK; ctx.fillRect(0, 0, CARD_W, CARD_H);
  speck(ctx, 11);
  ctx.fillStyle = MUTED; ctx.font = `500 28px ${mono}`; track(ctx, 28, 0.04);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillText("STUDIO PASS", M, 110);
  ctx.textAlign = "right"; ctx.fillText(b.year, 912, 110);
  track(ctx, 28, 0);
  ctx.textAlign = "left"; ctx.fillStyle = INK; ctx.font = `500 96px ${sans}`; track(ctx, 96, -0.028);
  ctx.fillText(b.name, 84, 1078);
  track(ctx, 96, 0);
  ctx.fillStyle = MUTED; ctx.font = `400 44px ${sans}`; track(ctx, 44, -0.01);
  ctx.fillText(b.role, M, 1142);
  track(ctx, 44, 0);
  ctx.fillStyle = "rgba(30,30,30,0.18)"; ctx.fillRect(M, 1232, 824, 2);
  ctx.fillStyle = INK; ctx.font = `500 28px ${mono}`; track(ctx, 28, 0.04);
  ctx.fillText(b.studio.toUpperCase(), M, 1298);
  ctx.textAlign = "right"; ctx.fillStyle = MUTED; ctx.fillText(b.place.toUpperCase(), 912, 1298);
  track(ctx, 28, 0);
}

export function drawBack(c: HTMLCanvasElement, b: BadgeInfo) {
  const { sans, mono } = fonts();
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = STOCK; ctx.fillRect(0, 0, CARD_W, CARD_H);
  speck(ctx, 29);
  ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.font = `400 108px ${sans}`; track(ctx, 108, -0.042);
  const words = b.line.split(" "), half = Math.ceil(words.length / 2);
  ctx.fillText(words.slice(0, half).join(" "), 84, 418);
  ctx.fillText(words.slice(half).join(" ") + ".", 84, 524);
  track(ctx, 108, 0);
  // barcode
  let x = M, i = 0;
  ctx.fillStyle = INK;
  while (x < 612) {
    const w = 2 + Math.floor(rand(500 + i) * 4) * 2;
    if (rand(900 + i) > 0.42) ctx.fillRect(x, 1160, w, 92);
    x += w + 2; i++;
  }
  ctx.fillStyle = MUTED; ctx.font = `500 28px ${mono}`; track(ctx, 28, 0.04);
  ctx.textAlign = "right"; ctx.fillText(b.addr, 912, 1248);
  ctx.textAlign = "left"; ctx.fillText("STUDIO PASS", M, 1296);
  ctx.textAlign = "right"; ctx.fillText(b.year, 912, 1296);
  track(ctx, 22, 0);
}

/** Woven strap printed with the studio name running along it. */
export function drawStrap(text: string, ink: string) {
  const { mono } = fonts();
  const c = document.createElement("canvas");
  c.width = 256; c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#151515"; ctx.fillRect(0, 0, 256, 1024);
  ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = 1.2;
  for (let e = -1024; e < 1280; e += 6) { ctx.beginPath(); ctx.moveTo(e, 0); ctx.lineTo(e + 1024, 1024); ctx.stroke(); }
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  for (let e = 0; e < 2300; e += 6) { ctx.beginPath(); ctx.moveTo(e, 0); ctx.lineTo(e - 1024, 1024); ctx.stroke(); }
  ctx.save();
  ctx.translate(128, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = ink;
  ctx.font = `500 54px ${mono}`;
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const unit = `${text.toUpperCase()}   ✱   `;
  const w = ctx.measureText(unit).width;
  const count = Math.ceil(1024 / w) + 1;
  // scale so the pattern tiles seamlessly over the texture's length
  ctx.scale(1024 / (w * Math.max(1, Math.round(1024 / w))), 1);
  for (let e = 0; e < count; e++) ctx.fillText(unit, e * w, 0);
  ctx.restore();
  return c;
}

export function drawWeaveBump() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#a8a8a8"; ctx.lineWidth = 1.5;
  for (let e = -128; e < 256; e += 6) { ctx.beginPath(); ctx.moveTo(e, 0); ctx.lineTo(e + 128, 128); ctx.stroke(); }
  return c;
}

/** A soft studio for reflections: grey sweep with a big softbox, a strip and a flag. */
export function drawStudioEnv() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#6e7075"); g.addColorStop(0.46, "#3a3b3e"); g.addColorStop(1, "#17181a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(150, 40, 300, 150); ctx.fillRect(620, 70, 60, 210);
  ctx.fillStyle = "#4a4a50"; ctx.fillRect(760, 120, 190, 130);
  return c;
}

/** A square, black & white print of a photo for the plate, with rounded corners. */
export function loadPhoto(src: string, focus: { x: number; y: number; zoom: number }, radiusRatio: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const S = 768;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;
      const side = Math.min(img.naturalWidth * focus.zoom, img.naturalHeight);
      const sx = Math.min(Math.max(0, img.naturalWidth * focus.x - side / 2), img.naturalWidth - side);
      const sy = Math.min(Math.max(0, img.naturalHeight * focus.y - side / 2), img.naturalHeight - side);
      ctx.beginPath();
      ctx.roundRect(0, 0, S, S, S * radiusRatio);
      ctx.clip();
      ctx.filter = "grayscale(1) contrast(1.12) brightness(0.98)";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
      ctx.filter = "none";
      // a whisper of print grain so it sits with the paper
      const data = ctx.getImageData(0, 0, S, S), d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(data, 0, 0);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Rasterise the plate mark (SVG string) — or initials when there is none. */
export function loadMark(svg: string, initials: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    if (!svg) {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#e8e6e0";
      ctx.font = `600 220px ${fonts().sans}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials, 256, 270);
      resolve(c);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
      const c = document.createElement("canvas");
      c.width = 512; c.height = Math.round(512 / ratio);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
