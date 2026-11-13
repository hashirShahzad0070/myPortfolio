"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { site } from "@/content/site";
import { CARD_H, CARD_W, drawBack, drawFront, drawStrap, drawStudioEnv, drawWeaveBump, loadMark, loadPhoto, type BadgeInfo } from "./badgeArt";

/* ==========================================================================
   A studio pass on a lanyard. Verlet physics at 120Hz: the badge is six
   particles held rigid; the strap is a rope with stretch + bend links.
   Grab and throw it, brush the strap with the cursor, click to flip it.
   ========================================================================== */

const CARD_WW = 2.5, CARD_HH = 3.5, CARD_T = 0.03;
const HOLDER_D = 0.09, HOLDER_R = 0.2, TAB_W = 0.62, TAB_PAD = 0.3, TAB_HOLE = 0.075;
const CLIP = 0.72, STRAP_W = 0.46, PLATE = 1.02, FOV = 28;
const PLATE_POS = new THREE.Vector2(0, 0.62);
const CLASP_Y = 2.02;
const SEGMENTS = 56;

const P = {
  gravity: 34, damp: 0.988, vmax: 0.14, follow: 0.2, hold: 0.55, stretch: 0.9, throw: 0.45, breeze: 0.0012,
  nudge: 0.01, nudgeEvery: 8, flip: 0.012, brake: 0.5, tilt: 0.16, band: 1.2, shake: 0.001, shakeAt: 9,
  lift: 4.4, lower: 1.1, catch: 0.022, iters: 10, bend: 0.35, push: 0.22, key: 2.1, face: 0.0032, faceHeld: 0.4,
  restY: -0.42, seg: 0.22,
};

type Pt = { x: number; y: number; z: number; px: number; py: number; pz: number; w: number };
type Link = { a: Pt; b: Pt; d: number; k: number };
const pt = (x: number, y: number, z: number, w = 1): Pt => ({ x, y, z, px: x, py: y, pz: z, w });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const link = (a: Pt, b: Pt, k = 1): Link => ({ a, b, d: dist(a, b), k });
const solve = (l: Link) => {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, dz = l.b.z - l.a.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6, wsum = l.a.w + l.b.w;
  if (!wsum) return;
  const f = ((len - l.d) / len) * l.k, fa = (f * l.a.w) / wsum, fb = (f * l.b.w) / wsum;
  l.a.x += dx * fa; l.a.y += dy * fa; l.a.z += dz * fa;
  l.b.x -= dx * fb; l.b.y -= dy * fb; l.b.z -= dz * fb;
};
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const roundRect = <T extends THREE.Path>(p: T, w: number, h: number, r: number) => {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
};
const shape = (w: number, h: number, r: number) => roundRect(new THREE.Shape(), w, h, r);

export function Lanyard() {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(!matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!live) return;
    const stage = stageRef.current!, canvas = canvasRef.current!;
    const info: BadgeInfo = {
      name: site.name, role: site.studio.role, studio: site.studio.name, line: site.studio.line,
      addr: site.studio.addr, place: site.studio.place, year: site.studio.year,
    };

    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch {
      // no WebGL: fall back to the static tile
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLive(false);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const disposables: { dispose(): void }[] = [];
    const own = <T extends { dispose(): void }>(d: T) => { disposables.push(d); return d; };

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const pmrem = own(new THREE.PMREMGenerator(renderer));
    {
      const envTex = new THREE.CanvasTexture(drawStudioEnv());
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.colorSpace = THREE.SRGBColorSpace;
      const rt = own(pmrem.fromEquirectangular(envTex));
      envTex.dispose();
      scene.environment = rt.texture;
    }
    const key = new THREE.DirectionalLight(0xffffff, P.key);
    key.position.set(-3, 4, 5);
    key.castShadow = true;
    const small = matchMedia("(max-width: 47.99rem), (pointer: coarse)").matches;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -5.5, bottom: -5.5, right: 5.5, top: 5.5, near: 0.5, far: 20 });
    key.shadow.bias = -5e-4;
    key.shadow.normalBias = 0.01;
    key.shadow.radius = 1.8;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(3, 1, 4);
    scene.add(fill);

    /* ---------- materials ---------- */
    const clipMetal = own(new THREE.MeshStandardMaterial({ color: 0x2b2c2f, metalness: 0.9, roughness: 0.34 }));
    const holderMat = own(new THREE.MeshStandardMaterial({ color: 0x191919, metalness: 0, roughness: 0.52 }));
    const plateMetal = own(new THREE.MeshStandardMaterial({ color: 0x9c9ea2, metalness: 1, roughness: 0.3 }));
    const plateFace = own(new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, metalness: 0, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }));
    const weave = own(new THREE.CanvasTexture(drawWeaveBump()));
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(2, 40);
    const strapTex = own(new THREE.CanvasTexture(drawStrap(info.studio, "#5a5a5a")));
    strapTex.colorSpace = THREE.SRGBColorSpace;
    strapTex.wrapS = strapTex.wrapT = THREE.RepeatWrapping;
    strapTex.anisotropy = aniso;
    const strapMat = own(new THREE.MeshStandardMaterial({ map: strapTex, bumpMap: weave, bumpScale: 0.6, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
    const frontC = document.createElement("canvas"); frontC.width = CARD_W; frontC.height = CARD_H;
    const backC = document.createElement("canvas"); backC.width = CARD_W; backC.height = CARD_H;
    const frontTex = own(new THREE.CanvasTexture(frontC)), backTex = own(new THREE.CanvasTexture(backC));
    [frontTex, backTex].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; });
    const edgeMat = own(new THREE.MeshStandardMaterial({ color: 0xdedcd8, roughness: 1, metalness: 0 }));
    const frontMat = own(new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.96, metalness: 0 }));
    const backMat = own(new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.96, metalness: 0 }));
    const paint = () => { drawFront(frontC, info); drawBack(backC, info); frontTex.needsUpdate = true; backTex.needsUpdate = true; };
    paint();

    /* ---------- the badge ---------- */
    const badge = new THREE.Group();
    scene.add(badge);
    const holderShape = shape(2.72, 3.72, HOLDER_R);
    holderShape.holes.push(roundRect(new THREE.Path(), 2.3, 3.3, 0.05));
    const holderGeo = own(new THREE.ExtrudeGeometry(holderShape, { depth: HOLDER_D, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 }));
    holderGeo.translate(0, 0, -HOLDER_D / 2);
    const holder = new THREE.Mesh(holderGeo, holderMat);
    holder.castShadow = holder.receiveShadow = true;
    badge.add(holder);
    const tabShape = shape(TAB_W, 0.4, 0.16);
    { const h = new THREE.Path(); h.absarc(0, 0.16, TAB_HOLE, 0, Math.PI * 2, true); tabShape.holes.push(h); }
    const tabGeo = own(new THREE.ExtrudeGeometry(tabShape, { depth: HOLDER_D * 0.8, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }));
    tabGeo.translate(0, 1.86, -0.036);
    const tab = new THREE.Mesh(tabGeo, holderMat);
    tab.castShadow = tab.receiveShadow = true;
    badge.add(tab);
    const faceZ = HOLDER_D / 2 - 0.028;
    const cardGeo = own(new THREE.BoxGeometry(CARD_WW, CARD_HH, CARD_T));
    const card = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    card.position.z = faceZ - CARD_T / 2;
    card.receiveShadow = true;
    badge.add(card);
    // the metal plate with the studio mark
    const plate = new THREE.Group();
    const inner = 0.964;
    const ringShape = shape(PLATE, PLATE, PLATE * 0.224);
    ringShape.holes.push(roundRect(new THREE.Path(), inner, inner, inner * 0.21));
    const ringGeo = own(new THREE.ExtrudeGeometry(ringShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4 }));
    const ring = new THREE.Mesh(ringGeo, plateMetal);
    ring.castShadow = true;
    plate.add(ring);
    const innerGeo = own(new THREE.ExtrudeGeometry(shape(inner, inner, inner * 0.21), { depth: 0.05, bevelEnabled: false }));
    plate.add(new THREE.Mesh(innerGeo, plateFace));
    const markSize = PLATE * 0.44;
    const markGeo = own(new THREE.PlaneGeometry(markSize, markSize / site.studio.logoAspect));
    const markMat = own(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2 }));
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 0.02, 0.0505);
    mark.visible = false;
    plate.add(mark);
    if (site.studio.photo) {
      // the portrait fills the plate's inner face, under a light clear coat
      const photoSize = inner - 0.03;
      const photoGeo = own(new THREE.PlaneGeometry(photoSize, photoSize));
      const photoMat = own(new THREE.MeshPhysicalMaterial({
        transparent: true, alphaTest: 0.02, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
        envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      const photo = new THREE.Mesh(photoGeo, photoMat);
      photo.position.set(0, 0, 0.0505);
      photo.visible = false;
      plate.add(photo);
      loadPhoto(site.studio.photo, site.studio.photoFocus, 0.21).then((c) => {
        if (!c || ac.signal.aborted) return;
        const t = own(new THREE.CanvasTexture(c));
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
        photoMat.map = t; photoMat.needsUpdate = true; photo.visible = true;
      });
    } else {
      loadMark(site.studio.logoSvg, site.initials.join("")).then((c) => {
        if (!c || ac.signal.aborted) return;
        const t = own(new THREE.CanvasTexture(c));
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
        markMat.map = t; markMat.needsUpdate = true; mark.visible = true;
      });
    }
    plate.position.set(PLATE_POS.x, PLATE_POS.y, faceZ);
    badge.add(plate);
    // invisible pick target
    const hitGeo = own(new THREE.PlaneGeometry(2.72, 4.02));
    const hit = new THREE.Mesh(hitGeo, own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide })));
    hit.position.y = TAB_PAD / 2;
    badge.add(hit);

    /* ---------- the clip ---------- */
    const clip = new THREE.Group();
    scene.add(clip);
    {
      const add = (geo: THREE.BufferGeometry, set: (m: THREE.Mesh) => void, shadow = false) => {
        own(geo);
        const m = new THREE.Mesh(geo, clipMetal);
        set(m);
        m.castShadow = shadow;
        clip.add(m);
      };
      add(new THREE.BoxGeometry(0.52, 0.15, 0.1), () => {}, true);
      add(new THREE.TorusGeometry(0.095, 0.02, 12, 40), (m) => { m.position.y = -0.19; });
      add(new THREE.SphereGeometry(0.042, 20, 14), (m) => { m.position.y = -0.32; });
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 16), (m) => { m.position.y = -0.4; });
      add(new THREE.CapsuleGeometry(0.046, 0.15, 6, 16), (m) => { m.position.y = -0.55; });
      add(new THREE.TorusGeometry(0.075, 0.028, 12, 40, Math.PI * 1.55), (m) => { m.position.set(0, -0.72 + 0.07, 0.078); m.rotation.z = Math.PI * 0.72; }, true);
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 10), (m) => { m.position.set(0.06, -0.605, 0.078); m.rotation.z = -0.55; });
    }

    /* ---------- the strap ribbon ---------- */
    const strapGeo = own(new THREE.BufferGeometry());
    const pos = new Float32Array(SEGMENTS * 6), nor = new Float32Array(SEGMENTS * 6), uvs = new Float32Array(SEGMENTS * 4);
    const idx: number[] = [];
    for (let e = 0; e < SEGMENTS - 1; e++) { const a = e * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    strapGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    strapGeo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    strapGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    strapGeo.setIndex(idx);
    const strap = new THREE.Mesh(strapGeo, strapMat);
    strap.castShadow = true;
    strap.frustumCulled = false;
    scene.add(strap);

    /* ---------- particles ---------- */
    const anchor = pt(0, 6, 0, 0);
    let rope: Pt[] = [];
    const corners = [pt(-CARD_WW / 2, CARD_HH / 2, 0), pt(CARD_WW / 2, CARD_HH / 2, 0), pt(CARD_WW / 2, -CARD_HH / 2, 0), pt(-CARD_WW / 2, -CARD_HH / 2, 0)];
    const clasp = pt(0, CLASP_Y, 0);
    const keel = pt(0, 0, -1.1); // a point behind the card that keeps it facing you
    const body = [...corners, clasp, keel];
    const rest = body.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    let grab: Pt | null = null;
    let ropeLinks: Link[] = [];
    let bodyLinks: Link[] = [];
    for (let a = 0; a < body.length; a++) for (let b = a + 1; b < body.length; b++) bodyLinks.push(link(body[a], body[b]));

    let W = 1, H = 1, camDist = 14, halfH = 4;
    const fitCamera = () => {
      const t = Math.tan(((FOV / 2) * Math.PI) / 180), aspect = W / H;
      camDist = Math.max(4.4 / 0.6 / (2 * t), 4.4 / (aspect * 2 * t));
      cam.aspect = aspect; cam.fov = FOV;
      cam.position.set(0, 0, camDist);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      halfH = camDist * t;
    };
    const m4 = new THREE.Matrix4();
    const poseBody = (x: number, y: number, z: number, ry = 0, rx = 0) => {
      m4.makeRotationY(ry).multiply(new THREE.Matrix4().makeRotationX(rx));
      m4.setPosition(x, y, z);
      body.forEach((p, i) => {
        const v = rest[i].clone().applyMatrix4(m4);
        p.x = p.px = v.x; p.y = p.py = v.y; p.z = p.pz = v.z;
      });
    };
    const buildRope = (first: boolean) => {
      anchor.x = 0; anchor.y = halfH + 0.6; anchor.z = 0;
      anchor.px = anchor.x; anchor.py = anchor.y; anchor.pz = anchor.z;
      const bottom = P.restY + CLASP_Y + CLIP;
      const len = Math.max(0.6, anchor.y - bottom);
      const count = Math.max(3, Math.round(len / P.seg) + 1);
      const step = len / (count - 1);
      rope = [];
      for (let i = 0; i < count; i++) rope.push(pt(0, first ? anchor.y - i * step * 0.45 : anchor.y - i * step, 0, i === 0 ? 0 : 1));
      rope[0] = anchor;
      ropeLinks = [];
      for (let i = 0; i < count - 1; i++) { const l = link(rope[i], rope[i + 1], P.stretch); l.d = step; ropeLinks.push(l); }
      for (let i = 0; i < count - 2; i++) { const l = link(rope[i], rope[i + 2], P.bend); l.d = step * 2; ropeLinks.push(l); }
      const end = rope[count - 1];
      if (first) { poseBody(0.25, end.y - CLASP_Y - CLIP, 0, 0.15, -0.12); body.forEach((p) => { p.px = p.x - 0.006; }); }
      else poseBody(0, P.restY, 0);
      const l1 = link(end, clasp); l1.d = CLIP; ropeLinks.push(l1);
      const l2 = link(rope[count - 2], clasp, 0.6); l2.d = step + CLIP; ropeLinks.push(l2);
      if (first) for (const p of [...rope, ...body]) { p.y += P.lift; p.py += P.lift; }
    };
    const resize = () => {
      const r = stage.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1 && rope.length)) return;
      W = r.width; H = r.height;
      renderer.setSize(W, H, false);
      fitCamera();
      const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
      const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4;
      const first = rope.length === 0;
      buildRope(first);
      if (!first) poseBody(cx, cy, cz);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    /* ---------- input ---------- */
    const ac = new AbortController();
    const signal = ac.signal;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ptr = { on: false, down: false, moved: 0, t: 0 };
    let grabZ = 0;
    const tmp = new THREE.Vector3(), rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const setNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onPlane = (z: number, out: THREE.Vector3) => {
      ray.setFromCamera(ndc, cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      return out.copy(o).addScaledVector(d, (z - o.z) / d.z);
    };
    const pick = () => { ray.setFromCamera(ndc, cam); const h = ray.intersectObject(hit, false); return h.length ? h[0] : null; };

    let simT = 0, nextPuff = 3.5, puffDir = 1;
    canvas.addEventListener("pointermove", (e) => {
      setNdc(e);
      ptr.on = true;
      if (ptr.down) ptr.moved += Math.hypot(e.movementX, e.movementY);
      if (grab) { if (ptr.moved > 6 && fine) canvas.style.cursor = "grabbing"; }
      else if (fine) canvas.style.cursor = pick() ? "grab" : "";
    }, { signal, passive: true });
    canvas.addEventListener("pointerleave", () => { ptr.on = false; }, { signal });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      setNdc(e);
      const h = pick();
      ptr.down = true; ptr.moved = 0; ptr.t = performance.now();
      if (!h) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      grabZ = h.point.z;
      nextPuff = simT + P.nudgeEvery;
      grab = pt(h.point.x, h.point.y, h.point.z, 0);
      const g = grab;
      bodyLinks = bodyLinks.filter((l) => l.a !== g && l.b !== g);
      body.forEach((p) => bodyLinks.push(link(g, p, P.hold)));
    }, { signal });

    /* flip: a click spins the badge to its other face */
    const ax = new THREE.Vector3(), ay = new THREE.Vector3(), nrm = new THREE.Vector3(), center = new THREE.Vector3();
    const flipFrom = new THREE.Vector3();
    let flipping = 0, catchArmed = false;
    const frame = () => {
      const [a, b, c, d] = corners;
      ax.set(b.x - a.x + (c.x - d.x), b.y - a.y + (c.y - d.y), b.z - a.z + (c.z - d.z)).normalize();
      ay.set(a.x - d.x + (b.x - c.x), a.y - d.y + (b.y - c.y), a.z - d.z + (b.z - c.z));
      nrm.crossVectors(ax, ay).normalize();
      ay.crossVectors(nrm, ax).normalize();
    };
    const startFlip = () => { frame(); flipFrom.copy(nrm); flipping = 90; catchArmed = false; };
    const stepFlip = () => {
      if (!flipping) return;
      frame();
      if (nrm.dot(flipFrom) < -0.15) {
        flipping = 0; catchArmed = true;
        for (const p of body) { p.px = p.x - (p.x - p.px) * P.brake; p.py = p.y - (p.y - p.py) * P.brake; p.pz = p.z - (p.z - p.pz) * P.brake; }
        return;
      }
      flipping--;
      body.forEach((p, i) => {
        const s = Math.sign(rest[i].x) || 0;
        p.x += nrm.x * s * P.flip; p.y += nrm.y * s * P.flip; p.z += nrm.z * s * P.flip;
      });
    };
    const stepCatch = () => {
      if (!catchArmed || flipping) return;
      frame();
      if (Math.abs(nrm.z) < 0.965) return;
      catchArmed = false;
      const n = rope.length;
      for (let i = Math.floor(n * 0.66); i < n; i++) { const p = rope[i]; if (p.w) p.py += P.catch * ((i - n * 0.66) / (n * 0.34)); }
      for (const p of body) p.py += P.catch;
    };
    const release = (e: PointerEvent) => {
      if (!ptr.down) return;
      ptr.down = false;
      if (e.pointerType === "touch") askMotion();
      const held = !!grab;
      if (grab) {
        const g = grab;
        grab = null;
        bodyLinks = bodyLinks.filter((l) => l.a !== g && l.b !== g);
        for (const p of body) { p.px = p.x - (p.x - p.px) * P.throw; p.py = p.y - (p.y - p.py) * P.throw; p.pz = p.z - (p.z - p.pz) * P.throw; }
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        canvas.style.cursor = pick() ? "grab" : "";
      }
      if (held && ptr.moved < 6 && performance.now() - ptr.t < 320) startFlip();
    };
    canvas.addEventListener("pointerup", release, { signal });
    canvas.addEventListener("pointercancel", release, { signal });

    /* phones: hang toward the device's real down, and shake it */
    const down = { x: 0, y: -1 }, downTarget = { x: 0, y: -1 };
    let motionOn = false;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null) return;
      const ang = screen.orientation?.angle ?? 0;
      let gx = g.x, gy = g.y;
      if (ang === 90) { gx = g.y; gy = -g.x; } else if (ang === 270 || ang === -90) { gx = -g.y; gy = g.x; } else if (ang === 180) { gx = -g.x; gy = -g.y; }
      const x = (-(Math.sign(gx) * Math.max(0, Math.abs(gx) - P.band)) / 9.81) * P.tilt;
      const y = (-gy / 9.81) * P.tilt - 0.35;
      const l = Math.hypot(x, y) || 1;
      downTarget.x = x / l; downTarget.y = y / l;
      const a = e.acceleration;
      if (a && a.x !== null && a.y !== null) {
        let ax2 = a.x, ay2 = a.y;
        if (ang === 90) { ax2 = a.y; ay2 = -a.x; } else if (ang === 270 || ang === -90) { ax2 = -a.y; ay2 = a.x; } else if (ang === 180) { ax2 = -a.x; ay2 = -a.y; }
        const m = Math.hypot(ax2, ay2);
        if (m > P.shakeAt) {
          const k = Math.min(m - P.shakeAt, 12) * P.shake, ix = (-ax2 / m) * k, iy = (-ay2 / m) * k;
          for (const p of [...rope, ...body]) if (p.w) { p.px -= ix; p.py -= iy; }
          nextPuff = simT + P.nudgeEvery;
        }
      }
    };
    const listenMotion = () => { if (motionOn) return; motionOn = true; addEventListener("devicemotion", onMotion, { signal, passive: true }); };
    const askMotion = () => {
      const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      if (!DM) return;
      if (typeof DM.requestPermission === "function") {
        if (motionOn) return;
        DM.requestPermission().then((r) => { if (r === "granted") listenMotion(); }).catch(() => {});
      } else listenMotion();
    };
    if (matchMedia("(pointer: coarse)").matches) {
      const DM = window.DeviceMotionEvent as unknown as { requestPermission?: unknown } | undefined;
      if (DM && typeof DM.requestPermission !== "function") listenMotion();
    }

    /* ---------- simulation ---------- */
    const DT = 1 / 120;
    const puff = () => {
      if (grab || ptr.down) return;
      puffDir = -puffDir;
      const n = rope.length;
      for (let i = 1; i < n; i++) { const t = i / (n - 1); rope[i].px -= puffDir * P.nudge * t * t; }
      body.forEach((p, i) => {
        p.px -= puffDir * P.nudge * 0.9;
        const s = Math.sign(rest[i].x) || 0;
        p.pz -= s * puffDir * P.nudge * 0.45;
      });
    };
    const sim = () => {
      down.x += (downTarget.x - down.x) * 0.015;
      down.y += (downTarget.y - down.y) * 0.015;
      const gx = down.x * P.gravity * DT * DT, gy = down.y * P.gravity * DT * DT;
      simT += DT;
      const bx = Math.sin(simT * 0.7) * P.breeze * DT, bz = Math.sin(simT * 0.43 + 1.3) * P.breeze * 0.5 * DT;
      for (const p of [...rope, ...body]) {
        if (!p.w) continue;
        let vx = (p.x - p.px) * P.damp, vy = (p.y - p.py) * P.damp, vz = (p.z - p.pz) * P.damp;
        const v = Math.hypot(vx, vy, vz);
        if (v > P.vmax) { const k = P.vmax / v; vx *= k; vy *= k; vz *= k; }
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += vx + bx + gx; p.y += vy + gy; p.z += vz + bz;
      }
      // the cursor brushes the strap aside
      if (ptr.on && !grab && !ptr.down) {
        ray.setFromCamera(ndc, cam);
        rayO.copy(ray.ray.origin); rayD.copy(ray.ray.direction);
        for (const p of rope) {
          if (!p.w) continue;
          tmp.set(p.x, p.y, p.z).sub(rayO);
          tmp.addScaledVector(rayD, -tmp.dot(rayD));
          const r = tmp.length();
          if (r < P.push && r > 1e-4) { const k = ((P.push - r) / r) * 0.35; p.x += tmp.x * k; p.y += tmp.y * k; p.z += tmp.z * k; }
        }
      }
      // a gentle pull back toward facing the viewer
      {
        const k = grab ? P.face * P.faceHeld : P.face;
        const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4;
        for (const c of corners) c.z += (0 - c.z) * k;
        clasp.z += (0 - clasp.z) * k;
        const side = keel.z - cz < 0 ? -1 : 1;
        keel.z += (side * Math.abs(rest[5].z) - keel.z) * k;
      }
      if (simT >= nextPuff) { puff(); nextPuff = simT + P.nudgeEvery * (0.6 + Math.random() * 0.8); }
      stepFlip();
      stepCatch();
      if (grab) {
        onPlane(grabZ, tmp);
        grab.x += (tmp.x - grab.x) * P.follow; grab.y += (tmp.y - grab.y) * P.follow; grab.z += (tmp.z - grab.z) * P.follow;
      }
      for (let i = 0; i < P.iters; i++) { for (const l of ropeLinks) solve(l); for (const l of bodyLinks) solve(l); }
    };

    /* ---------- pose the meshes from the particles ---------- */
    const end = new THREE.Vector3(), claspV = new THREE.Vector3();
    const place = () => {
      frame();
      const [a, b, c, d] = corners;
      center.set((a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4, (a.z + b.z + c.z + d.z) / 4);
      badge.matrix.makeBasis(ax, ay, nrm).setPosition(center);
      badge.matrixAutoUpdate = false;
      badge.matrixWorldNeedsUpdate = true;
      const last = rope[rope.length - 1];
      end.set(last.x, last.y, last.z);
      claspV.set(clasp.x, clasp.y, clasp.z);
      const up = end.clone().sub(claspV).normalize();
      const fwd = nrm.clone().sub(up.clone().multiplyScalar(up.dot(nrm))).normalize();
      const side = up.clone().cross(fwd).normalize();
      clip.matrix.makeBasis(side, up, fwd).setPosition(end);
      clip.matrixAutoUpdate = false;
      clip.matrixWorldNeedsUpdate = true;
    };
    const ctrl: THREE.Vector3[] = [];
    const Zup = new THREE.Vector3(0, 0, 1), tan = new THREE.Vector3(), nz = new THREE.Vector3(), sx = new THREE.Vector3(), s = new THREE.Vector3();
    const buildStrap = () => {
      const n = rope.length;
      if (ctrl.length !== n) { ctrl.length = 0; for (let i = 0; i < n; i++) ctrl.push(new THREE.Vector3()); }
      for (let i = 0; i < n; i++) ctrl[i].set(rope[i].x, rope[i].y, rope[i].z);
      const at = (t: number, out: THREE.Vector3) => {
        const r = t * (n - 1), i = Math.min(n - 2, Math.floor(r)), f = r - i;
        const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
        const f2 = f * f, f3 = f2 * f;
        const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
        return out.set(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z));
      };
      let length = 0;
      let prev: THREE.Vector3 | null = null;
      for (let e = 0; e < SEGMENTS; e++) {
        const t = e / (SEGMENTS - 1);
        at(t, s);
        at(Math.min(1, t + 0.01), tan).sub(s).normalize();
        if (prev) length += s.distanceTo(prev);
        prev ??= new THREE.Vector3();
        prev.copy(s);
        // the strap twists from facing the viewer at the top to the badge's face at the clip
        const k = smoothstep(0.3, 1, t), flipK = nrm.z < 0 ? -k : k;
        nz.copy(Zup).multiplyScalar(1 - k).addScaledVector(nrm, flipK);
        nz.addScaledVector(tan, -nz.dot(tan)).normalize();
        sx.crossVectors(tan, nz).normalize();
        const o = e * 6;
        pos[o] = s.x - sx.x * STRAP_W * 0.5; pos[o + 1] = s.y - sx.y * STRAP_W * 0.5; pos[o + 2] = s.z - sx.z * STRAP_W * 0.5;
        pos[o + 3] = s.x + sx.x * STRAP_W * 0.5; pos[o + 4] = s.y + sx.y * STRAP_W * 0.5; pos[o + 5] = s.z + sx.z * STRAP_W * 0.5;
        nor[o] = nor[o + 3] = nz.x; nor[o + 1] = nor[o + 4] = nz.y; nor[o + 2] = nor[o + 5] = nz.z;
        const v = length / (STRAP_W * 4);
        uvs[e * 4] = 0; uvs[e * 4 + 1] = v; uvs[e * 4 + 2] = 1; uvs[e * 4 + 3] = v;
      }
      strapGeo.attributes.position.needsUpdate = true;
      strapGeo.attributes.normal.needsUpdate = true;
      strapGeo.attributes.uv.needsUpdate = true;
      strapGeo.computeBoundingSphere();
    };

    /* ---------- loop ---------- */
    let waiting = true, acc = 0, hidden = document.hidden;
    document.addEventListener("visibilitychange", () => { hidden = document.hidden; acc = 0; }, { signal });
    const tick = (_t: number, deltaMs: number) => {
      if (hidden || !rope.length) return;
      if (!waiting) {
        acc += Math.min(deltaMs / 1000, 1 / 20);
        let n = 0;
        while (acc >= DT && n < 8) { sim(); acc -= DT; n++; }
      }
      place();
      buildStrap();
      renderer.render(scene, cam);
    };
    gsap.ticker.add(tick);

    // the hook lowers into frame as the page reveals
    const arrive = () => {
      if (!waiting) return;
      waiting = false; acc = 0;
      gsap.to(anchor, { y: halfH + 0.6, duration: P.lower, ease: "expo.out", overwrite: true });
    };
    requestAnimationFrame(() => {
      if (document.documentElement.hasAttribute("data-veil")) document.addEventListener("veil:reveal", arrive, { once: true, signal });
      else arrive();
    });
    const failsafe = setTimeout(arrive, 4000);

    // repaint the card once the web fonts are in
    document.fonts?.ready.then(() => {
      if (signal.aborted) return;
      paint();
      strapTex.image = drawStrap(info.studio, "#5a5a5a");
      strapTex.needsUpdate = true;
    });

    const retheme = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      holderMat.color.set(dark ? 0x232323 : 0x191919);
      strapMat.color.set(dark ? 0xd8d8d8 : 0xffffff);
    };
    retheme();
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      ac.abort();
      clearTimeout(failsafe);
      gsap.ticker.remove(tick);
      gsap.killTweensOf(anchor);
      ro.disconnect();
      mo.disconnect();
      disposables.forEach((d) => d.dispose());
      // dispose only: the canvas is reused if the component remounts, so its context must stay alive
      renderer.dispose();
    };
  }, [live]);

  return (
    <>
      <section
        ref={stageRef}
        className="lstage"
        hidden={live !== true}
        tabIndex={0}
        role="group"
        aria-label={`${site.studio.name}'s badge. Drag to swing it.`}
        data-lenis-prevent
        data-no-pulse
      >
        <canvas ref={canvasRef} className="lstage__canvas" />
        <div className="lstage__info">
          <div className="infotip" data-place="top">
            <a className="stage-ibtn infotip__btn" href={site.studio.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${site.studio.name}`} aria-describedby="studio-tip" data-hover>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <g fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.75 11H12v5.25M21.25 12a9.25 9.25 0 1 1-18.5 0 9.25 9.25 0 0 1 18.5 0" />
                  <path fill="currentColor" strokeWidth=".25" d="M12 7.375a.625.625 0 1 0 0 1.25.625.625 0 0 0 0-1.25Z" />
                </g>
              </svg>
            </a>
            <div className="infotip__tip" id="studio-tip" role="tooltip">
              <p className="infotip__title text-label">
                {site.studio.urlLabel}
                <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11 11 5M6 5h5v5" /></svg>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* reduced motion / no WebGL: the studio's app-icon tile */}
      <div className="studio__classic container" hidden={live !== false}>
        <div className="studio__unit">
          <a className="studio__link" href={site.studio.url} target="_blank" rel="noopener noreferrer" data-hover>
            <span className="studio__tile">
              {site.studio.photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="studio__photo" src={site.studio.photo} alt={site.name} />
                : site.studio.logoSvg
                  ? <span className="studio__flag" dangerouslySetInnerHTML={{ __html: site.studio.logoSvg }} />
                  : <span className="studio__flag studio__flag--text">{site.initials.join("")}</span>}
            </span>
            <span className="studio__name text-h6">{site.studio.name}</span>
          </a>
          <p className="studio__meta text-meta">{site.studio.line}</p>
        </div>
      </div>
    </>
  );
}
