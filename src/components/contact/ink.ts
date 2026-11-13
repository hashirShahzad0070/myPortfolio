import gsap from "gsap";

/* Pen ink for the letter: strokes are stored normalised (0..1) with time and
   pressure; width swells with pen pressure or thins with speed. */

export type InkPoint = { x: number; y: number; t: number; p: number };
export type Stroke = InkPoint[];

export const PEN = "#1b2440";
const BASE = 2.4;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function strokePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; t: number; p: number }[], scale: number) {
  if (!pts.length) return;
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, (BASE * scale) / 2, 0, 7); ctx.fill(); return; }
  const w: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i];
    if (b.p > 0) w.push(BASE * (0.6 + b.p * 0.95));
    else {
      const dt = Math.max(8, b.t - a.t);
      const v = (Math.hypot(b.x - a.x, b.y - a.y) / dt) * 16.667;
      w.push(BASE * (1.12 - Math.min(v / 22, 1) * 0.5));
    }
  }
  for (let k = 0; k < 2; k++) for (let i = 1; i < w.length - 1; i++) w[i] = (w[i - 1] + w[i] * 2 + w[i + 1]) / 4;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i++) {
    ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = Math.max(0.4, w[i] * scale); ctx.stroke();
  }
}

/** Draw strokes into a w×h box, keeping the pad's aspect; `progress` 0..1 for a write-on. */
export function drawInk(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, dpr: number, progress = 1, aspect = w / h) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = PEN; ctx.fillStyle = PEN;
  let sw = h * aspect, sh = h;
  if (sw > w) { sw = w; sh = w / aspect; }
  const top = h - sh;
  const total = strokes.reduce((a, s) => a + s.length, 0);
  let left = Math.ceil(total * Math.min(1, Math.max(0, progress)));
  for (const s of strokes) {
    if (left <= 0) break;
    const n = Math.min(s.length, left);
    left -= n;
    strokePath(ctx, s.slice(0, n).map((p) => ({ ...p, x: p.x * sw, y: top + p.y * sh })), sw / 640);
  }
}

/** The signature as shown on the letter (read-only, writes itself on). */
export function signatureView(box: HTMLElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  let strokes: Stroke[] = [], aspect = 640 / 240, progress = 1, w = 1, h = 1, dpr = 1;
  let tween: gsap.core.Tween | null = null;
  const paint = () => drawInk(ctx, strokes, w, h, dpr, progress, aspect);
  const size = () => {
    const r = box.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height); dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    paint();
  };
  const ro = new ResizeObserver(size);
  ro.observe(box);
  size();
  return {
    show(next: Stroke[], animate: boolean, a = aspect) {
      strokes = next; aspect = a;
      tween?.kill();
      if (!animate || reduced() || !next.length) { progress = 1; paint(); return; }
      const o = { p: 0 };
      progress = 0; paint();
      tween = gsap.to(o, { p: 1, duration: 0.55, ease: "power1.inOut", onUpdate: () => { progress = o.p; paint(); } });
    },
    dispose() { tween?.kill(); ro.disconnect(); },
  };
}

/** The signing pad inside the slip dialog. */
export function signaturePad(box: HTMLElement, canvas: HTMLCanvasElement, onChange: () => void) {
  const ctx = canvas.getContext("2d")!;
  let strokes: Stroke[] = [], live: Stroke | null = null, w = 1, h = 1, dpr = 1;
  const paint = () => drawInk(ctx, live ? [...strokes, live] : strokes, w, h, dpr, 1);
  const size = () => {
    const r = box.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height); dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    paint();
  };
  const at = (e: PointerEvent): InkPoint => {
    const r = box.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: e.timeStamp, p: e.pointerType === "pen" ? e.pressure : 0 };
  };
  const ac = new AbortController();
  const signal = ac.signal;
  box.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    live = [at(e)]; paint();
  }, { signal });
  box.addEventListener("pointermove", (e) => {
    if (!live) return;
    let evs = e.getCoalescedEvents?.() ?? [];
    if (!evs.length) evs = [e];
    for (const ev of evs) live.push(at(ev));
    paint();
  }, { signal });
  const end = (e: PointerEvent) => {
    if (!live) return;
    strokes.push(live); live = null;
    try { box.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    paint(); onChange();
  };
  box.addEventListener("pointerup", end, { signal });
  box.addEventListener("pointercancel", end, { signal });
  const ro = new ResizeObserver(size);
  ro.observe(box);
  size();
  return {
    strokes: () => strokes.map((s) => s.slice()),
    aspect: () => w / h,
    set(next: Stroke[]) { strokes = next.map((s) => s.slice()); paint(); },
    signed: () => strokes.length > 0,
    clear() { strokes = []; live = null; paint(); onChange(); },
    png(pw = 640, ph = 180) {
      if (!strokes.length) return "";
      const c = document.createElement("canvas");
      c.width = pw * 2; c.height = ph * 2;
      drawInk(c.getContext("2d")!, strokes, pw, ph, 2, 1, w / h);
      return c.toDataURL("image/png");
    },
    resize: size,
    dispose() { ac.abort(); ro.disconnect(); },
  };
}

/** The red "RECEIVED" rubber stamp, inked with a little turbulence. */
export function stampSVG(date: string, seed: number, color = "var(--spot)") {
  const mono = "Geist Mono, ui-monospace, monospace";
  return `<svg viewBox="0 0 300 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <filter id="letter-ink-${seed}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${seed}" result="r"/>
      <feDisplacementMap in="SourceGraphic" in2="r" scale="1.4" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="${seed + 7}" result="m"/>
      <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3.5 -1.1" result="mm"/>
      <feComposite in="d" in2="mm" operator="in"/>
    </filter>
  </defs>
  <g filter="url(#letter-ink-${seed})" fill="none" stroke="${color}">
    <rect x="5" y="5" width="290" height="122" rx="7" stroke-width="4.4"/>
    <rect x="14" y="14" width="272" height="104" rx="4" stroke-width="0.9"/>
    <line x1="14" y1="84" x2="286" y2="84" stroke-width="0.9"/>
    <text x="150" y="63" fill="${color}" stroke="none" text-anchor="middle" font-family="${mono}" font-size="42" font-weight="500" letter-spacing="3">RECEIVED</text>
    <text x="150" y="107" fill="${color}" stroke="none" text-anchor="middle" font-family="${mono}" font-size="17" letter-spacing="4">${date}</text>
  </g>
</svg>`;
}

const rand = (e: number) => { const t = Math.sin(e * 127.1 + 311.7) * 43758.5453; return t - Math.floor(t); };
export const ukDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

/** The sender's "customer copy": the letter as a PNG, stamped. */
export function customerCopy(o: {
  who: string; role: string; reach: string; date: string; dear: string; kind: string; from: string; body: string; name: string;
  signature: Stroke[]; aspect: number; stampDate: string; seed: number; job: string;
}): Promise<Blob | null> {
  const css = getComputedStyle(document.documentElement);
  const mono = css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace";
  const sans = css.getPropertyValue("--font-geist").trim() || "system-ui, sans-serif";
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `400 14px ${mono}`;
  const lines: string[] = [];
  for (const para of o.body.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (measure.measureText(t).width > 732 && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  const rows = Math.max(6, lines.length), H = 470 + rows * 30 + 300;
  const c = document.createElement("canvas");
  c.width = 1800; c.height = H * 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.fillStyle = "#f3f2ef"; ctx.fillRect(0, 0, 900, H);
  for (let e = 0; e < 6000; e++) {
    const t = rand(e * 1.7);
    ctx.fillStyle = t > 0.5 ? `rgba(0,0,0,${0.02 + t * 0.03})` : `rgba(255,255,255,${0.2 + t * 0.3})`;
    ctx.fillRect(rand(e * 2.3) * 900, rand(e * 3.1) * H, 1.2, 1.2);
  }
  const ink = "#1e1e1e", muted = "rgba(30,30,30,0.58)", rule = "rgba(30,30,30,0.22)";
  let y = 84;
  ctx.fillStyle = ink; ctx.font = `500 17px ${sans}`; ctx.fillText(o.who, 84, y + 14);
  ctx.font = `400 11px ${mono}`; ctx.fillStyle = muted;
  ctx.fillText(o.role.toUpperCase(), 84, y + 34); ctx.fillText(o.reach.toUpperCase(), 84, y + 50);
  y += 70; ctx.fillStyle = rule; ctx.fillRect(84, y, 732, 1);
  y += 44; ctx.fillStyle = muted; ctx.font = `400 12px ${mono}`; ctx.fillText(o.date, 84, y);
  y += 38; ctx.fillStyle = ink; ctx.font = `400 15px ${mono}`; ctx.fillText(o.dear, 84, y);
  y += 40; ctx.font = `400 13px ${mono}`; ctx.fillStyle = muted; ctx.fillText("RE ::", 84, y);
  ctx.fillStyle = ink; ctx.fillText(`[X] ${o.kind}`, 148, y);
  y += 34; ctx.fillStyle = muted; ctx.fillText("FROM ::", 84, y);
  ctx.fillStyle = ink; ctx.font = `400 14px ${mono}`; ctx.fillText(o.from, 158, y);
  ctx.fillStyle = rule; ctx.fillRect(84, y + 10, 732, 1);
  y += 46; ctx.font = `400 14px ${mono}`;
  for (let e = 0; e < rows; e++) {
    ctx.fillStyle = ink; if (lines[e]) ctx.fillText(lines[e], 84, y + e * 30 + 19);
    ctx.fillStyle = rule; ctx.fillRect(84, y + e * 30 + 29, 732, 1);
  }
  y += rows * 30 + 44;
  ctx.fillStyle = ink; ctx.font = `400 15px ${mono}`; ctx.fillText("Sincerely,", 84, y);
  y += 16;
  const sig = document.createElement("canvas");
  sig.width = 1464; sig.height = 220;
  drawInk(sig.getContext("2d")!, o.signature, 732, 110, 2, 1, o.aspect);
  ctx.drawImage(sig, 84, y, 732, 110);
  y += 110; ctx.fillStyle = rule; ctx.fillRect(84, y, 732, 1);
  y += 22; ctx.fillStyle = ink; ctx.font = `400 13px ${mono}`; if (o.name) ctx.fillText(o.name, 84, y);
  ctx.fillStyle = muted; ctx.font = `400 11px ${mono}`;
  ctx.fillText(`CUSTOMER COPY · ${o.job} · ONE REPLY, NO NEWSLETTER`, 84, H - 60);
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => c.toBlob((b) => resolve(b), "image/png");
    img.onload = () => {
      ctx.save();
      ctx.translate(701, y - 110 * 0.55);
      ctx.rotate((-9 * Math.PI) / 180);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(img, -115, -101.2 / 2, 230, 101.2);
      ctx.restore();
      done();
    };
    img.onerror = done;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stampSVG(o.stampDate, o.seed, "#b03a1e"));
  });
}
