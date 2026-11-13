/* The writing shelf: a rank of paper folders, one per post, in a WebGL scene.
   Scroll / drag / arrow keys browse the rank; a folder cracks open when you reach for its notch;
   clicking the front folder opens it — the cover swings, the top sheet dives out of frame and the
   post page slides up in its place. Closing the post drops the page and the sheet rises home. */
import * as THREE from "three";
import gsap from "gsap";
import type { ShelfPost } from "@/content/posts";
import {
  CW, FH, FW, NOTCH_W, NOTCH_Y, PREVIEW_RUN, PREVIEW_X, R_L, R_R, TAB_IN, TAB_Z, TONES,
  bendable, contactShadow, coreColor, coverShape, drawBlank, drawCover, drawFinish, drawPreview, drawSheet,
  drawSpine, extrude, fibreBump, firstSentence, fitToShape, flex, hash, readTokens, resolveFonts, roundedShape,
  sheetColor, smooth, stockColor, studioEnv, type Flex, type Tokens,
} from "./folderArt";

const P = {
  yaw: 68, gap: 0.54, gape: 0, push: 0.3, fScale: 1.15, zLift: 0.36, hLift: 0.05, camZ: 3.1, fill: 0.58,
  shadow: 0.1, bump: 3.5, lead: 80, dive: 0.3, navAt: 0.45, backLead: 0.18, wiggle: 0.6, bBlur: 6, bDim: 0.5,
  bBright: 0.7, damp: 0.06, dragDamp: 0.1, wheel: 0.5556, drag: 2, flick: 140, magnet: 0.055, inject: 0.28,
  calm: 40, press: 0,
};

/** Frame-rate independent ease toward a target. */
const follow = (k: number, frames: number) => 1 - (1 - k) ** frames;
const veilUp = () => document.documentElement.hasAttribute("data-veil");

/** Wheel delta in px, whatever the device reports. */
function wheelPx(e: WheelEvent, page: number) {
  if (e.ctrlKey) return null;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? page : 1;
  return Number.isFinite(d) ? d * unit : 0;
}
/** Rubber band past the ends, and its inverse. */
const band = (x: number, max: number, k: number) => { const c = Math.min(max, Math.max(0, x)), o = x - c; return c + o / (1 + Math.abs(o) / k); };
const unband = (x: number, max: number, k: number) => { const c = Math.min(max, Math.max(0, x)), o = x - c; return c + o / Math.max(0.01, 1 - Math.abs(o) / k); };

/** Release velocity from the last 90ms of pointer samples. */
class Flick {
  s: { x: number; at: number }[] = [];
  reset(x: number, at: number) { this.s = [{ x, at }]; }
  add(x: number, at: number) {
    const last = this.s.at(-1);
    if (last && at <= last.at) return;
    this.s.push({ x, at });
    while (this.s.length > 2 && this.s[1].at < at - 90) this.s.shift();
  }
  read(now: number) {
    const last = this.s.at(-1);
    if (!last || this.s.length < 2 || now - last.at >= 90) return 0;
    const from = Math.max(this.s[0].at, now - 90);
    let x0 = this.s[0].x;
    for (let i = 1; i < this.s.length; i++) {
      const a = this.s[i - 1], b = this.s[i];
      if (b.at >= from) { x0 = a.x + (b.x - a.x) * ((from - a.at) / (b.at - a.at)); break; }
    }
    const dt = now - from;
    if (dt < 8) return 0;
    const v = (last.x - x0) / dt;
    return Math.abs(v) < 0.02 ? 0 : Math.max(-4, Math.min(4, v));
  }
}

type Spring = { x: number; v: number };
/** Damped spring toward a target, substepped; returns how far from rest it is. */
function spring(s: Spring, target: number, k: number, c: number, frames: number) {
  const n = Math.max(1, Math.ceil(frames / 0.5)), h = frames / n;
  for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
  return Math.abs(target - s.x) + Math.abs(s.v);
}

type Folder = {
  group: THREE.Group;
  pivot: THREE.Group;
  coverFlex: Flex;
  paperFlex: Flex[];
  flagFlex: Flex | null;
  finishTex: THREE.CanvasTexture;
  preview: THREE.Mesh;
  previewCanvas: HTMLCanvasElement;
  previewTex: THREE.CanvasTexture;
  sheets: THREE.Mesh[];
  coverTex: THREE.CanvasTexture;
  spineTex: THREE.CanvasTexture;
  sheetTex: THREE.CanvasTexture;
  coverCanvas: HTMLCanvasElement;
  spineCanvas: HTMLCanvasElement;
  sheetCanvas: HTMLCanvasElement;
  stockMats: THREE.MeshPhysicalMaterial[];
  paperMats: THREE.MeshStandardMaterial[];
  shadowMat: THREE.MeshBasicMaterial;
  sticky: THREE.Mesh | null;
  stickyRot: number;
  typeset: boolean;
  disposables: { dispose(): void }[];
};

const blankCanvas = () => { const c = document.createElement("canvas"); c.width = c.height = 1; return c; };

function buildFolder(
  post: ShelfPost, i: number, tk: Tokens,
  coverGeo: THREE.BufferGeometry, coreGeo: THREE.BufferGeometry, sheetGeo: THREE.BufferGeometry,
  flagGeo: THREE.BufferGeometry, shadowGeo: THREE.BufferGeometry, shadowTex: THREE.Texture, blankTex: THREE.Texture,
): Folder {
  const disposables: { dispose(): void }[] = [];
  const group = new THREE.Group();
  const bump = fibreBump(i + 1);
  disposables.push(bump);

  const coverCanvas = blankCanvas();
  const coverTex = new THREE.CanvasTexture(coverCanvas);
  coverTex.colorSpace = THREE.SRGBColorSpace; coverTex.anisotropy = 8;
  fitToShape(coverTex, CW);
  const finishTex = new THREE.CanvasTexture(document.createElement("canvas"));
  fitToShape(finishTex, CW);
  const sheetCanvas = blankCanvas();
  const sheetTex = new THREE.CanvasTexture(sheetCanvas);
  sheetTex.colorSpace = THREE.SRGBColorSpace; sheetTex.anisotropy = 8;
  const spineCanvas = blankCanvas();
  const spineTex = new THREE.CanvasTexture(spineCanvas);
  spineTex.colorSpace = THREE.SRGBColorSpace; spineTex.anisotropy = 8;
  disposables.push(coverTex, finishTex, sheetTex, spineTex);

  const stock = stockColor(tk, i, post);
  const rough = 0.9 + 0.06 * hash(i * 53);
  const sheen = (c: THREE.Color) => c.clone().lerp(new THREE.Color("#ffffff"), 0.5);
  const coverMat = new THREE.MeshPhysicalMaterial({
    map: coverTex, roughness: 1, roughnessMap: finishTex, metalness: 0, sheen: 0.28, sheenRoughness: 0.85,
    sheenColor: sheen(stock), bumpMap: bump, bumpScale: P.bump,
  });
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: coreColor(stock, tk, i, post), roughness: 0.98, metalness: 0, bumpMap: bump, bumpScale: P.bump * 1.6,
  });
  coreMat.userData.core = true;
  const boardMat = new THREE.MeshPhysicalMaterial({
    color: stock.clone(), roughness: rough + 0.02, metalness: 0, sheen: 0.28, sheenRoughness: 0.85,
    sheenColor: sheen(stock), bumpMap: bump, bumpScale: P.bump,
  });
  const spineMat = new THREE.MeshPhysicalMaterial({
    map: spineTex, roughness: rough, metalness: 0, sheen: 0.28, sheenRoughness: 0.85, sheenColor: sheen(stock),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, bumpMap: bump, bumpScale: P.bump,
  });
  disposables.push(coverMat, coreMat, boardMat, spineMat);

  // the back board
  const back = new THREE.Mesh(coreGeo, [boardMat, coreMat]);
  back.castShadow = back.receiveShadow = true;
  back.position.z = -0.0395;
  group.add(back);

  // four sheets: two plain, a filled page, and the post's own first page on top
  const paperMats: THREE.MeshStandardMaterial[] = [];
  const sheets: THREE.Mesh[] = [];
  const paperFlex: Flex[] = [];
  for (let n = 0; n < 4; n++) {
    const top = n === 3;
    const mat = top || n === 2
      ? new THREE.MeshStandardMaterial({ map: top ? sheetTex : blankTex, roughness: 0.96, bumpMap: bump, bumpScale: 0.2 })
      : new THREE.MeshStandardMaterial({ color: sheetColor(tk, i, n), roughness: 0.96, bumpMap: bump, bumpScale: 0.2 });
    mat.side = THREE.DoubleSide;
    paperMats.push(mat);
    disposables.push(mat);
    const f = flex(sheetGeo, FW * 0.97, "paper", i * 7 + n);
    paperFlex.push(f);
    disposables.push(f);
    const m = new THREE.Mesh(f.geometry, mat);
    m.castShadow = m.receiveShadow = true;
    m.position.set((top ? 0.008 : 0.015) * hash(i * 13 + n), 0.009 * (hash(i * 3 + n) - 0.5), -0.0175 + (n / 3) * 0.035);
    m.rotation.z = 0.023 * (hash(i * 5 + n) - 0.5);
    group.add(m);
    sheets.push(m);
  }

  // sometimes a coloured sticky tab sticks out of the folder
  let sticky: THREE.Mesh | null = null;
  let flagFlex: Flex | null = null;
  if (!post.tone && hash(i * 17) < 0.42) {
    const keys = Object.keys(TONES) as (keyof typeof TONES)[];
    const t = keys[Math.floor(hash(i * 23) * keys.length)];
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(TONES[t].dark), roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
    disposables.push(mat);
    flagFlex = flex(flagGeo, 0.15, "flag", i);
    disposables.push(flagFlex);
    const m = new THREE.Mesh(flagFlex.geometry, mat);
    m.castShadow = true;
    sticky = m;
    const where = hash(i * 37), s = hash(i * 29) - 0.5;
    if (where < 0.45) { m.position.set(FW / 2 - 0.026, -0.24 + 0.12 * s, 0); m.rotation.z = -0.05 - 0.07 * hash(i * 31); }
    else if (where < 0.75) { m.position.set(-0.078 + FW * 0.45 * s, FH / 2 - 0.028, 0); m.rotation.z = 0.16 * s; }
    else { m.position.set(-0.039 + FW * 0.4 * s, -0.47, 0); m.rotation.z = 0.14 * s; }
    m.position.z = 0.00275;
    group.add(m);
  }

  // the cover hinges at the spine
  const pivot = new THREE.Group();
  pivot.position.x = -FW / 2;
  const coverFlex = flex(coverGeo, CW, "card", i);
  disposables.push(coverFlex);
  const cover = new THREE.Mesh(coverFlex.geometry, [coverMat, coreMat]);
  cover.castShadow = cover.receiveShadow = true;
  cover.position.x = CW / 2;
  cover.position.z = 0.0275;
  pivot.add(cover);
  pivot.rotation.y = (-P.gape * Math.PI) / 180;
  group.add(pivot);

  // the preview card that slides out of the notch
  const previewCanvas = blankCanvas();
  const previewTex = new THREE.CanvasTexture(previewCanvas);
  previewTex.colorSpace = THREE.SRGBColorSpace; previewTex.anisotropy = 8;
  const previewMat = new THREE.MeshStandardMaterial({ map: previewTex, roughness: 0.96, side: THREE.DoubleSide });
  const plane = new THREE.PlaneGeometry(0.44, 0.3, 12, 8);
  const pf = flex(plane, 0.44, "paper", post.num);
  pf.update(0.012);
  plane.dispose();
  const preview = new THREE.Mesh(pf.geometry, previewMat);
  preview.position.set(PREVIEW_X, NOTCH_Y, 0.0245);
  preview.castShadow = preview.receiveShadow = true;
  preview.visible = false;
  group.add(preview);
  disposables.push(previewTex, previewMat, pf);

  // contact shadow on the floor
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  disposables.push(shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -FH / 2 - 0.025;
  group.add(shadow);

  // the spine strip
  const spine = new THREE.Mesh(new THREE.PlaneGeometry(0.087, FH - 2 * R_R - 0.006), spineMat);
  spine.rotation.y = -Math.PI / 2;
  spine.position.set(-FW / 2, 0, 0);
  disposables.push(spine.geometry);
  group.add(spine);

  return {
    group, pivot, coverFlex, paperFlex, flagFlex, finishTex, preview, previewCanvas, previewTex, sheets, coverTex,
    spineTex, sheetTex, coverCanvas, spineCanvas, sheetCanvas, stockMats: [coverMat, coreMat, boardMat, spineMat],
    paperMats, shadowMat, sticky, stickyRot: sticky?.rotation.z ?? 0, typeset: false, disposables,
  };
}

export type ShelfHooks = {
  navigate: (href: string) => void;
  prefetch: (href: string) => void;
  /** Name printed on each sheet's masthead. */
  name: string;
};

export type ShelfApi = {
  bindStage: (stage: HTMLElement, classic: HTMLElement | null) => () => void;
  toShelf: () => void;
  toBackdrop: (slug: string) => void;
  arrive: (slug: string) => void;
  dispose: () => void;
};

export function createShelf(canvas: HTMLCanvasElement, posts: ShelfPost[], hooks: ShelfHooks): ShelfApi | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  resolveFonts();

  const d = { ...P };
  const disposables: { dispose(): void }[] = [];
  let tk = readTokens();
  let mode: "shelf" | "backdrop" = "shelf";
  let rankTween: gsap.core.Tween | null = null;
  let dimPending = false;

  /* backdrop: the shelf behind a post, dimmed and out of focus */
  const dim = () => {
    if (rankTween) { dimPending = true; canvas.style.opacity = String(d.bDim); return; }
    canvas.style.opacity = String(d.bDim);
    canvas.style.filter = `blur(${d.bBlur}px) brightness(${d.bBright}) saturate(0.9)`;
  };
  const undim = () => {
    dimPending = false;
    canvas.style.opacity = "1";
    canvas.style.filter = "none";
  };

  let idle = 0;
  const invalidate = () => { idle = 0; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const { envRT, pmrem } = studioEnv(renderer);
  scene.environment = envRT.texture;
  disposables.push(envRT, pmrem);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-1.6, 1.9, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5.5, right: 5.5, top: 3, bottom: -3, near: 0.1, far: 12 });
  key.shadow.bias = -4e-4;
  key.shadow.normalBias = 0.003;
  key.shadow.radius = 6;
  key.shadow.intensity = 0.78;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(2.2, -0.6, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-2.4, 2.4, -1.6);
  scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x5a5a56, 0.5);
  scene.add(hemi);
  const light = (theme: Tokens["theme"]) => {
    scene.environmentIntensity = theme === "dark" ? 1.3 : 1.6;
    key.intensity = theme === "dark" ? 1.35 : 1.55;
    fill.intensity = theme === "dark" ? 0.4 : 0.42;
    rim.intensity = theme === "dark" ? 0.55 : 0.45;
    hemi.intensity = theme === "dark" ? 0.55 : 0.6;
    renderer.toneMappingExposure = theme === "dark" ? 1.28 : 1.3;
  };
  light(tk.theme);

  const rank = new THREE.Group();
  scene.add(rank);
  const rawCover = extrude(coverShape());
  const coverGeo = bendable(rawCover);
  rawCover.dispose();
  const coreGeo = extrude(roundedShape(FW, FH, R_L, R_R));
  const sheetGeo = new THREE.PlaneGeometry(FW * 0.97, FH * 0.95, 14, 18);
  const flagGeo = new THREE.PlaneGeometry(0.15, 0.15, 10, 4);
  const shadowGeo = new THREE.PlaneGeometry(FW * 1.9, 0.64);
  const shadowTex = contactShadow();
  const blankCv = document.createElement("canvas");
  drawBlank(blankCv, tk);
  const blankTex = new THREE.CanvasTexture(blankCv);
  blankTex.colorSpace = THREE.SRGBColorSpace; blankTex.anisotropy = 8;
  disposables.push(coverGeo, coreGeo, sheetGeo, flagGeo, shadowGeo, shadowTex, blankTex);

  const G = posts.map((p, i) => {
    const f = buildFolder(p, i, tk, coverGeo, coreGeo, sheetGeo, flagGeo, shadowGeo, shadowTex, blankTex);
    rank.add(f.group);
    disposables.push(...f.disposables);
    return f;
  });

  /* typesetting is lazy: only folders near the front carry their canvases */
  const typeset = (i: number) => {
    const f = G[i];
    drawCover(f.coverCanvas, posts[i], tk, i);
    drawFinish(f.coverCanvas, f.finishTex);
    drawPreview(f.previewCanvas, posts[i], tk);
    f.preview.scale.y = (0.44 * f.previewCanvas.height) / f.previewCanvas.width / 0.3;
    drawSpine(f.spineCanvas, posts[i], tk, i);
    drawSheet(f.sheetCanvas, posts[i], tk, i, hooks.name);
    f.coverTex.needsUpdate = f.spineTex.needsUpdate = f.sheetTex.needsUpdate = f.previewTex.needsUpdate = true;
    f.typeset = true;
  };
  const untypeset = (i: number) => {
    const f = G[i];
    for (const c of [f.coverCanvas, f.spineCanvas, f.sheetCanvas, f.previewCanvas, f.finishTex.image as HTMLCanvasElement]) { c.width = 1; c.height = 1; }
    f.coverTex.needsUpdate = f.spineTex.needsUpdate = f.sheetTex.needsUpdate = f.finishTex.needsUpdate = f.previewTex.needsUpdate = true;
    f.typeset = false;
  };
  let typesetAt = -1;
  const typesetAround = (c: number, force = false) => {
    if (c === typesetAt && !force) return;
    typesetAt = c;
    for (let i = 0; i < G.length; i++) {
      const n = Math.abs(i - c);
      if (n <= 8) { if (!G[i].typeset) typeset(i); }
      else if (n > 11 && G[i].typeset) untypeset(i);
    }
    invalidate();
  };
  const retypeset = () => { G.forEach((f) => { f.typeset = false; }); typesetAround(typesetAt < 0 ? 0 : typesetAt, true); };
  typesetAround(0);
  document.fonts.ready.then(() => { if (!disposed) { resolveFonts(); retypeset(); } }).catch(() => {});

  /* the rank */
  let cur = 0, tar = 0, inject = 0, lastInput = -1e4, settled = true;
  const intro = { v: 0 };
  const maxRank = () => (posts.length - 1) * d.gap;
  let pxToWorld = 0.003;

  const resize = () => {
    if (!innerWidth || !innerHeight) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    const viewH = (FH * d.fScale) / d.fill;
    let z = viewH / 2 / Math.tan((camera.fov * Math.PI) / 360) + d.zLift;
    const viewW = viewH * camera.aspect;
    if (FW * d.fScale > viewW * 0.72) z *= (FW * d.fScale) / (viewW * 0.72);
    camera.position.set(0, 0.02, Math.max(z, d.camZ));
    camera.updateProjectionMatrix();
    pxToWorld = viewH / innerHeight;
    invalidate();
  };
  resize();
  window.addEventListener("resize", resize);

  /* the stage UI: the info button and its tooltip follow the front folder */
  type Stage = {
    stage: HTMLElement; titleEl: HTMLAnchorElement | null; tipTitleEl: HTMLElement | null; excerptEl: HTMLElement | null;
    chipDate: HTMLElement | null; chipYear: HTMLElement | null; chipCat: HTMLElement | null;
  };
  let F: Stage | null = null;
  let labelAt = -1;
  const label = (i: number, force = false) => {
    if ((i === labelAt && !force) || !F) return;
    labelAt = i;
    const p = posts[i];
    if (F.titleEl) { F.titleEl.href = p.href; F.titleEl.setAttribute("aria-label", `Open “${p.title}”`); }
    if (F.tipTitleEl) F.tipTitleEl.textContent = p.title;
    if (F.excerptEl) F.excerptEl.textContent = firstSentence(p);
    const parts = p.date.split(" ");
    if (F.chipDate) F.chipDate.textContent = parts.slice(0, 2).join(" ");
    if (F.chipYear) F.chipYear.textContent = parts[2] ?? "";
    if (F.chipCat) F.chipCat.textContent = p.cat;
  };

  /* the intro: folders rise in from below as the rank slides into place */
  const rise = G.map(() => ({ v: 0 }));
  let introStarted = false;
  const playIntro = () => {
    if (introStarted) return;
    introStarted = true;
    gsap.to(rise, { v: 1, duration: 1.8, ease: "expo.out", stagger: 0.05, onUpdate: invalidate });
    intro.v = -d.gap * 1.4;
    gsap.to(intro, { v: 0, duration: 2.2, ease: "expo.out", onUpdate: invalidate });
  };

  type Open = { cur: number; tar: number; peek: number; paper: number; returned: boolean; bases: { x: number; y: number; z: number; r: number }[] };
  const open: Open[] = G.map((f) => ({
    cur: 0, tar: 0, peek: 0, paper: 0, returned: false,
    bases: f.sheets.map((s) => ({ x: s.position.x, y: s.position.y, z: s.position.z, r: s.rotation.z })),
  }));
  const spread = [0, 0.1, 0.32, 1];
  let opening = -1;
  let backdropIdx = -1;
  const indexOf = (slug: string) => (slug ? posts.findIndex((p) => p.href.endsWith(`/${slug}`)) : -1);
  const topSheet = (i: number) => G[i].sheets[G[i].sheets.length - 1];

  /** Move the rank to a position, gliding when it's a short hop. */
  const jumpTo = (x: number, animate: boolean) => {
    rankTween?.kill();
    rankTween = null;
    tar = x;
    if (!animate || Math.abs(cur - x) < 0.002 || Math.abs(cur - x) > d.gap) { cur = x; return; }
    const o = { v: cur };
    rankTween = gsap.to(o, {
      v: x, duration: 0.4, ease: "expo.out",
      onUpdate: () => { cur = o.v; invalidate(); },
      onComplete: () => {
        cur = x; rankTween = null; invalidate();
        if (dimPending && mode === "backdrop" && !gsap.isTweening(dive)) { dimPending = false; dim(); }
      },
    });
  };

  let stageBound = false;
  const enterBackdrop = (idx: number) => {
    const animate = stageBound;
    stageBound = false;
    mode = "backdrop";
    inject = 0;
    introStarted = true;
    rise.forEach((r) => (r.v = 1));
    backdropIdx = idx;
    if (idx !== -1) {
      jumpTo(idx * d.gap, animate);
      opening = idx;
      topSheet(idx).visible = false;
    }
    invalidate();
  };

  let closing = false;
  const dive = { v: 0, idx: -1 };
  const fadeIn = (els: HTMLElement[]) => {
    if (els.length) gsap.fromTo(els, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 0.55, ease: "expo.out", stagger: 0.08, clearProps: "opacity,transform" });
  };

  /* arriving on a post: its paper slides up out of the folder */
  type Relay = { col: HTMLElement; waits: HTMLElement[]; tl: gsap.core.Tween | null; watchdog: number; settled: boolean; chromeIn: boolean };
  let relay: Relay | null = null;
  const endRelay = (ok = false) => {
    if (!relay || relay.settled) return;
    relay.settled = true;
    const r = relay;
    relay = null;
    clearTimeout(r.watchdog);
    r.tl?.kill();
    gsap.killTweensOf(r.col);
    r.col.style.transform = "";
    r.col.style.willChange = "";
    document.documentElement.style.overflow = "";
    if (ok && !r.chromeIn) fadeIn(r.waits);
    else if (!ok) r.waits.forEach((e) => (e.style.opacity = ""));
    dim();
  };

  /** Return the dived sheet to its folder, then let the cover fall shut. */
  const sheetHome = (delay: number) => {
    const t = dive.idx;
    opening = t;
    gsap.killTweensOf(dive);
    gsap.to(dive, {
      v: 0, duration: 0.62, ease: "expo.out", delay, onUpdate: invalidate,
      onComplete: () => {
        if (dive.idx !== t) return;
        dive.idx = -1;
        opening = -1;
        if (open[t]) open[t].returned = true;
        closing = false;
        invalidate();
      },
    });
  };

  /* closing a post: the page drops away while its sheet rises back into the folder */
  const closePost = () => {
    const paper = document.querySelector<HTMLElement>("[data-flight-paper]");
    if (!paper || backdropIdx < 0) { hooks.navigate("/writing"); return; }
    closing = true;
    gsap.killTweensOf(dive);
    const waits = [...document.querySelectorAll<HTMLElement>("[data-flight-wait]")];
    if (waits.length) gsap.to(waits, { opacity: 0, y: 16, duration: 0.2, ease: "expo.out", stagger: 0.03 });
    undim();
    topSheet(backdropIdx).visible = true;
    dive.v = 1;
    dive.idx = backdropIdx;
    sheetHome(d.backLead);
    gsap.to(paper, {
      y: () => innerHeight + 80, duration: 0.55, delay: 0.1, ease: "power2.in",
      onComplete: () => hooks.navigate("/writing"),
    });
    window.setTimeout(() => { if (closing && location.pathname !== "/writing") hooks.navigate("/writing"); }, 2500);
  };
  const onDocClick = (e: MouseEvent) => {
    if (mode !== "backdrop" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!(e.target as HTMLElement).closest?.('a[href="/writing"]')) return;
    e.preventDefault();
    if (!(closing || veilUp())) closePost();
  };
  document.addEventListener("click", onDocClick, true);

  // warm the posts in the background
  {
    const later = "requestIdleCallback" in window
      ? (f: () => void) => requestIdleCallback(() => f(), { timeout: 3000 })
      : (f: () => void) => void window.setTimeout(f, 400);
    const queue = posts.map((p) => p.href);
    const next = () => { const h = queue.shift(); if (h && !disposed) { hooks.prefetch(h); later(next); } };
    later(next);
  }

  /* theme switches recolour the stock and retypeset */
  let theme = document.documentElement.getAttribute("data-theme");
  const themeObs = new MutationObserver(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === null || t === theme) return;
    theme = t;
    tk = readTokens();
    light(tk.theme);
    G.forEach((f, n) => {
      const c = stockColor(tk, n, posts[n]);
      f.stockMats.forEach((m) => {
        if (!m.map) m.color.copy(m.userData.core ? coreColor(c, tk, n, posts[n]) : c);
        m.sheenColor.copy(c).lerp(new THREE.Color("#ffffff"), 0.5);
      });
      f.paperMats.forEach((m, k) => { if (!m.map) m.color.copy(sheetColor(tk, n, k)); });
    });
    retypeset();
    drawBlank(blankCv, tk);
    blankTex.needsUpdate = true;
    invalidate();
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* pointer state */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverIdx = -1;
  const hoverMix = G.map(() => 0);
  let dragging = false, dragMoved = false, pointerMoved = false;
  let px = 0, py = 0;
  let mouse = false, focusPeek = false, peekTarget = 0, overPreview = false;
  const notch = new THREE.Vector3();

  /** 0..1: how close the pointer is to the front folder's notch. */
  const reach = (i: number) => {
    const g = G[i].group;
    g.updateWorldMatrix(true, false);
    notch.set(FW / 2 - TAB_IN - NOTCH_W * 0.55, NOTCH_Y, TAB_Z / 2);
    g.localToWorld(notch).project(camera);
    const sx = ((notch.x + 1) * innerWidth) / 2, sy = ((1 - notch.y) * innerHeight) / 2;
    const r = Math.max(38, Math.min(76, innerHeight * d.fill * 0.16));
    const dist = Math.hypot((px - sx) / (r * 1.1), (py - sy) / r);
    return 1 - smooth(Math.min(1, Math.max(0, (dist - 0.22) / 0.78)));
  };
  const pick = (x: number, y: number) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(rank.children, true);
    overPreview = !!hits[0] && G.some((f) => hits[0].object === f.preview);
    if (!hits.length) return -1;
    let o: THREE.Object3D | null = hits[0].object;
    while (o) {
      const i = G.findIndex((f) => f.group === o);
      if (i !== -1) return i;
      o = o.parent;
    }
    return -1;
  };
  const slack = () => d.gap * 0.45;
  const clampTar = () => { tar = Math.min(maxRank(), Math.max(0, tar)); };
  const snapTar = () => { tar = Math.min(maxRank(), Math.max(0, Math.round(tar / d.gap) * d.gap)); };

  /** Open a folder: the cover swings, then the top sheet dives and the post loads. */
  const openFolder = (t: number) => {
    if (veilUp() || gsap.isTweening(dive)) return;
    focusPeek = false;
    open[t].returned = false;
    opening = t;
    invalidate();
    const href = posts[t].href;
    hooks.prefetch(href);
    dive.v = 0;
    dive.idx = t;
    let sent = false;
    gsap.to(dive, {
      v: 1, duration: d.dive, ease: "power2.in", delay: d.lead / 1000,
      onUpdate: () => {
        invalidate();
        if (!sent && dive.v >= d.navAt && !veilUp()) { sent = true; hooks.navigate(href); }
      },
      onComplete: () => {
        if (sent) topSheet(t).visible = false;
        dive.v = 0;
        dive.idx = -1;
        invalidate();
        if (dimPending && mode === "backdrop" && !rankTween) { dimPending = false; dim(); }
      },
    });
  };
  const clickAt = (x: number, y: number) => {
    const i = pick(x, y);
    if (i === -1) return;
    if (Math.abs(i * d.gap - cur) < d.gap * 0.35) openFolder(i);
    else { inject = 0; tar = i * d.gap; lastInput = performance.now(); }
  };

  const wig = G.map((_, i) => ({
    lean: { x: 0, v: 0 }, slop: { x: 0, v: 0 }, flap: { x: 0, v: 0 }, press: { x: 0, v: 0 },
    kj: 0.82 + 0.36 * hash(i * 41), openPrev: 0,
  }));
  let prevCur = cur;
  const yaw = () => (d.yaw * Math.PI) / 180;
  const gape = (P.gape * Math.PI) / 180;
  let ready = false;
  let disposed = false;

  const frame = (_t: number, dtMs = 16.667) => {
    const r = Math.min(dtMs, 50) / 16.667;
    let busy = false;
    // the wheel buffer feeds the target as a ramp, so a notched mouse doesn't step
    if (Math.abs(inject) > 2e-5) { const e = inject * follow(d.inject, r); tar += e; inject -= e; clampTar(); }
    else inject = 0;
    const quiet = performance.now() - lastInput;
    if (!dragging && Math.abs(inject) < 5e-4 && quiet > 90) {
      const home = Math.min(maxRank(), Math.max(0, Math.round(tar / d.gap) * d.gap));
      const k = Math.min(1, (quiet - 90) / 400);
      tar += (home - tar) * follow(d.magnet * k, r);
      if (Math.abs(home - tar) < 3e-4) tar = home;
    }
    cur += (tar - cur) * follow(dragging ? d.dragDamp : d.damp, r);
    if (Math.abs(tar - cur) < 5e-4) cur = tar;
    const vel = r > 0 ? (cur - prevCur) / r : 0;
    prevCur = cur;
    const sway = Math.tanh(vel * 5) * d.wiggle;
    const calm = 1 / (1 + Math.abs(vel) * d.calm);
    const station = Math.min(maxRank(), Math.max(0, Math.round(tar / d.gap) * d.gap));
    if (!(Math.abs(tar - station) < 5e-4) || Math.abs(tar - cur) > d.gap * 0.25) settled = false;
    else if (!settled && Math.abs(tar - cur) < 0.003 && !dragging) {
      settled = true;
      const i = Math.round(tar / d.gap);
      if (wig[i]) wig[i].press.v -= 0.014 * d.press;
    }
    if (Math.abs(intro.v) > 4e-4) busy = true;
    if (F && mouse && !dragging && (pointerMoved || Math.abs(vel) > 0.001)) {
      pointerMoved = false;
      const i = pick(px, py);
      if (i !== hoverIdx) { hoverIdx = i; F.stage.classList.toggle("is-hover", i !== -1); invalidate(); }
    }
    const front = Math.min(posts.length - 1, Math.max(0, Math.round(cur / d.gap)));
    peekTarget = F && innerWidth >= 640 && !dragging && opening === -1 && !open[front].returned
      ? focusPeek ? 1
        : mouse && Math.abs(front * d.gap - cur) < d.gap * 0.15
          ? Math.max(reach(front), overPreview && hoverIdx === front ? 1 : 0) * calm
          : 0
      : 0;
    const focus = smooth(Math.max(0, 1 - Math.abs(front * d.gap - cur) / (d.gap * 0.9)));
    if (F) label(front);
    typesetAround(front);
    let moving = busy || Math.abs(tar - cur) > 4e-4 || Math.abs(inject) > 2e-5;

    G.forEach((f, n) => {
      const off = n * d.gap - cur - intro.v;
      const a = smooth(Math.max(0, 1 - Math.abs(off) / (d.gap * 0.9)));
      const hov = F && n === hoverIdx && n !== front ? calm : 0;
      hoverMix[n] += (hov - hoverMix[n]) * follow(0.12, r);
      if (Math.abs(hov - hoverMix[n]) > 0.001) moving = true;
      if (rise[n].v < 1) moving = true;

      const o = open[n];
      const pk = n === front && firstSentence(posts[n]) ? peekTarget : 0;
      o.peek += (pk - o.peek) * follow(pk > o.peek ? 0.13 : 0.11, r);
      if (Math.abs(pk - o.peek) < 5e-4) o.peek = pk;
      if (Math.abs(pk - o.peek) > 0.001) moving = true;
      o.tar = n === opening ? 1 : o.returned ? 0 : Math.max(o.peek * 0.38, F && !dragging && n === hoverIdx && n === front ? 0.12 * calm : 0);
      o.cur += (o.tar - o.cur) * follow(o.tar === 1 ? 0.16 : 0.09, r);
      if (Math.abs(o.tar - o.cur) > 0.001) moving = true;
      f.pivot.rotation.y = -(gape + (0.95 - gape) * o.cur);
      const pt = o.tar === 0 ? 0 : smooth(Math.max(0, (o.cur - 0.08) / 0.92));
      o.paper += (pt - o.paper) * follow(o.tar === 0 ? 0.24 : 0.16, r);
      if (Math.abs(pt - o.paper) > 0.001) moving = true;

      // secondary motion: the folder leans, the sheets slop, the cover flaps
      const w = wig[n];
      const kick = (o.cur - w.openPrev) * d.wiggle;
      if (o.returned && w.openPrev > 0.025 && o.cur <= 0.025) { w.flap.v += 0.028 * d.wiggle; w.press.v -= 0.002 * d.press; }
      w.openPrev = o.cur;
      w.slop.v += kick * 0.05;
      w.flap.v += kick * 0.1;
      let rest = spring(w.lean, -sway * 0.05, 0.12 * w.kj, 0.38, r);
      rest += spring(w.slop, -sway, 0.2 * w.kj, 0.5, r);
      rest += spring(w.flap, -sway, 0.16 / w.kj, 0.16, r);
      rest += spring(w.press, 0, 0.18, 0.45, r);
      if (rest > 0.004) moving = true;

      f.coverFlex.update(0.003 + 0.03 * Math.sin(o.cur * Math.PI) + o.peek * 0.023);
      const fan = Math.sqrt(o.paper);
      f.sheets.forEach((s, k) => {
        const b = o.bases[k], wt = spread[k] ?? 0, sl = w.slop.x * wt;
        s.position.x = b.x + 0.18 * fan * wt + 0.02 * sl;
        s.position.y = b.y + 0.17 * o.paper * wt;
        s.position.z = b.z + 0.08 * o.paper * wt;
        s.rotation.z = b.r - 0.05 * o.paper * wt + 0.018 * sl;
        const top = k === f.sheets.length - 1;
        const flat = top ? 1 - smooth(Math.min(1, o.cur / 0.65)) : 1;
        f.paperFlex[k].update((0.005 + k * 0.002 + hash(n * 11 + k) * 0.005 + Math.abs(sl) * 0.01) * flat);
        if (n === dive.idx && top) s.position.y += dive.v * -2.6;
      });
      if (f.sticky) {
        f.sticky.rotation.z = f.stickyRot + w.flap.x * 0.14;
        f.flagFlex?.update(0.009 + w.flap.x * 0.035);
      }
      f.preview.visible = o.peek > 0;
      f.preview.position.x = PREVIEW_X + o.peek * PREVIEW_RUN;
      f.preview.position.y = NOTCH_Y + o.peek * 0.015;
      f.preview.position.z = f.sheets[f.sheets.length - 1].position.z + 0.012;
      f.preview.rotation.z = -0.028 * o.peek;

      // place it in the rank: the front folder faces you, the rest stand yawed like files in a drawer
      const shove = Math.sign(off) * (d.push + open[front].peek * 0.17) * focus * (1 - a);
      const g = f.group;
      g.visible = Math.abs(off) < d.gap * 8;
      if (!g.visible) return;
      g.position.x = off + shove;
      g.position.z = d.zLift * a + 0.05 * hoverMix[n];
      g.position.y = (1 - rise[n].v) * -1.7 + d.hLift * hoverMix[n];
      const toward = Math.atan2(g.position.x, camera.position.z);
      g.rotation.y = (yaw() - toward) * (1 - a) - 0.1 * hoverMix[n];
      g.rotation.z = w.lean.x;
      g.scale.setScalar((1 + (d.fScale - 1) * a) * (1 + w.press.x));
      f.shadowMat.opacity = d.shadow * (tk.theme === "dark" ? 1.6 : 1) * rise[n].v * (1 - 0.35 * hoverMix[n]) * (1 - 4 * w.press.x);
    });
    if (F) F.stage.style.cursor = dragging && dragMoved ? "grabbing" : hoverIdx === -1 ? "grab" : "pointer";
    if (moving) idle = 0; else idle++;
    if (idle < 8 && ready) renderer.render(scene, camera);
  };

  // compile shaders before the first frame so the intro doesn't hitch
  const warm = Promise.race([renderer.compileAsync(scene, camera).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  warm.then(() => { ready = true; invalidate(); });
  gsap.ticker.add(frame);

  return {
    bindStage(stage, classic) {
      stageBound = true;
      stage.hidden = false;
      if (classic) classic.hidden = true;
      const titleEl = stage.querySelector<HTMLAnchorElement>("[data-folders-title]");
      const q = (s: string) => stage.querySelector<HTMLElement>(s);
      F = {
        stage, titleEl, tipTitleEl: q("[data-folders-tip-title]"), excerptEl: q("[data-folders-excerpt]"),
        chipDate: q("[data-folders-chip-date]"), chipYear: q("[data-folders-chip-year]"), chipCat: q("[data-folders-chip-cat]"),
      };
      stage.style.setProperty("--wfill", String(d.fill));
      label(Math.round(cur / d.gap), true);
      const ac = new AbortController();
      const { signal } = ac;
      if (!introStarted) {
        if (veilUp()) document.addEventListener("veil:reveal", playIntro, { once: true, signal });
        else playIntro();
      }

      let travel = 0, lx = 0, ly = 0, held = 0, pid: number | null = null;
      const flick = new Flick();
      stage.addEventListener("wheel", (e) => {
        const t = wheelPx(e, innerHeight);
        if (t === null || t === 0) return;
        e.preventDefault();
        if (!dragging) { inject += t * d.wheel * pxToWorld; lastInput = performance.now(); invalidate(); }
      }, { passive: false, signal });
      stage.addEventListener("pointerdown", (e) => {
        if (!e.isPrimary || e.button !== 0 || pid !== null || (e.target as HTMLElement).closest("a, button")) return;
        pid = e.pointerId;
        focusPeek = false;
        mouse = e.pointerType !== "touch";
        px = e.clientX; py = e.clientY;
        dragging = true; dragMoved = false; travel = 0;
        tar = cur;
        held = unband(cur, maxRank(), slack());
        inject = 0;
        lastInput = performance.now();
        lx = e.clientX; ly = e.clientY;
        flick.reset(e.clientX, performance.now());
        stage.classList.add("is-dragging");
        stage.setPointerCapture(e.pointerId);
      }, { signal });
      stage.addEventListener("pointermove", (e) => {
        if (!e.isPrimary || (pid !== null && e.pointerId !== pid)) return;
        mouse = e.pointerType !== "touch";
        px = e.clientX; py = e.clientY;
        pointerMoved = true;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) { focusPeek = false; open.forEach((o) => { o.returned = false; }); }
        invalidate();
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly, now = performance.now();
        flick.add(e.clientX, now);
        lx = e.clientX; ly = e.clientY;
        travel += Math.hypot(dx, dy);
        if (travel >= 6) dragMoved = true;
        held -= dx * d.drag * pxToWorld;
        tar = band(held, maxRank(), slack());
        lastInput = performance.now();
      }, { signal });
      const end = (e: PointerEvent) => {
        if (!dragging || e.pointerId !== pid) return;
        pid = null;
        dragging = false; dragMoved = false;
        if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
        stage.classList.remove("is-dragging");
        if (travel < 6) clickAt(e.clientX, e.clientY);
        else { tar -= flick.read(performance.now()) * d.flick * pxToWorld; clampTar(); lastInput = performance.now(); }
        pointerMoved = true;
        invalidate();
      };
      const cancel = (e: PointerEvent) => {
        if (e.pointerId !== pid) return;
        pid = null;
        dragging = dragMoved = false;
        stage.classList.remove("is-dragging");
        if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
        mouse = false; hoverIdx = -1;
        clampTar();
        lastInput = performance.now();
        invalidate();
      };
      stage.addEventListener("pointerup", end, { signal });
      stage.addEventListener("pointercancel", cancel, { signal });
      stage.addEventListener("lostpointercapture", cancel, { signal });
      stage.addEventListener("pointerleave", () => { mouse = false; hoverIdx = -1; stage.classList.remove("is-hover"); invalidate(); }, { signal });
      stage.addEventListener("keydown", (e) => {
        if (dragging || (e.key === "Enter" && e.target !== stage)) return;
        focusPeek = false;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); inject = 0; tar += e.key === "ArrowRight" ? d.gap : -d.gap; clampTar(); snapTar(); }
        else if (e.key === "Home") { e.preventDefault(); tar = 0; }
        else if (e.key === "End") { e.preventDefault(); tar = maxRank(); }
        else if (e.key === "Enter") { e.preventDefault(); openFolder(labelAt); return; }
        else return;
        cur = prevCur = tar;
        inject = 0;
        open.forEach((o) => { o.peek = o.cur = o.paper = 0; o.returned = false; });
        label(Math.round(cur / d.gap), true);
        invalidate();
      }, { signal });
      titleEl?.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openFolder(labelAt);
      }, { signal });
      titleEl?.addEventListener("focus", () => {
        if (!titleEl.matches(":focus-visible")) return;
        focusPeek = true;
        const o = open[labelAt];
        o.returned = false;
        o.peek = +(innerWidth >= 640);
        o.cur = innerWidth >= 640 ? 0.38 : 0;
        invalidate();
      }, { signal });
      titleEl?.addEventListener("blur", () => {
        if (!focusPeek) return;
        const o = open[labelAt];
        o.peek = o.cur = o.paper = 0;
        focusPeek = false;
        invalidate();
      }, { signal });

      return () => {
        ac.abort();
        if (F?.stage === stage) F = null;
        hoverIdx = -1;
        dragging = false;
        mouse = focusPeek = false;
      };
    },

    toShelf() {
      mode = "shelf";
      if (dive.idx === -1) opening = -1;
      else if (gsap.isTweening(dive)) opening = dive.idx;
      else sheetHome(0.04);
      G.forEach((_, i) => { topSheet(i).visible = true; });
      backdropIdx = -1;
      undim();
      invalidate();
    },

    toBackdrop(slug) {
      enterBackdrop(indexOf(slug));
      dim();
    },

    arrive(slug) {
      const t = indexOf(slug);
      const diving = t !== -1 && gsap.isTweening(dive) && dive.idx === t;
      enterBackdrop(t);
      if (diving) topSheet(t).visible = true;
      else { dive.idx = -1; dive.v = 0; }
      const col = document.querySelector<HTMLElement>("[data-flight-paper]");
      if (!col) { dim(); return; }
      const waits = [...document.querySelectorAll<HTMLElement>("[data-flight-wait]")];
      waits.forEach((e) => (e.style.opacity = "0"));
      col.style.transform = `translateY(${innerHeight + 80}px)`;
      col.style.willChange = "transform";
      document.documentElement.style.overflow = "clip";
      relay = { col, waits, tl: null, watchdog: window.setTimeout(() => endRelay(false), 3500), settled: false, chromeIn: false };
      gsap.delayedCall(0.38, () => { if (relay && !relay.settled && !relay.chromeIn) { relay.chromeIn = true; fadeIn(relay.waits); } });
      if (diving) { dimPending = true; canvas.style.opacity = String(d.bDim); }
      else dim();
      relay.tl = gsap.to(col, { y: 0, duration: 0.9, ease: "expo.out", clearProps: "transform", onComplete: () => endRelay(true) });
    },

    dispose() {
      disposed = true;
      endRelay(false);
      gsap.killTweensOf(dive);
      gsap.killTweensOf(rise);
      gsap.killTweensOf(intro);
      rankTween?.kill();
      document.removeEventListener("click", onDocClick, true);
      gsap.ticker.remove(frame);
      window.removeEventListener("resize", resize);
      themeObs.disconnect();
      disposables.forEach((x) => x.dispose());
      canvas.style.opacity = "0";
      canvas.style.filter = "none";
      renderer.dispose();
    },
  };
}
