/* The Lab index, three ways: a flat list, a side-anchored wheel (the default), and a draggable
   grid of cards under a cursor lens. All three are one layout blended by per-item mode weights,
   so switching modes morphs every row into place. Ported from the reference site's lab index. */
import gsap from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

type Mode = "flat" | "wheel" | "grid";
const MODES: Mode[] = ["flat", "wheel", "grid"];
const STORE = "lab-mode";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const follow = (k: number, frames: number) => 1 - (1 - k) ** frames;
/** Signed wrap into [-n/2, n/2). */
const wrapS = (x: number, n: number) => { const m = ((x % n) + n) % n; return m >= n / 2 ? m - n : m; };

const ARC_FULL = 0.5; // rows stay fully visible within this angle on the wheel
const ARC_SHRINK = 0.9;
const ARC_CUT = 1.35;
const SHRINK = 0.1;
const CAPTION = 30; // grid card caption height
const BOW = 0.13; // grid barrel distortion
const LENS = 0.22; // cursor lens strength
const LENS_R = 1.5; // lens radius in card pitches
const PARALLAX = 10;
const LENS_FOLLOW = 0.12;
const LENS_FADE = 0.08;

/** CSS matrix3d mapping a w×h box onto four corner points. */
function quad(w: number, h: number, [x0, y0]: number[], [x1, y1]: number[], [x2, y2]: number[], [x3, y3]: number[]) {
  const a = x1 - x3, b = y1 - y3, c = x2 - x3, d = y2 - y3, e = x0 - x1 - x2 + x3, f = y0 - y1 - y2 + y3;
  const det = a * d - c * b;
  const g = det ? (e * d - c * f) / det : 0;
  const hh = det ? (a * f - e * b) / det : 0;
  const m11 = x1 - x0 + g * x1, m21 = x2 - x0 + hh * x2, m12 = y1 - y0 + g * y1, m22 = y2 - y0 + hh * y2;
  return `matrix3d(${m11 / w},${m12 / w},0,${g / w},${m21 / h},${m22 / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`;
}

export function mountLab(root: HTMLElement): () => void {
  const view = root.querySelector<HTMLElement>("[data-lab-viewport]");
  const preview = root.querySelector<HTMLElement>("[data-lab-preview]");
  const previewImg = root.querySelector<HTMLImageElement>("[data-lab-preview-img]");
  const items = [...root.querySelectorAll<HTMLElement>("[data-lab-item]")];
  if (!view || !preview || !previewImg || !items.length) return () => {};
  const cards = items.map((e) => e.querySelector<HTMLElement>(".lab__card"));
  const cardImgs = items.map((e) => e.querySelector<HTMLElement>(".lab__card img"));
  const faces = items.map((e) => e.querySelector<HTMLElement>(".lab__row-face"));
  const toggle = root.querySelector<HTMLElement>("[data-lab-mode-toggle]");
  const toggleBg = root.querySelector<HTMLElement>("[data-lab-mode-bg]");
  const COLS = Number(root.dataset.labCols) || 6;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const ac = new AbortController();
  const { signal } = ac;

  const cursor = { x: 0, y: 0, cx: 0, cy: 0 };
  const lens = { t: 0, c: 0 };
  const intro = { v: 0, g: 0, p: 1, bow: 1 };
  let active: HTMLElement | null = null;
  let activeIdx = 0;
  const previewY = gsap.quickTo(preview, "y", { duration: 0.55, ease: "power3.out" });

  /* measurements */
  let VW = 0, VH = 0, ROW = 1, LOOP = 1, R = 1, BULGE = 0, CLAMP = Infinity, LEFT = 0;
  let CW = 1, CH = 1, PX = 1, PY = 1, GW = 1, GH = 1, PV_TOP = 0, PV_H = 0;
  const ROWS = Math.ceil(items.length / COLS);
  const measure = () => {
    VW = view.clientWidth;
    VH = view.clientHeight;
    ROW = items[0].offsetHeight || 1;
    LOOP = ROW * items.length;
    R = Math.max(VH * 0.75, 320);
    BULGE = Math.min(R * (1 - Math.cos(ARC_FULL)), VW * 0.06);
    CLAMP = Math.max(VH / 2 + 2 * ROW, ARC_CUT * R);
    LEFT = items[0].offsetLeft;
    const gap = Math.max(16, VW * 0.015);
    const byW = (VW - COLS * gap) / (COLS - 1);
    const byH = (4 / 3) * ((VH - ROWS * gap) / (ROWS - 1) - CAPTION);
    CW = Math.max(Math.min(Math.max(200, 0.19 * VW), 320), byW, byH);
    CH = 0.75 * CW + CAPTION;
    PX = CW + gap;
    PY = CH + gap;
    GW = COLS * PX;
    GH = ROWS * PY;
    root.style.setProperty("--lab-card-w", `${CW}px`);
    root.style.setProperty("--lab-card-h", `${CH}px`);
    PV_TOP = preview.offsetTop;
    PV_H = preview.offsetHeight;
  };
  measure();

  let saved: string | null = null;
  try { saved = localStorage.getItem(STORE); } catch { /* private mode */ }
  let mode: Mode = MODES.includes(saved as Mode) ? (saved as Mode) : "wheel";
  const w: Record<Mode, number> = { flat: 0, wheel: 0, grid: 0 };
  w[mode] = 1;
  const itemW = items.map(() => ({ ...w }));
  const faceOp = new Float32Array(items.length).fill(-1);
  const blendRate = () => (reduced() ? 1 : mode === "grid" ? 0.08 : 0.115);
  let frames = 1;

  const flatStart = () => VH / 2 - ROW / 2;
  const start = Math.min(items.length - 1, Math.max(0, Number(root.dataset.labStart) || 0));
  let tarY = mode === "flat" ? flatStart() : start * ROW;
  let curY = tarY;
  let gx = 0, gxCur = 0, gy = 0, gyCur = 0;
  let lastInput = 0;
  let dirty = true;
  let vx = 0, vy = 0;
  const col = (i: number) => i % COLS;
  const row = (i: number) => Math.floor(i / COLS);
  const stagger = (r: number) => (r % 3) * (PX / 3);
  gx = gxCur = col(start) * PX + stagger(row(start));
  gy = gyCur = row(start) * PY;

  /** The y of an item's row in the current blend — where the flat-mode preview lines up. */
  const rowY = (i: number) => {
    const off = wrapS(i * ROW - curY - intro.v, LOOP);
    const c = Math.max(-CLAMP, Math.min(CLAMP, off));
    const flat = VH / 2 + c - ROW / 2;
    const wheel = VH / 2 + R * Math.sin(c / R) - ROW / 2;
    const grid = VH / 2 + wrapS(row(i) * PY - gyCur - intro.g, GH) - CH / 2;
    return flat * w.flat + wheel * w.wheel + grid * w.grid;
  };
  const placePreview = (instant = false) => {
    if (!active) return;
    const y = (mode === "wheel" ? VH / 2 : rowY(activeIdx) + ROW / 2) - PV_H / 2 - PV_TOP;
    const c = Math.max(-PV_TOP, Math.min(VH - PV_H - PV_TOP, y));
    if (instant || reduced()) gsap.set(preview, { y: c });
    else previewY(c);
  };

  /* the preview swaps images with a clip-path iris */
  let queued: string | null = null;
  let revealing = false;
  const reveal = (src: string) => {
    queued = null;
    const prev = previewImg.getAttribute("src");
    if (prev) preview.style.backgroundImage = `url("${prev}")`;
    previewImg.src = src;
    if (reduced()) return;
    revealing = true;
    const r = getComputedStyle(preview).borderRadius || "0px";
    gsap.fromTo(previewImg,
      { clipPath: `inset(50% 50% 50% 50% round ${r})`, scale: 1.08 },
      {
        clipPath: `inset(0% 0% 0% 0% round ${r})`, scale: 1, duration: 0.75, ease: "expo.out", overwrite: true,
        onComplete: () => {
          preview.style.backgroundImage = "";
          revealing = false;
          if (queued && queued !== previewImg.getAttribute("src")) reveal(queued);
          else queued = null;
        },
      });
  };
  const setActive = (el: HTMLElement) => {
    if (el === active) return;
    active = el;
    activeIdx = items.indexOf(el);
    items.forEach((t) => t.classList.toggle("is-active", t === el));
    const src = el.dataset.preview;
    if (src && previewImg.getAttribute("src") !== src) {
      if (revealing) queued = src;
      else reveal(src);
    }
    placePreview();
  };
  let settled = true;
  const settlePulse = () => {
    if (!reduced()) gsap.fromTo(preview, { scale: 1.016 }, { scale: 1, duration: 0.7, ease: "expo.out", overwrite: "auto" });
  };

  const render = () => {
    const g = w.grid;
    const rm = reduced();
    const lag = rm ? 0 : Math.max(-1, Math.min(1, (tarY - curY - intro.v) / VH));
    /* barrel + lens distortion for grid card corners */
    const warp = (x: number, y: number) => {
      const nx = x / (VW / 2), ny = y / (VH / 2);
      const k = 1 + BOW * intro.bow * (nx * nx + ny * ny);
      let a = x * k, b = y * k;
      if (lens.c > 0.001) {
        const dx = a - cursor.cx, dy = b - cursor.cy, r = LENS_R * PX;
        const s = LENS * lens.c * Math.exp(-(dx * dx + dy * dy) / (r * r));
        a += dx * s;
        b += dy * s;
      }
      return [a, b];
    };
    for (let i = 0; i < items.length; i++) {
      const off = wrapS(i * ROW - curY - intro.v, LOOP);
      const c = Math.max(-CLAMP, Math.min(CLAMP, off));
      const iw = itemW[i];
      const far = Math.min(1, Math.abs(c) / (VH * 0.75));
      // rows far from the centre catch up to a mode switch a little later: the morph ripples
      const k = rm ? 1 : follow(blendRate() * (1.15 - 0.5 * far), frames);
      for (const m of MODES) {
        const t = +(m === mode);
        iw[m] += (t - iw[m]) * k;
        if (Math.abs(t - iw[m]) < 0.001) iw[m] = t;
        else dirty = true;
      }
      const fo = Math.max(0, 1 - Math.min(1, iw.grid * 2.2));
      if (Math.abs(fo - faceOp[i]) > 0.001) {
        faceOp[i] = fo;
        const f = faces[i];
        if (f) f.style.opacity = String(fo);
      }
      const flatY = VH / 2 + c - ROW / 2 + c * lag * 0.12;
      const ang = (c / R) * (1 + Math.abs(lag) * 0.18);
      const wheelX = BULGE + R * (Math.cos(ang) - 1);
      const wheelY = VH / 2 + R * Math.sin(ang) - ROW / 2;
      const r = row(i);
      const gridX = VW / 2 + wrapS(col(i) * PX + stagger(r) - gxCur, GW) - CW / 2 - LEFT;
      const gridY = VH / 2 + wrapS(r * PY - gyCur - intro.g, GH) - CH / 2;
      const x = wheelX * iw.wheel + gridX * iw.grid;
      const y = flatY * iw.flat + wheelY * iw.wheel + gridY * iw.grid;
      const rot = ang * iw.wheel * (180 / Math.PI);
      const vis = Math.abs(ang) > ARC_CUT ? 0 : 1 - Math.min(1, Math.max(0, (Math.abs(ang) - ARC_FULL) / 0.4));
      const op = 1 - iw.wheel * (1 - vis);
      const sh = 1 - SHRINK * Math.min(1, Math.abs(ang) / ARC_SHRINK);
      const sc = 1 - iw.wheel * (1 - sh);
      const el = items[i];
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${sc.toFixed(4)})`;
      el.style.opacity = String(op);
      el.style.visibility = op < 0.02 ? "hidden" : "";
      el.style.pointerEvents = op < 0.02 ? "none" : "";

      const card = cards[i];
      if (!card) continue;
      if (iw.grid > 0.001) {
        const left = gridX + LEFT;
        let seen = (Math.max(0, Math.min(left + CW, VW) - Math.max(left, 0)) / CW) * (Math.max(0, Math.min(gridY + CH, VH) - Math.max(gridY, 0)) / CH);
        seen = seen * seen * (3 - 2 * seen);
        const cx = left + CW / 2 - VW / 2, cy = gridY + CH / 2 - VH / 2;
        const dist = Math.min(1, Math.hypot(cx, cy) / Math.hypot(VW / 2, VH / 2));
        let p = Math.min(1, Math.max(0, (Math.min(iw.grid, intro.p) - dist * 0.5) / 0.5));
        p = p * p * (3 - 2 * p);
        card.style.opacity = String(p * seen);
        const ox = left - VW / 2, oy = gridY - VH / 2, gw = iw.grid;
        const pt = (a: number, b: number) => { const [u, v] = warp(a, b); return [a + (u - a) * gw - ox, b + (v - b) * gw - oy]; };
        const m3 = quad(CW, CH, pt(ox, oy), pt(ox + CW, oy), pt(ox, oy + CH), pt(ox + CW, oy + CH));
        const s = 0.94 + 0.06 * seen;
        card.style.transform = `${m3} translate3d(${((1 - s) * CW) / 2}px, ${((1 - s) * CH) / 2 + (1 - p) * 20}px, 0) scale(${s})`;
        const img = cardImgs[i];
        if (img && !rm) {
          const r2 = LENS_R * PX;
          const px = Math.max(-1, Math.min(1, (cursor.cx - cx) / r2)) * PARALLAX * lens.c;
          const py = Math.max(-1, Math.min(1, (cursor.cy - cy) / r2)) * PARALLAX * lens.c;
          const tx = Math.max(-0.05 * CW, Math.min(0.05 * CW, -cx * 0.05)) + px;
          const ty = Math.max(-0.05 * CH, Math.min(0.05 * CH, -cy * 0.05)) + py;
          img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.12)`;
        }
      } else if (card.style.opacity !== "") {
        card.style.opacity = "";
        card.style.transform = "";
        const img = cardImgs[i];
        if (img) img.style.transform = "";
      }
    }
    root.style.setProperty("--lab-grid-p", g.toFixed(3));
  };

  let dragging = false;
  const tick = (_t: number, dtMs: number) => {
    const fr = Math.min(dtMs, 50) / 16.667;
    frames = fr;
    const ease = reduced() ? 1 : follow(dragging ? 0.078 : 0.09, fr);
    if (vx || vy) {
      const dt = Math.min(dtMs, 100) / 1000;
      if (mode === "grid") { gx += vx * dt; gy += vy * dt; }
      else tarY += vy * dt;
      const decay = Math.exp(-dt / 0.45);
      vx *= decay;
      vy *= decay;
      if (Math.abs(vx) < 15 && Math.abs(vy) < 15) vx = vy = 0;
    }
    // the wheel settles onto a row once input goes quiet
    if (mode === "wheel" && !dragging && !vy && performance.now() - lastInput > 160) {
      const snap = Math.round(tarY / ROW) * ROW;
      tarY += (snap - tarY) * follow(0.12, fr);
      if (Math.abs(snap - tarY) < 0.5) tarY = snap;
    }
    if (mode === "wheel") {
      const gap = Math.abs(tarY - curY);
      const onRow = Math.abs(tarY - Math.round(tarY / ROW) * ROW) < 0.5;
      if (gap > ROW * 0.3 || !onRow) settled = false;
      else if (!settled && gap < 0.6 && !dragging && !vy) { settled = true; settlePulse(); }
    }
    const py = curY, pgx = gxCur, pgy = gyCur;
    curY += (tarY - curY) * ease;
    if (Math.abs(tarY - curY) < 0.05) curY = tarY;
    gxCur += (gx - gxCur) * ease;
    if (Math.abs(gx - gxCur) < 0.05) gxCur = gx;
    gyCur += (gy - gyCur) * ease;
    if (Math.abs(gy - gyCur) < 0.05) gyCur = gy;
    if (w.grid > 0.001 && !reduced()) {
      const ox = cursor.cx, oy = cursor.cy, oc = lens.c;
      cursor.cx += (cursor.x - cursor.cx) * follow(LENS_FOLLOW, fr);
      cursor.cy += (cursor.y - cursor.cy) * follow(LENS_FOLLOW, fr);
      // the lens relaxes while the grid is moving fast
      const calm = 1 / (1 + (Math.abs(gx - gxCur) + Math.abs(gy - gyCur)) / 40);
      lens.c += (lens.t * calm - lens.c) * follow(LENS_FADE, fr);
      if (Math.abs(lens.t * calm - lens.c) < 0.001) lens.c = lens.t * calm;
      if (ox !== cursor.cx || oy !== cursor.cy || oc !== lens.c) dirty = true;
    } else if (lens.c) { lens.c = 0; dirty = true; }
    const k = follow(blendRate(), fr);
    for (const m of MODES) {
      const t = +(m === mode);
      w[m] += (t - w[m]) * k;
      if (Math.abs(t - w[m]) < 0.001) w[m] = t;
      if (w[m] !== t) dirty = true;
    }
    if (curY !== py || gxCur !== pgx || gyCur !== pgy) dirty = true;
    if (!dirty) return;
    dirty = false;
    render();
    if (mode === "wheel") {
      const n = items.length;
      setActive(items[((Math.round(curY / ROW) % n) + n) % n]);
    }
    if (mode !== "grid") placePreview();
  };

  /* input */
  items.forEach((el, i) => {
    el.addEventListener("pointerenter", () => { if (mode === "flat") setActive(el); }, { signal });
    el.addEventListener("focus", () => {
      if (mode === "flat") setActive(el);
      else if (mode === "wheel") { tarY += wrapS(i * ROW - tarY, LOOP); lastInput = performance.now(); }
      else { const r = row(i); gx += wrapS(col(i) * PX + stagger(r) - gx, GW); gy += wrapS(r * PY - gy, GH); lastInput = performance.now(); }
    }, { signal });
  });
  root.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (dragging) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VH : 1;
    vx = vy = 0;
    if (mode === "grid") { gx += e.deltaX * unit; gy += e.deltaY * unit; }
    else tarY += e.deltaY * unit;
    lastInput = performance.now();
  }, { passive: false, signal });

  let moved = false, swallowClick = false;
  let sx = 0, sy = 0, ax = 0, ay = 0, lx = 0, ly = 0, lt = 0, fvx = 0, fvy = 0;
  const release = (fling: boolean) => {
    if (!dragging) return;
    swallowClick = moved;
    dragging = false;
    delete root.dataset.labDragging;
    if (performance.now() - lt > 90 || !fling || !moved || reduced()) return;
    const cap = (v: number) => Math.max(-3500, Math.min(3500, v));
    if (mode === "grid") vx = -cap(fvx);
    vy = -cap(fvy);
    lastInput = performance.now();
  };
  root.addEventListener("pointerdown", (e) => {
    if ((e.pointerType === "mouse" && (mode === "flat" || e.button !== 0)) || (e.target as HTMLElement).closest("[data-lab-mode-toggle]")) return;
    dragging = true;
    moved = false;
    swallowClick = false;
    sx = lx = e.clientX;
    sy = ly = e.clientY;
    lt = performance.now();
    fvx = fvy = 0;
    const coasting = vx !== 0 || vy !== 0;
    vx = vy = 0;
    // grabbing a moving grid stops it where it is (and that grab isn't a click)
    if (mode === "grid" && (coasting || Math.abs(gx - gxCur) + Math.abs(gy - gyCur) > 12)) {
      gx = gxCur; gy = gyCur; moved = true; root.dataset.labDragging = "";
    }
    ax = gx;
    ay = mode === "grid" ? gy : tarY;
  }, { signal });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 6) { moved = true; root.dataset.labDragging = ""; }
    const now = performance.now(), dt = Math.max(1, now - lt), a = Math.min(1, dt / 80);
    fvx = fvx * (1 - a) + ((e.clientX - lx) / dt) * 1000 * a;
    fvy = fvy * (1 - a) + ((e.clientY - ly) / dt) * 1000 * a;
    lx = e.clientX;
    ly = e.clientY;
    lt = now;
    if (mode === "grid") { gx = ax - dx; gy = ay - dy; }
    else tarY = ay - dy;
    lastInput = now;
  }, { signal });
  window.addEventListener("pointerup", () => release(true), { signal });
  window.addEventListener("pointercancel", () => release(false), { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(false); }, { signal });
  root.addEventListener("dragstart", (e) => e.preventDefault(), { signal });

  const goTo = (i: number) => { tarY += wrapS(i * ROW - tarY, LOOP); vy = 0; lastInput = performance.now(); dirty = true; };
  root.addEventListener("click", (e) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; return; }
    if (mode !== "wheel") return;
    const it = (e.target as HTMLElement).closest<HTMLElement>("[data-lab-item]");
    if (!it) return;
    const i = items.indexOf(it);
    // on the wheel, a row off-centre comes to the centre first; the centred row opens
    if (i >= 0 && it !== active) { e.preventDefault(); e.stopPropagation(); goTo(i); }
  }, { capture: true, signal });
  window.addEventListener("keydown", (e) => {
    if (mode === "grid" || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    tarY = Math.round(tarY / ROW) * ROW + (e.key === "ArrowDown" ? ROW : -ROW);
    vy = 0;
    lastInput = performance.now();
    dirty = true;
  }, { signal });

  /* the mode switch */
  const pressSeg = (m: Mode, animate: boolean) => {
    if (!toggle) return;
    const segs = toggle.querySelectorAll("[data-lab-mode-set]");
    const seg = toggle.querySelector(`[data-lab-mode-set="${m}"]`);
    segs.forEach((s) => s.setAttribute("aria-pressed", String(s === seg)));
    if (!seg || !toggleBg || seg.contains(toggleBg)) return;
    if (animate && !reduced()) {
      const state = Flip.getState(toggleBg);
      seg.prepend(toggleBg);
      Flip.from(state, { duration: 0.45, ease: "power3.inOut" });
    } else seg.prepend(toggleBg);
  };
  const setMode = (m: Mode, animate = true) => {
    const was = mode;
    if (m === was) return;
    mode = m;
    root.dataset.labMode = m;
    if (!animate || reduced()) MODES.forEach((k) => { w[k] = +(k === m); itemW.forEach((iw) => (iw[k] = w[k])); });
    if (m === "grid") {
      if (was === "flat") {
        // keep the active row if it's on screen, otherwise the one nearest the centre
        const d = (i: number) => Math.abs(wrapS(i * ROW - curY, LOOP));
        if (d(activeIdx) > VH / 2) {
          let best = activeIdx, bd = Infinity;
          for (let i = 0; i < items.length; i++) { const v = d(i); if (v < bd) { bd = v; best = i; } }
          setActive(items[best]);
        }
      }
      const r = row(activeIdx);
      gx = col(activeIdx) * PX + stagger(r);
      gy = r * PY;
      if (w.grid < 0.02) { gxCur = gx; gyCur = gy; }
    } else if (was === "grid") {
      let best = activeIdx, bd = Infinity;
      for (let i = 0; i < items.length; i++) {
        const r = row(i), dx = wrapS(col(i) * PX + stagger(r) - gxCur, GW), dy = wrapS(r * PY - gyCur, GH), v = dx * dx + dy * dy;
        if (v < bd) { bd = v; best = i; }
      }
      setActive(items[best]);
      tarY += wrapS(best * ROW - tarY, LOOP);
      if (w.flat + w.wheel < 0.02) curY = tarY;
      gsap.set(preview, { y: Math.max(-PV_TOP, Math.min(VH - PV_H - PV_TOP, VH / 2 - PV_H / 2 - PV_TOP)) });
    }
    if (m === "wheel") tarY = Math.round(tarY / ROW) * ROW;
    dragging = false;
    vx = vy = 0;
    delete root.dataset.labDragging;
    dirty = true;
    pressSeg(m, animate);
    try { localStorage.setItem(STORE, m); } catch { /* private mode */ }
  };
  toggle?.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest("[data-lab-mode-set]")?.getAttribute("data-lab-mode-set") ?? "";
    if (MODES.includes(m as Mode)) setMode(m as Mode);
  }, { signal });

  let resizeT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      const atStart = mode === "flat" && curY === tarY && curY === flatStart();
      const oRow = ROW, oPX = PX, oPY = PY;
      measure();
      if (atStart) curY = tarY = flatStart();
      else if (oRow > 0 && ROW !== oRow) { const s = ROW / oRow; curY *= s; tarY *= s; }
      if (oPX > 0 && PX !== oPX) { gxCur *= PX / oPX; gx *= PX / oPX; }
      if (oPY > 0 && PY !== oPY) { gyCur *= PY / oPY; gy *= PY / oPY; }
      dirty = true;
    }, 150);
  }, { signal });

  root.dataset.labEnhanced = "";
  root.dataset.labMode = mode;
  pressSeg(mode, false);
  render();
  setActive(items[mode === "flat" ? 0 : start]);
  placePreview(true);
  gsap.ticker.add(tick);

  if (fine) {
    view.addEventListener("pointermove", (e) => {
      const r = view.getBoundingClientRect();
      cursor.x = e.clientX - r.left - VW / 2;
      cursor.y = e.clientY - r.top - VH / 2;
      lens.t = 1;
    }, { passive: true, signal });
    view.addEventListener("pointerleave", () => (lens.t = 0), { signal });
  }

  /* the intro: rows spin in from below (or the grid drops in, bowed, and flattens) */
  const playIntro = () => {
    if (reduced()) return;
    const mark = () => { dirty = true; };
    if (mode === "grid") {
      intro.g = -PY * 1.5;
      intro.p = 0;
      intro.bow = 2.2;
      gsap.to(intro, { g: 0, duration: 2.4, ease: "expo.out", onUpdate: mark });
      gsap.to(intro, { bow: 1, duration: 2.4, ease: "expo.out", onUpdate: mark });
      gsap.to(intro, { p: 1, duration: 1.5, ease: "power2.out", delay: 0.1, onUpdate: mark });
      return;
    }
    intro.v = -ROW * 4.5;
    gsap.to(intro, { v: 0, duration: 2.4, ease: "expo.out", onUpdate: mark });
  };
  if (document.documentElement.hasAttribute("data-veil")) document.addEventListener("veil:reveal", playIntro, { once: true, signal });
  else playIntro();

  return () => {
    ac.abort();
    clearTimeout(resizeT);
    gsap.ticker.remove(tick);
    gsap.killTweensOf(intro);
    gsap.killTweensOf([preview, previewImg]);
    delete root.dataset.labEnhanced;
  };
}
