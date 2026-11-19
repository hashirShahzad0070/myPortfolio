"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import gsap from "gsap";
import { site } from "@/content/site";
import { Row } from "../ui";
import { drawCard, drawLogoLayer, drawPlateFace, drawPlateRelief, loadLogo, roundMask, speckle, stockRGB } from "./plates";
import { CARD_FRAG, CARD_VERT, RING_FRAG, RING_VERT } from "./wheelShaders";

/* ==========================================================================
   The press: two linked wheels. Left wheel = 16:9 image "proofs", right
   wheel = letterpress die plates. They meet at a nip in the middle where the
   project's name turns on an odometer drum.
   ========================================================================== */
const C = {
  radius: 1.14, overlap: 0.42, nip: 1, nipSide: 0.35, nipMargin: 0.04, nipClear: 0.04, pitchGap: 0.18,
  bend: 1.5, shear: 0.5, warp: 1, push: 1, restWarp: 0.35, checkWarp: 0.8, trail: 1, jerk: 1, sway: 1,
  pLean: 1.6, pRock: 1.2, pSide: 1.4, pSpin: 1.5, bevelPx: 3.5, wet: 1, streak: 0.6, grain: 0.06,
  drift: 0.15, arc: 0.022, fish: 0.14, dim: 0.22, cornerR: 4, cropY: 0.72, tiltX: -5, tiltY: 14,
  cardW: 0.7, slots: 9, plateW: 0.3, balance: 1, dieFollow: 0.08, dieRatio: 2 / 3, camZ: 3.2,
  damp: 0.08, lean: 0.6, focusS: 1.6, throwDim: 0.7, wheel: 0.0011, drag: 0.0034, touchPitch: 90,
  flickMin: 0.35, flick: 90, flickLead: 0.35, momentum: 0.6, vmax: 0.09, tail: 0.3, floor: 12,
  stepIn: 0.05, land: 0.24, inject: 0.28, life: 1, idle: 2, idleRate: 1, parallax: 0, frameTilt: 0.55,
  ring: 0.7, ringSpeed: 0.55, ringGap: 0.012, ringW: 0.002, ringBase: 0.13, ringShine: 0.28,
  stackY: -0.04, envD: 0.6, envL: 0.85, calm: 260, press: 1, lurch: 0.42, checkW: 0.54, flag: 0.145,
  bank: 0.23, checkK: 0.017, checkZ: 1, sheen: 0.08, sheenH: 0.6, sheenK: 12, tube: 1, tubeSide: 0.6,
  tubeDome: 1, tubeLens: 0, soft: 1.1, dof: 0.9, lamp: 0.34, notch: 0.05,
  reel: 1, reelTurns: 3, reelDur: 1.6, reelEach: 0.04, reelDelay: 0.2, reelLine: 0.08, reelIdle: 6,
  huntA: 0.18, huntF: 11, stir: 0.045, stirRate: 2, stirHand: 0, stockDark: 0.14, stockLight: 1,
};
const T = 16 / 9;
const PAD = 0.06; // ring padding around a proof
const STACK_ASPECT = 1.2;
const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;
const w = (e: number, t: number) => 1 - (1 - e) ** t; // frame-rate independent lerp factor
const smooth = (e: number) => e * e * (3 - 2 * e);
const seedOf = (e: number) => (((e + 1) * 2654435761) % 4294967296) / 4294967296;
const dieScale = () => (C.dieRatio * (C.cardW / T) * C.focusS) / C.plateW;
type Spring = { x: number; v: number };
const spring = (s: Spring, target: number, k: number, c: number, n: number) => {
  s.v += (k * (target - s.x) - c * s.v) * n;
  s.x += s.v * n;
  return Math.abs(target - s.x) + Math.abs(s.v);
};

const roundedSquare = (size: number, r: number) => {
  const s = new THREE.Shape(), h = size / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
};

const pad2 = (e: number) => String(e + 1).padStart(2, "0");

export function Wheels() {
  const stageRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"pending" | "stage" | "classic">("pending");

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ok = false;
    try { const c = document.createElement("canvas"); ok = !!c.getContext("webgl2"); } catch { ok = false; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(ok && !reduced ? "stage" : "classic");
  }, []);

  useEffect(() => {
    if (mode !== "stage") return;
    const stage = stageRef.current!;
    const projects = site.projects;
    const A = projects.length;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const ac = new AbortController();
    const { signal } = ac;
    const css = () => {
      const cs = getComputedStyle(document.documentElement);
      return {
        paper: cs.getPropertyValue("--paper").trim() || "#d6d6d5",
        ink: cs.getPropertyValue("--ink").trim() || "#1e1e1e",
        theme: document.documentElement.getAttribute("data-theme") ?? "light",
      };
    };
    let theme = css();
    const disposables: { dispose(): void }[] = [];

    /* ---------- renderer / scene ---------- */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: true, powerPreference: "high-performance" });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("classic");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    stage.prepend(canvas);
    canvas.addEventListener("webglcontextlost", () => setMode("classic"), { signal });

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.6, 12);
    cam.position.set(0, 0, C.camZ);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = theme.theme === "dark" ? C.envD : C.envL;
    disposables.push(envRT.texture, pmrem);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-1.6, 2.2, 2.6);
    scene.add(key);

    const wheelI = new THREE.Group(); // proofs
    const wheelL = new THREE.Group(); // dies
    scene.add(wheelI, wheelL);

    const stockTone = () => (theme.theme === "dark" ? C.stockDark : C.stockLight);

    /* ---------- proofs (left wheel) ---------- */
    const Ge = C.cardW / T;
    const uVel = { value: 0 }, uJerk = { value: 0 };
    const cardMats: THREE.ShaderMaterial[] = [];
    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    type Card = {
      g: THREE.Group; mat: THREE.ShaderMaterial; ring: THREE.Mesh; ringMat: THREE.ShaderMaterial;
      sS: Spring; sway: Spring; hov: number; tube: number; ringS: { st: "off" | "engage" | "on" | "release"; on: number; shine: number };
    };
    const makeCard = (p: (typeof projects)[number], i: number): Card => {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(C.cardW, Ge, 24, 16);
      const tex = new THREE.CanvasTexture(drawCard(p));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      const mat = new THREE.ShaderMaterial({
        vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, transparent: true,
        uniforms: {
          uMap: { value: tex }, uInk: { value: new THREE.Color(theme.ink) }, uSize: { value: new THREE.Vector2(C.cardW, Ge) },
          uRadius: { value: 0.02 }, uImgA: { value: T }, uRestA: { value: T }, uCropY: { value: C.cropY },
          uFocus: { value: 0 }, uDrift: { value: C.drift }, uArc: { value: C.arc }, uFish: { value: C.fish }, uDim: { value: C.dim },
          uVel, uJerk, uBend: { value: C.bend * 0.02 }, uShear: { value: C.shear * 0.06 }, uHover: { value: 0 },
          uPar: { value: new THREE.Vector2() }, uStreak: { value: C.streak }, uSoft: { value: C.soft }, uDof: { value: C.dof },
          uSpoke: { value: 0 }, uLamp: { value: C.lamp }, uGrain: { value: C.grain }, uFlag: { value: 0 }, uFlagT: { value: 0 },
          uStir: { value: 0 }, uStirT: { value: 0 }, uHead: { value: 0 }, uHead2: { value: 0 }, uStirOn: { value: 0 },
          uSheen: { value: 0 }, uSheenH: { value: C.sheenH }, uSheenK: { value: C.sheenK },
          uTube: { value: 0 }, uTubeS: { value: C.tubeSide }, uTubeZ: { value: C.tubeDome },
          uSeed: { value: seedOf(i * 7) * 100 }, uReveal: { value: 0 },
          uTrail: { value: C.trail * 0.03 }, uWarp: { value: C.warp * 0.03 }, uPush: { value: C.push * 0.03 },
          uRestWarp: { value: C.restWarp * C.warp * 0.03 }, uTravelX: { value: 0 },
          uVideo: { value: 0 }, uProg: { value: -1 }, uLeave: { value: -1 }, uLineA: { value: 0.5 }, uGrainV: { value: 0.012 },
        },
      });
      cardMats.push(mat);
      const reveal = () => gsap.to(mat.uniforms.uReveal, { value: 1, duration: 0.7, ease: "power1.out", delay: 0.15 + i * 0.03 });
      if (p.image) {
        loader.load(p.image, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = maxAniso;
          mat.uniforms.uImgA.value = t.image.width / t.image.height;
          mat.uniforms.uMap.value.dispose();
          mat.uniforms.uMap.value = t;
          disposables.push(t);
          reveal();
        }, undefined, reveal);
      } else reveal();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      g.add(mesh);
      disposables.push(geo, mat, tex);

      // focus ring
      const m = C.cardW / 2 + PAD, h = Ge / 2 + PAD, extra = 0.04;
      const rgeo = new THREE.PlaneGeometry((m + extra) * 2, (h + extra) * 2, 24, 16);
      const shared = Object.fromEntries(
        ["uVel", "uBend", "uJerk", "uTrail", "uWarp", "uPush", "uRestWarp", "uTravelX", "uFocus", "uDrift", "uArc", "uShear", "uFlag", "uFlagT", "uStir", "uStirT", "uStirOn", "uTube", "uTubeS", "uTubeZ", "uSize"].map((k) => [k, mat.uniforms[k]]),
      );
      const ringMat = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, depthTest: false,
        premultipliedAlpha: true, blending: THREE.NormalBlending,
        uniforms: {
          ...shared,
          uHalf: { value: new THREE.Vector2(C.cardW / 2 + C.ringGap, Ge / 2 + C.ringGap) },
          uR: { value: (C.cornerR / 100) * Ge + C.ringGap }, uW: { value: C.ringW }, uOn: { value: 0 },
          uHead: { value: 0 }, uHead2: { value: 0 }, uCur: { value: 0 }, uShine: { value: 0 }, uBase: { value: C.ringBase },
          uColor: { value: new THREE.Color() },
        },
      });
      const ring = new THREE.Mesh(rgeo, ringMat);
      ring.position.z = 0.017;
      ring.renderOrder = 5;
      ring.frustumCulled = false;
      ring.visible = false;
      g.add(ring);
      disposables.push(rgeo, ringMat);
      return { g, mat, ring, ringMat, sS: { x: 0, v: 0 }, sway: { x: 0, v: 0 }, hov: 0, tube: 0, ringS: { st: "off", on: 0, shine: 0 } };
    };

    /* ---------- dies (right wheel) ---------- */
    const speckTex = new THREE.CanvasTexture(speckle());
    speckTex.wrapS = speckTex.wrapT = THREE.RepeatWrapping;
    speckTex.repeat.set(1.6, 1.6);
    disposables.push(speckTex);

    type Die = {
      g: THREE.Group; body: THREE.MeshPhysicalMaterial; face: THREE.MeshPhysicalMaterial; faceCanvas: HTMLCanvasElement; faceTex: THREE.CanvasTexture;
      seed: number; zS: Spring; foc: Spring; wob: Spring; rock: Spring; side: Spring; spin: Spring; hov: number; wet: number; wetIn: number; wetT: number;
      retint: (tone: number) => void;
    };
    const makeDie = (p: (typeof projects)[number], i: number): Die => {
      const g = new THREE.Group();
      const seed = seedOf(i * 53);
      const a = 0.007, corner = C.plateW * 0.065, inset = C.plateW * 0.03;
      const bodyGeo = new THREE.ExtrudeGeometry(roundedSquare(C.plateW - a * 2, Math.max(0.002, corner - a)), {
        depth: 0.034, bevelEnabled: true, bevelThickness: a, bevelSize: a, bevelSegments: 3,
      });
      const body = new THREE.MeshPhysicalMaterial({ color: "#e8e6e0", roughness: 0.92, bumpMap: speckTex, bumpScale: 0.3 });
      const bodyMesh = new THREE.Mesh(bodyGeo, body);
      bodyMesh.position.z = -0.045;
      g.add(bodyMesh);

      const faceCanvas = drawPlateFace(p, stockTone(), seed);
      const faceTex = new THREE.CanvasTexture(faceCanvas);
      faceTex.colorSpace = THREE.SRGBColorSpace;
      faceTex.anisotropy = maxAniso;
      const relief = new THREE.CanvasTexture(drawPlateRelief(p, C.bevelPx));
      const mask = new THREE.CanvasTexture(roundMask(Math.max(0.004, corner - inset) / (C.plateW * 0.94)));
      const face = new THREE.MeshPhysicalMaterial({
        map: faceTex, normalMap: relief, normalScale: new THREE.Vector2(0.9, 0.9), alphaMap: mask, transparent: true,
        roughness: 0.78, clearcoat: 0.15, clearcoatRoughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
      });
      const faceGeo = new THREE.PlaneGeometry(C.plateW * 0.94, C.plateW * 0.94);
      const faceMesh = new THREE.Mesh(faceGeo, face);
      faceMesh.position.z = 0.006;
      faceMesh.renderOrder = 2;
      g.add(faceMesh);
      disposables.push(bodyGeo, body, faceTex, relief, mask, face, faceGeo);

      const retint = (tone: number) => {
        drawPlateFace(p, tone, seed, faceCanvas);
        faceTex.needsUpdate = true;
        const [r, gg, b] = stockRGB(tone, seed);
        const lift = tone < 0.5 ? 1 : 1 + (0.85 - 1) * Math.min(1, (tone - 0.5) / 0.4);
        body.color.setRGB((r / 255) * lift, (gg / 255) * lift, (b / 255) * lift, THREE.SRGBColorSpace);
        const metal = tone < 0.5;
        body.metalness = metal ? 0.45 : 0;
        body.roughness = metal ? 0.38 : 0.92;
        body.clearcoat = metal ? 0.55 : 0;
        body.clearcoatRoughness = 0.28;
        body.iridescence = metal ? 1 : 0;
        body.iridescenceIOR = 1.4;
        body.iridescenceThicknessMinimum = 140;
        body.iridescenceThicknessMaximum = 520;
        body.bumpScale = metal ? 0.54 : 0.3;
        face.roughness = metal ? 0.42 : 0.78;
        face.metalness = metal ? 0.3 : 0;
        face.clearcoat = metal ? 0.5 : 0.15;
        body.needsUpdate = true;
        face.needsUpdate = true;
      };
      retint(stockTone());
      if (p.logo) {
        loadLogo(p.logo).then(() => {
          if (signal.aborted) return;
          relief.image = drawPlateRelief(p, C.bevelPx);
          relief.needsUpdate = true;
          retint(stockTone());
          // the logo itself: unlit and untoned, so it shows exactly as supplied
          const art = drawLogoLayer(p);
          if (art) {
            const tex = new THREE.CanvasTexture(art);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = maxAniso;
            const mat = new THREE.MeshBasicMaterial({
              map: tex, transparent: true, toneMapped: false, depthWrite: false,
              polygonOffset: true, polygonOffsetFactor: -3,
            });
            const logoMesh = new THREE.Mesh(faceGeo, mat);
            logoMesh.position.z = 0.0065;
            logoMesh.renderOrder = 3;
            g.add(logoMesh);
            disposables.push(tex, mat);
          }
        }, () => {});
      }
      return {
        g, body, face, faceCanvas, faceTex, seed, retint,
        zS: { x: 0, v: 0 }, foc: { x: 0, v: 0 }, wob: { x: 0, v: 0 }, rock: { x: 0, v: 0 }, side: { x: 0, v: 0 }, spin: { x: 0, v: 0 },
        hov: 0, wet: 0, wetIn: 0, wetT: 0,
      };
    };

    const cards = projects.map((p, i) => { const c = makeCard(p, i); wheelI.add(c.g); return c; });
    const dies = projects.map((p, i) => { const d = makeDie(p, i); wheelL.add(d.g); return d; });
    const cardSeed = projects.map((_, i) => seedOf(i * 31));
    let ringHead = seedOf(7), ringHead2 = seedOf(11);

    /* ---------- angles ---------- */
    const B = TAU / Math.min(A, Math.max(3, Math.round(C.slots)));
    const period = A * B;
    const wrapA = (e: number) => { const t = ((e % period) + period) % period; return t > period / 2 ? t - period : t; };
    const idxOf = (v: number) => ((Math.round(-v / B) % A) + A) % A;

    /* ---------- layout ---------- */
    let V = 0, H = 0;
    const entrance = { off: -1.62 }, slide = { v: 1 };
    let viewH = 1, viewW = 1, stacked = false, G = 1, Et = 0;
    let Mt = 0, Nt = 0, Pt = 0, Ft = 0, It = 0, Lt = 0, Rt = 0, zt = 0, Bt = 0;
    const q = new THREE.Vector3();

    const placeWheels = (e: number) => {
      const t = Mt + Pt + It * e, n = Nt + Ft + It * e;
      if (stacked) { wheelI.position.set(0, Et + t, 0); wheelL.position.set(0, Et - n, 0); }
      else { wheelI.position.set(Et - t, Rt, 0); wheelL.position.set(Et + n, Rt, 0); }
    };

    const arrange = () => {
      const e = C.radius * G, t = e * C.overlap, n = stacked ? viewH : viewW;
      Mt = Nt = n / 2 - t;
      Pt = Ft = e;
      if (stacked) Pt = Math.max(e, (C.cardW * G * (C.focusS + 0.9) / 2 + C.pitchGap * G) / (2 * Math.sin(B / 2)));
      if (stacked) {
        wheelI.rotation.set(rad(C.tiltY), rad(C.tiltX), -Math.PI / 2);
        wheelL.rotation.set(-rad(C.tiltY), rad(C.tiltX), -Math.PI / 2);
        It = t + (C.cardW / T) * G * C.focusS + 0.2;
      } else {
        wheelI.rotation.set(rad(C.tiltX), rad(C.tiltY), 0);
        wheelL.rotation.set(rad(C.tiltX), -rad(C.tiltY), 0);
        It = t + C.cardW * G * C.focusS + 0.2;
      }
      {
        const half = (C.plateW * G * dieScale()) / 2;
        const room = Math.max(0, n / 2 - C.nipMargin * n - (Nt + half));
        Lt = It > 0 ? Math.min(0.22, room / It) : 0;
      }
      let offY = 0;
      if (stacked) {
        const a = Mt - ((C.cardW / T) * G * C.focusS) / 2, b = -Nt + (C.plateW * G * dieScale()) / 2;
        offY = Et + (a + b) / 2;
        Bt = 0;
        stage.style.removeProperty("--nip-w");
        stage.style.removeProperty("--open-dx");
      } else {
        stage.style.removeProperty("--open-dy");
        Rt = 0;
        // balance the wheels vertically in the space below the header
        const bar = document.querySelector(".header__bar");
        const hb = bar ? Math.max(0, bar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top) : 0;
        const goal = 1 - (hb + stage.clientHeight) / stage.clientHeight;
        const projY = (g: THREE.Group, ang: number, r: number) => {
          g.updateWorldMatrix(true, false);
          q.set(Math.cos(ang) * r, Math.sin(ang) * r, 0);
          return g.localToWorld(q).project(cam).y;
        };
        let acc = 0;
        for (let k = 0; k < 4; k++) {
          Rt = acc;
          placeWheels(0);
          cam.updateMatrixWorld(true);
          const avg = (projY(wheelI, B, Pt) + projY(wheelI, -B, Pt) + projY(wheelL, Math.PI - B, Ft) + projY(wheelL, Math.PI + B, Ft)) / 4;
          acc -= ((avg - goal) * viewH) / 2;
        }
        Rt = acc * C.balance;
        offY = Rt;
        // open the nip: push the proof wheel out a little, pull the active die in
        const eC = (C.cardW * G * C.focusS) / 2, tD = (C.plateW * G * dieScale()) / 2, aD = C.drift * C.focusS * G;
        const o = Mt - eC - aD;
        const s = Math.max(0, Nt - tD - o) * C.nip;
        const c = Math.max(0, n / 2 - C.nipMargin * n - (Mt + eC - aD));
        Mt += Math.max(0, Math.min(s * C.nipSide, c));
        placeWheels(0);
        cam.updateMatrixWorld(true);
        const projX = (g: THREE.Group, x: number) => {
          g.updateWorldMatrix(true, false);
          q.set(x, 0, 0);
          return (g.localToWorld(q).project(cam).x * viewW) / 2;
        };
        const d = -projX(wheelI, Pt + eC + aD);
        let f = 0;
        for (let k = 0; k < 4; k++) f += projX(wheelL, -(Ft + f + tD)) - d;
        Bt = Math.max(0, f * C.nip);
        const width = Math.max(0, 2 * (d - C.nipClear * G));
        stage.style.setProperty("--nip-w", `${((width / viewW) * stage.clientWidth).toFixed(2)}px`);
      }
      zt = (-offY / viewH) * stage.clientHeight;
      stage.style.setProperty("--nip", `${zt.toFixed(2)}px`);
      placeWheels(slide.v);
    };

    let lastW = -1, lastH = -1;
    const layout = (force = false) => {
      const W = stage.clientWidth, Hh = stage.clientHeight;
      if (!W || !Hh || (!force && W === lastW && Hh === lastH)) return;
      lastW = W; lastH = Hh;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(W, Hh, false);
      cam.aspect = W / Hh;
      cam.updateProjectionMatrix();
      viewH = 2 * Math.tan(rad(cam.fov) / 2) * C.camZ;
      viewW = viewH * cam.aspect;
      stacked = cam.aspect < STACK_ASPECT;
      stage.classList.toggle("is-stacked", stacked);
      const header = stacked ? (document.querySelector("header")?.offsetHeight ?? 0) * (viewH / Hh) : 0;
      const cw = C.cardW, ch = C.cardW / T, span = stacked ? viewH : viewW;
      const fitA = ((stacked ? viewW : viewH) * 0.92) / ((stacked ? cw : ch) * C.focusS);
      const fitB = (span * 0.67) / (2 * C.radius * C.overlap + (stacked ? ch : cw) * C.focusS);
      G = Math.min(1, fitA, fitB);
      const p = (0 - header) / 2 + (C.plateW * G * dieScale() - ch * G * C.focusS) / 4;
      Et = stacked ? Math.max(-0.26, Math.min(0.14, p)) + C.stackY : 0;
      if (stacked) {
        const e = viewH / 2 - C.radius * C.overlap * G;
        const t = -viewH / 2 + 0.03 + e + (C.plateW * G * dieScale()) / 2;
        Et = Math.max(Et, Math.min(0.14, t));
      }
      arrange();
      for (const l of lines) l.h = 0;
    };

    /* ---------- text drum ---------- */
    type Reel = { el: HTMLElement; turns: number; delay: number; r: number };
    type Line = {
      win: HTMLElement; copies: HTMLElement[]; st: number[]; reels: Reel[][]; lag: number; th: number; v: number; h: number; vis: number;
      write: (el: HTMLElement, i: number) => void; hosts: (el: HTMLElement) => HTMLElement[]; fit?: (el: HTMLElement) => void;
    };
    const FIT_MIN = 0.72;
    const lineDefs = [
      { name: "eyebrow", lag: 0.16, hosts: (e: HTMLElement) => [e], write: (e: HTMLElement, t: number) => { e.textContent = `N°${pad2(t)} / ${pad2(A - 1)}`; } },
      {
        name: "title", lag: 0.12, hosts: (e: HTMLElement) => [e], write: (e: HTMLElement, t: number) => { e.textContent = projects[t].name; },
        fit: (e: HTMLElement) => {
          e.style.removeProperty("--fit");
          e.style.whiteSpace = "nowrap";
          const cw = e.clientWidth, sw = e.scrollWidth;
          if (!cw || sw <= cw + 0.5) return;
          const r = cw / sw;
          e.style.setProperty("--fit", Math.max(FIT_MIN, r).toFixed(3));
          if (r < FIT_MIN) e.style.whiteSpace = "";
        },
      },
      {
        name: "chips", lag: 0.095, hosts: (e: HTMLElement) => [...e.querySelectorAll<HTMLElement>("[data-chip-collab], [data-chip-year]")],
        write: (e: HTMLElement, t: number) => {
          const c = e.querySelector<HTMLElement>("[data-chip-collab]"), y = e.querySelector<HTMLElement>("[data-chip-year]");
          if (c) c.textContent = projects[t].collab;
          if (y) y.textContent = projects[t].year;
        },
      },
      {
        name: "cta", lag: 0.075, hosts: () => [] as HTMLElement[],
        write: (e: HTMLElement, t: number) => {
          const a = e.querySelector<HTMLAnchorElement>("[data-cta]");
          if (!a) return;
          a.href = projects[t].url;
          a.setAttribute("aria-label", `View ${projects[t].name}`);
        },
      },
    ];
    const lines: Line[] = lineDefs.map((d) => {
      const win = stage.querySelector<HTMLElement>(`[data-wheels-line="${d.name}"]`)!;
      const copies = [...win.querySelectorAll<HTMLElement>("[data-drum]")];
      return { win, copies, st: [NaN, NaN], reels: [[], []], lag: d.lag, th: 0, v: 0, h: 0, vis: -1, write: d.write, hosts: d.hosts, fit: "fit" in d ? d.fit : undefined };
    });
    const mod = (e: number) => ((e % A) + A) % A;
    const par = (e: number) => ((e % 2) + 2) % 2;
    const splitReels = (l: Line, k: number) => {
      const out: Reel[] = [];
      for (const host of l.hosts(l.copies[k])) {
        const text = host.textContent ?? "";
        host.textContent = "";
        const sr = document.createElement("span");
        sr.className = "u-sr-only";
        sr.textContent = text;
        host.appendChild(sr);
        for (const part of text.split(/( )/)) {
          if (!part) continue;
          if (part === " ") { host.appendChild(document.createTextNode(" ")); continue; }
          const word = document.createElement("span");
          word.className = "hv2__word";
          for (const ch of [...part]) {
            const cell = document.createElement("span");
            cell.className = "hv2__ch";
            cell.setAttribute("aria-hidden", "true");
            const a = document.createElement("span");
            a.textContent = ch;
            cell.append(a, a.cloneNode(true));
            word.appendChild(cell);
            out.push({ el: cell, turns: 0, delay: 0, r: 0 });
          }
          host.appendChild(word);
        }
      }
      l.reels[k] = out;
    };

    let reelT = -1, reelEnd = 0, reelStartAt = 0, reelWaiting = false, reelWaitT = 0;
    const startReel = () => {
      if (C.reel <= 0) return;
      const e = Math.round(-V / B);
      reelT = -1; reelWaiting = true; reelWaitT = 0; reelEnd = 0;
      lines.forEach((l, li) => {
        for (const k of [0, 1]) {
          if (l.st[k] !== e) continue;
          const order = l.reels[k].map((_, i) => i).sort(() => Math.random() - 0.5);
          l.reels[k].forEach((r, i) => {
            r.turns = Math.max(1, Math.round(C.reelTurns + (Math.random() * 2 - 1)));
            r.delay = C.reelDelay + li * C.reelLine + order[i] * C.reelEach;
            reelEnd = Math.max(reelEnd, r.delay + C.reelDur);
          });
        }
      });
      reelStartAt = performance.now();
    };
    const stopReel = () => {
      reelT = -1; reelWaiting = false;
      for (const l of lines) for (const k of [0, 1]) for (const r of l.reels[k]) if (r.r !== 0) { r.r = 0; r.el.style.removeProperty("--r"); }
    };

    /* ---------- motion state ---------- */
    let state: "rest" | "hand" | "throw" | "landing" | "check" = "rest";
    let ft = 0, pt = 0, mt = 0, ht = 0, gt = 0, restF = 1;
    let landed = true, huntT = 1e4, huntDir = 1, hunt = 0;
    let Y = 0, Q: number | null = null, lastInput = -1e4, settleDelay = 60, flung = false;
    let landStart = -1, landTarget = 0, landV = 0;
    let sinceLand = 1e4;
    let idleT = 0, stirT = 0;
    let dragX: number | null = null, dragY = 0, dragW = 0, dragAt = 0, isTouch = false, dragGain = C.drag, dragStartIdx = 0, flickV = 0, lastTs = 0;
    let downX = 0, downY = 0, moved = false, swallow = false;
    let px = -1e4, py = -1e4;
    let wheelLast = -1e4, wheelPrevMag = 0, wheelRun = 0, wheelRunMag = 0, wheelSign = 0, inertia = false, wheelGap = false;
    const check = { t: 0, c: 0, i: -1 };
    let checkV = 0, flap = 0, flapT = 0, bank = 0, prevD = 0;
    const checkPos = new THREE.Vector3(), checkQuat = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
    let checkScale = 0;
    const pulse = { v: 0 };
    let announced = -1;
    const announce = stage.querySelector<HTMLElement>("[data-wheels-announce]");
    let announceTimer = 0;

    const setTarget = (e: number) => { Q = e; lastInput = performance.now(); };
    const clearTarget = () => { Q = null; };
    const goTo = (i: number) => { let t = -i * B; t += Math.round((H - t) / period) * period; setTarget(t); };
    const openCheck = (i: number) => {
      if (check.i >= 0 && check.i !== i) {
        const prev = videos.get(check.i);
        if (prev?.on) stopVideo(check.i, true);
        else if (prev?.landing) restoreStill(check.i);
        check.c = 0; checkV = 0;
      }
      check.i = i; check.t = 1; pulse.v = 1;
      stage.classList.add("is-open");
      playVideo(i);
    };
    const closeCheck = () => {
      if (!check.t) return;
      check.t = 0; pulse.v = 0.45;
      stage.classList.remove("is-open");
      stopVideo(check.i);
    };

    /* ---------- project videos: an opened card plays its video on the card itself ---------- */
    type Vid = { el: HTMLVideoElement; tex: THREE.VideoTexture; still: THREE.Texture | null; stillA: number; on: boolean; ready: boolean; landing: boolean; lastT: number; lapAt: number };
    const videos = new Map<number, Vid>();
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const videoFor = (i: number): Vid | null => {
      const src = projects[i]?.video;
      if (!src || matchMedia("(prefers-reduced-motion: reduce)").matches || saveData) return null;
      const have = videos.get(i);
      if (have) return have;
      const el = document.createElement("video");
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = "none"; el.crossOrigin = "anonymous";
      el.src = src;
      const tex = new THREE.VideoTexture(el);
      tex.colorSpace = THREE.SRGBColorSpace;
      // mipmapped + trilinear: a 1080p frame shrunk onto the card stays crisp instead of aliasing
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      const v: Vid = { el, tex, still: null, stillA: 0, on: false, ready: false, landing: false, lastT: 0, lapAt: -1e9 };
      el.addEventListener("loadeddata", () => { v.ready = true; }, { signal });
      videos.set(i, v);
      disposables.push({ dispose: () => { el.pause(); el.removeAttribute("src"); el.load(); tex.dispose(); } });
      return v;
    };
    /** Warm a video up before it's opened: metadata when its card settles in front, the file on hover. */
    const preloadVideo = (i: number, level: "metadata" | "auto") => {
      const v = videoFor(i);
      if (!v || v.ready) return;
      const rank = { none: 0, metadata: 1, auto: 2 } as const;
      if (rank[level] <= rank[(v.el.preload || "none") as keyof typeof rank]) return;
      v.el.preload = level;
      v.el.load();
    };
    const playVideo = (i: number) => {
      const v = videoFor(i);
      if (!v) return;
      v.on = true; v.landing = false;
      v.el.play().catch(() => {});
    };
    /** Put the card's still back (once the card has landed). */
    const restoreStill = (i: number) => {
      const v = videos.get(i);
      if (!v) return;
      v.landing = false;
      const u = cardMats[i].uniforms;
      if (u.uMap.value === v.tex && v.still) { u.uMap.value = v.still; u.uImgA.value = v.stillA; }
      u.uVideo.value = 0; u.uProg.value = -1; u.uLeave.value = -1;
      v.lastT = 0; v.lapAt = -1e9;
      try { v.el.currentTime = 0; } catch { /* ignore */ }
    };
    const stopVideo = (i: number, now = false) => {
      const v = videos.get(i);
      if (!v || !v.on) return;
      v.on = false;
      v.el.pause();
      if (now) restoreStill(i);
      else v.landing = true;
    };
    /** Swap the playing video onto the card in place of its still. */
    const swapIn = (i: number) => {
      const v = videos.get(i);
      if (!v || !v.on || !v.ready) return;
      const u = cardMats[i].uniforms;
      if (u.uMap.value === v.tex) return;
      v.still = u.uMap.value; v.stillA = u.uImgA.value;
      u.uMap.value = v.tex;
      u.uImgA.value = v.el.videoWidth / Math.max(1, v.el.videoHeight);
      u.uVideo.value = 1;
    };
    document.addEventListener("visibilitychange", () => {
      videos.forEach((v) => { if (v.on) { if (document.hidden) v.el.pause(); else v.el.play().catch(() => {}); } });
    }, { signal });
    let preloaded = -1;

    const onActive = (e: number) => {
      if (e === announced) return;
      announced = e;
      clearTimeout(announceTimer);
      if (announce) announceTimer = window.setTimeout(() => {
        const p = projects[e];
        announce.textContent = `${p.name}, ${p.collab}, ${p.year}. ${e + 1} of ${A}.`;
      }, 700);
      if (coarse && "vibrate" in navigator) try { navigator.vibrate(5); } catch { /* ignore */ }
      const k = Math.max(0, 1 - gt * 1.6);
      dies[e].zS.v += 0.012 * C.life * k;
      dies[e].wob.v += (dies[e].seed - 0.5) * 0.05 * C.life * k;
      cards[e].sS.v += 0.006 * C.life * k;
      sinceLand = 0;
    };

    /* ---------- hit testing (screen space) ---------- */
    const v3 = new THREE.Vector3();
    const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
    const toScreen = (o: THREE.Object3D) => {
      o.getWorldPosition(v3).project(cam);
      return [(v3.x * 0.5 + 0.5) * SW(), (-v3.y * 0.5 + 0.5) * SH()] as const;
    };
    const cardLocal = (i: number, x: number, y: number) => {
      const c = cards[i];
      const [sx, sy] = toScreen(c.g);
      const scale = (c.g.scale.x * SW()) / (viewW || 1);
      const lx = (x - sx) / scale - C.drift * c.mat.uniforms.uFocus.value, ly = -(y - sy) / scale;
      const hw = C.cardW / 2, hh = Ge / 2;
      return { lx, ly, in: Math.abs(lx) < hw * 1.04 && Math.abs(ly) < hh * 1.06, out: Math.abs(lx) > hw * 1.18 || Math.abs(ly) > hh * 1.24 };
    };
    const dieHit = (i: number, x: number, y: number) => {
      const d = dies[i];
      if (!d.g.visible) return false;
      const [sx, sy] = toScreen(d.g);
      const r = ((C.plateW * d.g.scale.x * 0.56) / (viewW || 1)) * SW();
      return Math.abs(x - sx) < r && Math.abs(y - sy) < r;
    };
    const hitAt = (x: number, y: number): { kind: "proof" | "plate"; i: number } | null => {
      const a = idxOf(V);
      if (cards[a].g.visible && cardLocal(a, x, y).in) return { kind: "proof", i: a };
      for (let i = 0; i < A; i++) if (i !== a && cards[i].g.visible && cardLocal(i, x, y).in) return { kind: "proof", i };
      for (let i = 0; i < A; i++) if (dieHit(i, x, y)) return { kind: "plate", i };
      return null;
    };
    const overCheck = (x: number, y: number) => {
      if (check.i < 0 || check.c < 0.5) return false;
      const [sx, sy] = toScreen(cards[check.i].g);
      const z = 0.3 * G;
      const vw = 2 * Math.tan(rad(cam.fov) / 2) * (C.camZ - z) * cam.aspect;
      const wpx = ((checkScale * C.cardW) / (vw || 1)) * SW();
      return Math.abs(x - sx) < wpx / 2 && Math.abs(y - sy) < wpx / T / 2;
    };
    let cursor = "";
    const setCursor = (c: string) => { if (c !== cursor) { cursor = c; stage.style.cursor = c; } };
    const updateCursor = () => {
      if (coarse) return;
      if (dragX !== null && moved) return setCursor("grabbing");
      if (px < -1e3) return setCursor("grab");
      if (check.t) return setCursor(overCheck(px, py) ? "zoom-out" : "default");
      const h = hitAt(px, py);
      const a = idxOf(V), tgt = idxOf(H);
      const ok = !!h && (h.i !== a || Math.abs(H - V) < 0.02 || h.i === tgt);
      setCursor(ok ? "pointer" : "grab");
    };

    /* ---------- input ---------- */
    let wheelSpent = 0;
    const spend = (d: number) => { wheelSpent += Math.abs(d); };
    stage.addEventListener("wheel", (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      if (check.t) { closeCheck(); clearTarget(); return; }
      const t = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
      if (!t) return;
      const now = performance.now(), mag = Math.abs(t), sg = Math.sign(t), gap = now - wheelLast;
      wheelLast = now;
      // swallow a trackpad's inertial tail
      if (inertia) {
        if (!(gap > 80 || sg !== wheelSign || mag > wheelPrevMag * 1.5 + 2)) { wheelPrevMag = Math.min(wheelPrevMag, mag); return; }
        inertia = false; wheelRun = 0;
      }
      wheelRun = gap > 60 || sg !== wheelSign || mag > wheelPrevMag ? 0 : wheelRun + 1;
      if (wheelRun === 0) wheelRunMag = mag;
      wheelPrevMag = mag; wheelSign = sg;
      if (wheelRun >= 3 && wheelRunMag >= C.floor && mag <= wheelRunMag * C.tail) { inertia = true; return; }
      // a mouse-wheel notch turns exactly one card
      const spaced = gap > 40;
      const notch = spaced && (wheelGap || mag >= 60);
      wheelGap = spaced;
      if (notch) { setTarget(Math.round((Q ?? H) / B - sg) * B); Y = 0; lastInput = now; spend(t); return; }
      clearTarget();
      settleDelay = gap < 30 ? 60 : 160;
      flung = false;
      const c = -t * C.wheel, cap = gap > 40 ? B * C.stepIn : Infinity;
      const u = Math.max(-cap, Math.min(cap, c));
      H += u; Y += c - u; lastInput = now; spend(t);
    }, { passive: false, signal });

    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as Element).closest?.(".hv2__ctarow")) return;
      if (check.t) { closeCheck(); swallow = true; }
      dragX = e.clientX; dragY = e.clientY; dragW = 0; dragAt = performance.now();
      isTouch = e.pointerType === "touch";
      dragGain = isTouch ? B / C.touchPitch : C.drag;
      dragStartIdx = Math.round(H / B); flickV = 0; lastTs = e.timeStamp;
      clearTarget();
      downX = e.clientX; downY = e.clientY; px = e.clientX; py = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      moved = false;
    }, { signal });
    stage.addEventListener("pointermove", (e) => {
      px = e.clientX; py = e.clientY;
      if (dragX === null) {
        const h = hitAt(e.clientX, e.clientY);
        if (h?.kind === "proof" && h.i === idxOf(V)) preloadVideo(h.i, "auto");
        return;
      }
      if (e.buttons === 0) { dragX = null; moved = false; return; }
      const t = dragY - e.clientY + (e.clientX - dragX);
      if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 8) moved = true;
      H += t * dragGain;
      dragW = dragW * 0.7 + t * 0.3;
      flickV = flickV * 0.5 + (t / Math.max(4, e.timeStamp - lastTs)) * 0.5;
      lastTs = e.timeStamp;
      lastInput = performance.now(); dragAt = lastInput;
      spend(t);
      dragX = e.clientX; dragY = e.clientY;
    }, { signal });
    stage.addEventListener("pointerup", (e) => {
      if (dragX === null) return;
      dragX = null;
      try { stage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      moved = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && !check.t && !swallow) {
        const a = idxOf(V), tgt = idxOf(H);
        const near = Math.abs(H - Math.round(H / B) * B) < B * 0.25;
        const h = hitAt(e.clientX, e.clientY);
        if (h) {
          if (h.i === tgt && near) { H = Math.round(H / B) * B; openCheck(tgt); return; }
          if (h.i === a && Math.abs(H - V) < 0.02) { openCheck(a); return; }
          goTo(h.i); swallow = false; return;
        }
      }
      swallow = false;
      H += dragW * C.flick * dragGain * 0.02;
      lastInput = performance.now(); settleDelay = 60; flung = true;
      if (isTouch && Math.abs(flickV) > C.flickMin && performance.now() - dragAt < 90 && Math.round(H / B) === dragStartIdx)
        setTarget((dragStartIdx + Math.sign(flickV)) * B);
    }, { signal });
    stage.addEventListener("pointercancel", () => { dragX = null; moved = false; swallow = false; }, { signal });
    stage.addEventListener("lostpointercapture", () => { dragX = null; moved = false; }, { signal });
    stage.addEventListener("pointerleave", () => { px = -1e4; py = -1e4; }, { signal });
    stage.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = Q ?? H;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); closeCheck(); setTarget(Math.round(t / B - 1) * B); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); closeCheck(); setTarget(Math.round(t / B + 1) * B); }
      if (e.key === "Enter" && e.target === stage && !check.t) openCheck(idxOf(t));
    }, { signal });
    addEventListener("keydown", (e) => { if (e.key === "Escape") closeCheck(); }, { signal });

    /* ---------- the drum, per frame ---------- */
    const updateText = (n: number) => {
      const t = -V / B;
      let busy = false;
      if ((reelT >= 0 || reelWaiting) && (state === "hand" || state === "throw" || state === "check" || Math.abs(H - V) > B * 0.2)) stopReel();
      if (reelT < 0 && !reelWaiting && C.reelIdle > 0 && state === "rest" && !check.t && dragX === null &&
        performance.now() - reelStartAt > C.reelIdle * 1000 && performance.now() - lastInput > C.reelIdle * 1000) startReel();
      if (reelWaiting) {
        busy = true;
        reelWaitT += (n * 16.667) / 1000;
        if (reelWaitT > 1.5 || lines.every((l) => l.v === 0 && l.th === Math.round(l.th))) { reelWaiting = false; reelT = 0; }
      } else if (reelT >= 0) { reelT += (n * 16.667) / 1000; busy = true; }

      for (const l of lines) {
        l.v += (l.lag * (t - l.th) - 0.48 * l.v) * n;
        l.th += l.v * n;
        const r = Math.round(l.th);
        if (Math.abs(l.th - r) < 0.004 && Math.abs(l.v) < 0.002 && Math.abs(t - r) < 0.01) { l.th = r; l.v = 0; }
        const base = Math.floor(l.th);
        let changed = false;
        for (const e of [base, base + 1]) {
          const k = par(e);
          if (l.st[k] !== e) { l.st[k] = e; l.write(l.copies[k], mod(e)); if (C.reel > 0) splitReels(l, k); changed = true; }
        }
        if (changed || !l.h) {
          if (l.fit) l.copies.forEach(l.fit);
          const h = Math.max(l.copies[0].offsetHeight, l.copies[1].offsetHeight) + 4;
          if (h !== l.h) { l.h = h; l.win.style.blockSize = `${h}px`; }
        }
        for (const e of [base, base + 1]) l.copies[par(e)].style.transform = `translateY(${((e - l.th) * l.h).toFixed(2)}px)`;
        const vis = par(Math.round(l.th));
        if (vis !== l.vis) {
          l.vis = vis;
          l.copies.forEach((c, k) => { c.inert = k !== vis; c.toggleAttribute("aria-hidden", k !== vis); });
        }
        if (reelT >= 0) {
          for (const k of [0, 1]) for (const rr of l.reels[k]) {
            const e = reelT - rr.delay;
            let turn = 0;
            if (e > 0 && e < C.reelDur) {
              const p = e / C.reelDur;
              turn = rr.turns * (1 - 2 ** (-10 * p)) * Math.sin((Math.min(p / 0.2, 1) * Math.PI) / 2);
            }
            const fr = e >= C.reelDur || e <= 0 ? 0 : turn - Math.floor(turn);
            if (fr !== rr.r) { rr.r = fr; if (fr === 0) rr.el.style.removeProperty("--r"); else rr.el.style.setProperty("--r", fr.toFixed(4)); }
          }
        }
      }
      if (reelT >= 0 && reelT > reelEnd + 0.05) stopReel();
      return busy;
    };

    /* ---------- frame ---------- */
    // Springs are tuned per 60fps frame; split slow frames so they stay stable.
    const frame = (_time: number, deltaMs: number) => {
      if (!(deltaMs > 0.25)) return;
      const total = Math.min(deltaMs, 50);
      const steps = Math.max(1, Math.ceil(total / 16.667));
      for (let k = 0; k < steps; k++) step(total / steps, k === steps - 1);
    };
    const step = (deltaMs: number, draw: boolean) => {
      const n = deltaMs / 16.667;
      const now = performance.now();
      if (Q !== null) H = Q;
      if (dragX !== null && now - dragAt > 40) dragW *= 0.75 ** n;
      if (Math.abs(Y) > 5e-5) { const e = Y * w(C.inject, n); H += e; Y -= e; } else Y = 0;
      // governor: the target never runs too far ahead of the wheel
      if (dragX === null && Q === null && landStart < 0) {
        const lead = flung ? B * C.flickLead : C.vmax / w(C.damp, 1);
        H = Math.max(V - lead, Math.min(V + lead, H));
      }
      // detents under the hand
      if (dragX !== null && moved) H += -Math.sin((H / B) * TAU) * B * C.notch * (1 / (1 + Math.abs(pt) * 90)) * w(0.25, n);

      const since = now - lastInput;
      let landing = 0;
      const hasQ = Q !== null;
      if (dragX === null && (hasQ || (Math.abs(Y) < B * 0.08 && (since > settleDelay || inertia)))) {
        if (hasQ && landTarget !== Q) landStart = -1;
        if (landStart < 0) {
          landStart = now; H += Y; Y = 0;
          const e = (ft / C.land) * C.momentum;
          const t = Math.max(-6, Math.min(6, e / B)) * B;
          landTarget = hasQ ? (Q as number) : Math.round((H + t) / B) * B;
          landV = ft;
        }
        H = landTarget;
        landing = 1;
      } else landStart = -1;

      const prevV = V;
      if (landing) {
        const k = C.land;
        landV += (-k * k * (V - landTarget) - 2 * k * landV) * n;
        landV = Math.max(-C.vmax, Math.min(C.vmax, landV));
        V += landV * n;
        if (Math.abs(V - landTarget) < 3e-4 && Math.abs(landV) < 4e-5) { V = landTarget; landV = 0; clearTarget(); }
      } else V += Math.max(-C.vmax * n, Math.min(C.vmax * n, (H - V) * w(C.damp, n)));
      ft = (V - prevV) / n;
      pt += (ft - pt) * w(0.16, n);
      uVel.value = Math.tanh(pt * 16);
      mt += ((ft - ht) / Math.max(n, 0.25) - mt) * w(0.2, n);
      ht = ft;
      uJerk.value = Math.tanh(mt * 260) * C.jerk;
      updateText(n);

      const calm = 1 / (1 + Math.abs(pt) * C.calm);
      restF += ((state === "rest" || state === "check" ? 1 : 0) - restF) * w(0.1, n);
      const sp = Math.abs(uVel.value);
      gt += (sp - gt) * w(sp > gt ? 0.3 : landing ? 0.14 : 0.06, n);
      if (Math.abs(sp - gt) < 5e-4) gt = sp;

      const ns = check.t ? "check" : dragX !== null && moved ? "hand" : landing && Math.abs(H - V) > 0.004 ? "landing" : gt > 0.35 ? "throw" : Math.abs(H - V) > 0.004 || Math.abs(Y) > 0.001 ? "landing" : "rest";
      if (ns !== state) { state = ns; stage.dataset.state = state; }

      // landed on a detent: reel the text, hunt, press the proof, wet the die
      if (!(Math.abs(H - Math.round(H / B) * B) < 5e-4) || Math.abs(H - V) > 0.03) landed = false;
      else if (!landed && Math.abs(H - V) < 0.004 && dragX === null && Math.abs(Y) < 0.001) {
        landed = true;
        startReel();
        huntT = 0;
        huntDir = pt < 0 ? -1 : 1;
        const e = idxOf(V);
        cards[e].sS.v -= 0.009 * C.life * C.press;
        dies[e].wetIn = C.wet; dies[e].wetT = 0;
        sinceLand = 0;
      }

      // check: the proof is pulled off the press for a closer look
      {
        const k = C.checkK, c = 2 * Math.sqrt(k) * C.checkZ;
        checkV += (k * (check.t - check.c) - c * checkV) * n;
        check.c += checkV * n;
        if (Math.abs(check.t - check.c) < 5e-4 && Math.abs(checkV) < 5e-5) { check.c = check.t; checkV = 0; }
      }
      // the opened card's video: swap it in once the card is on its way, run the progress line
      if (check.i >= 0) {
        const v = videos.get(check.i);
        if (v?.on) {
          if (v.ready && check.c > 0.35) swapIn(check.i);
          const u = cardMats[check.i].uniforms;
          if (u.uMap.value === v.tex) {
            const t = v.el.currentTime;
            if (t + 0.05 < v.lastT) v.lapAt = performance.now(); // it looped
            v.lastT = t;
            u.uProg.value = v.el.duration > 0 ? t / v.el.duration : 0;
            const r = (performance.now() - v.lapAt) / 700;
            u.uLeave.value = r < 1 ? (r < 0.5 ? 2 ** (20 * r - 10) / 2 : (2 - 2 ** (-20 * r + 10)) / 2) : -1;
          }
        } else if (v?.landing && check.c < 0.02) restoreStill(check.i);
      }
      {
        const front = idxOf(V);
        if (front !== preloaded && Math.abs(H - V) < 0.02 && dragX === null) { preloaded = front; preloadVideo(front, "metadata"); }
      }
      const d = smooth(Math.max(0, Math.min(1, check.c)));
      const fd = Math.abs(d - prevD);
      prevD = d;
      const arcP = Math.sin(Math.PI * Math.max(0, Math.min(1, check.c)));
      const speedP = Math.min(1, (fd / Math.max(n, 0.001)) * 10);
      flap += (Math.max(arcP, speedP) - flap) * w(arcP > flap ? 0.5 : 0.045, n);
      if (flap > 0.002) flapT += fd * 9 + 0.06 * n; else flap = 0;
      bank += (C.bank * Math.max(-1, Math.min(1, checkV / (n * 0.04))) - bank) * w(0.12, n);
      stage.style.setProperty("--open", Math.max(0, Math.min(1, check.c)).toFixed(4));

      if (pulse.v > 0.004) pulse.v *= 0.88 ** n; else pulse.v = 0;
      if (huntT < 3) {
        huntT += Math.min(deltaMs, 50) / 1000;
        hunt = huntDir * rad(C.huntA) * Math.exp(-huntT * 5) * Math.sin(huntT * C.huntF);
        if (Math.abs(hunt) < 1e-5) { hunt = 0; huntT = 3; }
      }
      if (Math.abs(V) > 400) { const e = Math.round(V / period) * period; V -= e; H -= e; landTarget -= e; if (Q !== null) Q -= e; }

      for (const m of cardMats) m.uniforms.uTravelX.value = stacked ? 1 : 0;
      const active = idxOf(V);
      sinceLand += n;
      const g = stacked ? Math.PI / 2 : 0;
      placeWheels(Math.max(slide.v, d * Lt));

      if (d > 5e-4 && check.i >= 0) {
        const z = 0.3 * G;
        const vh = 2 * Math.tan(rad(cam.fov) / 2) * (C.camZ - z), vw = vh * cam.aspect;
        const width = stacked ? Math.min(vw * 0.86, vh * 0.36 * T) : Math.min(vw * C.checkW, vh * 0.62 * T);
        checkScale = width / C.cardW;
        if (stacked) checkPos.set(0, vh * 0.17, z); else checkPos.set(-vw * 0.19, 0, z);
        if (stacked) {
          const e = (-(vh * 0.17 - width / T / 2) / vh) * SH();
          stage.style.setProperty("--open-dy", `${(e / 2 + SH() * 0.12 - zt).toFixed(1)}px`);
        } else {
          const e = ((-vw * 0.19 + width / 2) / vw) * SW();
          wheelL.updateWorldMatrix(true, false);
          q.set(-(Ft + (C.plateW * G * dieScale()) / 2), 0, 0);
          wheelL.localToWorld(q).project(cam);
          const a = (q.x * SW()) / 2;
          stage.style.setProperty("--open-dx", `${((e + a) / 2).toFixed(1)}px`);
          stage.style.setProperty("--open-dy", `${(-zt).toFixed(1)}px`);
        }
        wheelI.updateWorldMatrix(true, false);
        wheelI.worldToLocal(checkPos);
        checkQuat.copy(wheelI.getWorldQuaternion(tmpQ)).invert();
      }

      const idle = C.idle > 0 && !document.hidden && d < 0.02 ? C.idle : 0;
      if (idle) idleT += (Math.min(deltaMs, 50) / 1000) * C.idleRate;
      let stirMax = 0, stirHandMax = 0;
      ringHead = (ringHead + 0.0042 * C.ringSpeed * n) % 1;
      ringHead2 = (ringHead2 + 0.0042 * C.ringSpeed * n * 0.618) % 1;

      projects.forEach((_, t) => {
        const r = wrapA(t * B + V + entrance.off + hunt);
        const focus = smooth(Math.max(0, 1 - Math.abs(r) / B)) * (1 - C.throwDim * gt);
        const s = cards[t], u = s.mat.uniforms;
        // proofs lean with the wheel's speed, each on its own spring
        const lean = pt * C.lean * (7 + cardSeed[t] * 5);
        let o = lean;
        if (C.sway > 0) { const k = (0.11 + cardSeed[t] * 0.05) * C.sway; spring(s.sway, lean, k, 2 * Math.sqrt(k), n); o = s.sway.x; }
        u.uFocus.value = focus;
        u.uSpoke.value = r;
        u.uDrift.value = stacked ? 0 : C.drift;
        u.uRadius.value = (C.cornerR / 100) * Ge;

        let hov = 0;
        const par2 = u.uPar.value as THREE.Vector2;
        if (focus <= 0.6 && s.g.visible && px > -1e3 && dragX === null) {
          if (cardLocal(t, px, py).in) hov = 0.45 * C.life * calm * restF;
        } else if (focus > 0.6 && px > -1e3) {
          const [sx, sy] = toScreen(s.g);
          const span = ((C.cardW * G * C.focusS * 0.75) / (viewW || 1)) * SW();
          const dx = (px - sx) / span, dy = (py - sy) / span;
          hov = smooth(Math.max(0, 1 - Math.hypot(dx, dy))) * C.life * calm;
          par2.x += (Math.max(-1, Math.min(1, dx)) - par2.x) * w(0.12, n);
          par2.y += (Math.max(-1, Math.min(1, -dy)) - par2.y) * w(0.12, n);
        }
        const isCheck = t === check.i && d > 5e-4;
        const flying = t === check.i && (d > 0.02 || flap > 0.05);
        const tubeT = hov * (1 - d);
        s.tube += (tubeT - s.tube) * w(0.12, n);
        if (isCheck || flying) hov = 0;
        s.hov += (hov - s.hov) * w(0.12, n);
        u.uHover.value = s.hov;
        u.uSheen.value = s.hov * C.sheen;
        u.uTube.value = s.tube * C.tube * 0.03;
        u.uFish.value = C.fish + s.tube * C.tubeLens;
        const handStir = focus > 0.6 && !isCheck && !flying ? Math.min(1, s.hov * 1.8) * C.stir * C.stirHand : 0;
        const idleStir = isCheck || flying ? 0 : idle * C.stir * (focus > 0.6 ? 0.22 : 0.09);
        const stir = Math.max(handStir, idleStir);
        stirMax = Math.max(stirMax, stir); stirHandMax = Math.max(stirHandMax, handStir);
        u.uStir.value = stir;
        u.uStirT.value = stirT;
        u.uStirOn.value = s.ringS.on;
        u.uFlag.value = t === check.i ? flap * C.flag : 0;
        u.uFlagT.value = flapT;

        // the focus ring engages when the hand rests on the active proof
        const rs = s.ringS;
        const loc = focus > 0.6 && px > -1e3 ? cardLocal(t, px, py) : null;
        const engage = !!loc?.in && !flying && calm > 0.6 && Math.abs(H - V) < 0.03;
        const release = !loc || loc.out || flying || calm < 0.3 || focus < 0.6;
        if (rs.st === "off") { if (engage) rs.st = "engage"; }
        else if (rs.st === "engage") { rs.on += (1 - rs.on) * w(0.14, n); if (release) rs.st = "release"; else if (rs.on > 0.985) { rs.on = 1; rs.st = "on"; } }
        else if (rs.st === "on") { if (release) rs.st = "release"; }
        else { rs.on += (0 - rs.on) * w(0.1, n); if (engage) rs.st = "engage"; else if (rs.on < 0.01) { rs.on = 0; rs.st = "off"; } }
        const lit = rs.st === "engage" || rs.st === "on" ? 1 : 0;
        rs.shine += (lit - rs.shine) * w(0.16, n);
        s.ring.visible = rs.on > 0.01;
        if (s.ring.visible) {
          const ru = s.ringMat.uniforms;
          ru.uOn.value = rs.on * C.ring;
          ru.uHead.value = ringHead; ru.uHead2.value = ringHead2;
          u.uHead.value = ringHead; u.uHead2.value = ringHead2;
          ru.uShine.value = rs.shine * C.ringShine;
          if (loc) {
            const R = ru.uR.value as number;
            ru.uCur.value = Math.atan2(loc.ly / (Ge / 2 + C.ringGap + R), loc.lx / (C.cardW / 2 + C.ringGap + R)) / TAU + 0.5;
          }
        }
        spring(s.sS, 0, 0.16, 0.5, n);
        let arcK = 1;
        if (focus > 0.5 && sinceLand < 260) arcK = 1 + Math.sin(sinceLand * 0.04 + 1.7) * 0.3 * (1 - sinceLand / 260) * C.life;
        if (isCheck) u.uRestWarp.value = (C.restWarp + (C.checkWarp - C.restWarp) * d) * C.warp * 0.03;
        else u.uRestWarp.value = C.restWarp * C.warp * 0.03;
        u.uArc.value = C.arc * arcK * (isCheck ? 1 - d : 1);
        if (isCheck) { u.uFish.value = C.fish * (1 - d); u.uDrift.value = stacked ? 0 : C.drift * (1 - d); }

        const ce = r + o;
        const tiltA = -par2.y * 0.15 * s.hov * C.frameTilt, tiltB = -par2.x * 0.15 * s.hov * C.frameTilt;
        const bob = idle ? Math.sin(idleT * 0.55 + t * 1.7) * 0.0022 * G * idle : 0;
        const roll = idle ? Math.sin(idleT * 0.4 + t) * 0.0022 * idle : 0;
        s.g.position.set(Math.cos(ce) * Pt, Math.sin(ce) * Pt + bob, (focus * 0.06 + s.hov * 0.025 * C.frameTilt) * G);
        s.g.rotation.set(stacked ? -tiltB : tiltA, stacked ? tiltA : tiltB, ce + g + roll);
        let sc = (0.9 + (C.focusS - 0.9) * focus) * (1 + s.sS.x) * G;
        if (isCheck) {
          s.g.position.lerp(checkPos, d);
          s.g.quaternion.slerp(checkQuat, d);
          sc += (checkScale - sc) * d;
        }
        if (t === check.i && Math.abs(bank) > 1e-5) { if (stacked) s.g.rotateX(-bank); else s.g.rotateY(bank); }
        s.g.scale.setScalar(sc);
        s.g.visible = Math.abs(r) < Math.PI * 0.72;

        /* the die opposite this proof */
        const D = dies[t], O = Math.PI - r;
        spring(D.foc, focus, C.dieFollow, 2 * Math.sqrt(C.dieFollow), n);
        const he = Math.min(1, Math.max(0, D.foc.x));
        const dLean = pt * C.lean * C.pLean * (6 + D.seed * 4);
        spring(D.wob, dLean, 0.13 + D.seed * 0.04, 0.34, n);
        spring(D.rock, uJerk.value * 0.12 * C.pRock * (0.7 + D.seed * 0.6), 0.16 + D.seed * 0.05, 0.55, n);
        D.side.v += uJerk.value * (D.seed - 0.5) * 0.02 * C.pSide * n;
        spring(D.side, 0, 0.12 + D.seed * 0.06, 0.52, n);
        { const k = 0.09 + D.seed * 0.03; spring(D.spin, -uVel.value * 0.35 * C.pSpin * (0.8 + D.seed * 0.4), k, 2 * Math.sqrt(k), n); }
        const spinA = Math.tanh(D.spin.x) * 1.2;
        let dh = 0, tx = 0, ty = 0;
        if (focus <= 0.6 && px > -1e3 && dragX === null) { if (dieHit(t, px, py)) dh = 0.5 * C.life * calm * restF; }
        else if (focus > 0.6 && px > -1e3) {
          const [sx, sy] = toScreen(D.g);
          const span = ((C.plateW * G * 1.35) / (viewW || 1)) * SW();
          const rx = (px - sx) / span, ry = (py - sy) / span;
          dh = smooth(Math.max(0, 1 - Math.hypot(rx, ry))) * C.life * calm;
          tx = ry * 0.3; ty = -rx * 0.3;
        }
        D.hov += (dh - D.hov) * w(0.14, n);
        if (D.wetIn > 0) { D.wetT = Math.min(1, D.wetT + n / 12); D.wet = Math.max(D.wet, D.wetIn * smooth(D.wetT)); if (D.wetT >= 1) D.wetIn = 0; }
        else if (D.wet > 0.001) D.wet *= 0.955 ** n; else D.wet = 0;
        D.face.clearcoat = (theme.theme === "dark" ? 0.5 : 0.15) + D.wet * 0.8;
        D.face.clearcoatRoughness = 0.5 - D.wet * 0.4;
        spring(D.zS, focus * 0.05 + D.hov * 0.045, 0.14, 0.72, n);
        let by = 0, rz = 0;
        if (focus > 0.5 && sinceLand < 260) {
          const e = 1 - sinceLand / 260;
          by = Math.sin(sinceLand * 0.045 + t) * 0.0045 * e * C.life;
          rz = Math.sin(sinceLand * 0.03 + t * 2) * 0.008 * e * C.life;
        }
        let rx2 = 0, ry2 = 0;
        if (idle) {
          by += Math.sin(idleT * 0.7 + t * 1.3) * 0.0035 * idle * C.life;
          rz += Math.sin(idleT * 0.5 + t * 2.1) * 0.006 * idle * C.life;
          rx2 = Math.sin(idleT * 0.45 + t) * 0.012 * idle;
          ry2 = Math.cos(idleT * 0.38 + t * 1.3) * 0.012 * idle;
        }
        D.g.position.set(Math.cos(O) * Ft - Bt * he * (1 - d), Math.sin(O) * Ft + by * G, D.zS.x * G);
        const seedTilt = (D.seed - 0.5) * 0.05, hx = tx * D.hov, hy = ty * D.hov;
        D.g.rotation.set(
          (stacked ? -hy : hx) + rx2 + (stacked ? D.side.x + spinA : D.rock.x),
          (stacked ? hx : hy) + ry2 + (stacked ? D.rock.x : D.side.x + spinA),
          -(r + D.wob.x) + rz + seedTilt + g,
        );
        D.g.scale.setScalar((0.85 + (dieScale() - 0.85) * he + 0.05 * D.hov) * G);
        D.g.visible = Math.abs(r) < Math.PI * 0.72;
      });

      if (Math.abs(wrapA(active * B + V)) < 0.35 * B) onActive(active);
      if (stirMax > 0.0015) stirT += 0.0042 * C.ringSpeed * n * TAU * C.stirRate * (stirHandMax > 0.0015 ? 1 : 0.4 * C.idleRate);
      if (!draw) return;
      updateCursor();
      renderer.render(scene, cam);
    };

    /* ---------- theme ---------- */
    let tween: gsap.core.Tween | null = null;
    const mo = new MutationObserver(() => {
      const next = css();
      if (next.theme === theme.theme && next.ink === theme.ink) return;
      const fromTone = stockTone(), fromEnv = scene.environmentIntensity;
      theme = next;
      for (const m of cardMats) (m.uniforms.uInk.value as THREE.Color).set(theme.ink);
      setRingColor();
      const toTone = stockTone(), toEnv = theme.theme === "dark" ? C.envD : C.envL;
      tween?.kill();
      const o = { k: 0 };
      tween = gsap.to(o, {
        k: 1, duration: 0.4, ease: "power3.out",
        onUpdate: () => {
          scene.environmentIntensity = fromEnv + (toEnv - fromEnv) * o.k;
          const tone = fromTone + (toTone - fromTone) * o.k;
          dies.forEach((d) => d.g.visible && d.retint(tone));
        },
        onComplete: () => { tween = null; dies.forEach((d) => d.retint(toTone)); },
      });
    });
    const setRingColor = () => {
      const dark = theme.theme === "dark";
      for (const c of cards) {
        (c.ringMat.uniforms.uColor.value as THREE.Color).set(dark ? "#ffffff" : theme.ink);
        c.ringMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        c.ringMat.needsUpdate = true;
      }
    };
    setRingColor();
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    /* ---------- go ---------- */
    const lineEls = [...stage.querySelectorAll<HTMLElement>("[data-wheels-line]")];
    gsap.set(lineEls, { autoAlpha: 0, y: 14 });
    layout(true);
    const ro = new ResizeObserver(() => layout());
    ro.observe(stage);
    document.fonts?.ready.then(() => { for (const l of lines) l.h = 0; });
    gsap.ticker.add(frame);

    let entered = false;
    const enter = () => {
      if (entered || signal.aborted) return;
      entered = true;
      const a = idxOf(V);
      gsap.to(slide, { v: 0, duration: 1.5, ease: "expo.out" });
      gsap.to(entrance, { off: B * C.lurch, duration: 1.25, ease: "power3.out", delay: 0.05 });
      gsap.to(entrance, {
        off: 0, duration: 1.1, ease: "expo.out", delay: 1.3,
        onComplete: () => { startReel(); dies[a].zS.v += 0.012 * C.life; cards[a].sS.v += 0.006 * C.life; sinceLand = 0; },
      });
      gsap.to(lineEls, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.07, delay: 0.45, clearProps: "transform" });
    };
    // wait a frame so the veil (mounted after us) has flagged itself
    requestAnimationFrame(() => {
      if (document.documentElement.hasAttribute("data-veil")) document.addEventListener("veil:reveal", enter, { once: true, signal });
      else enter();
    });
    const failsafe = setTimeout(enter, 4500);

    return () => {
      ac.abort();
      clearTimeout(failsafe);
      clearTimeout(announceTimer);
      gsap.ticker.remove(frame);
      gsap.killTweensOf([slide, entrance, ...lineEls, ...cardMats.map((m) => m.uniforms.uReveal)]);
      tween?.kill();
      ro.disconnect();
      mo.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
      void wheelSpent;
    };
  }, [mode]);

  const drum = (kind: "eyebrow" | "title" | "chips" | "cta", k: number) => {
    const hidden = k === 1 ? { "aria-hidden": true } : {};
    switch (kind) {
      case "eyebrow": return <p key={k} className="hv2__eyebrow text-label hv2__drum" data-drum {...hidden} />;
      case "title": return <p key={k} className="hv2__title hv2__drum" data-drum {...hidden} />;
      case "chips":
        return (
          <div key={k} className="hv2__chips hv2__drum" data-drum {...hidden}>
            <span className="chip text-meta" data-chip-collab />
            <span className="chip text-meta chip--pill" data-chip-year />
          </div>
        );
      default:
        return (
          <div key={k} className="hv2__ctarow hv2__drum" data-drum {...hidden}>
            <a href="/" target="_blank" rel="noopener" className="btn btn--solid text-tag" data-cta>
              <span className="btn__label roll" aria-hidden="true">
                {[..."View project"].map((c, i) => <span key={i} style={{ ["--index" as string]: i }}>{c}</span>)}
              </span>
              <span className="u-sr-only">View project</span>
            </a>
          </div>
        );
    }
  };

  return (
    <>
      <section
        ref={stageRef}
        className="hv2__stage"
        hidden={mode !== "stage"}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Selected work — two linked wheels. Drag or scroll to turn, arrow keys browse, the center link opens the project."
        data-wheels
        data-lenis-prevent
      >
        <div className="hv2__center">
          {(["eyebrow", "title", "chips", "cta"] as const).map((k) => (
            <div key={k} className={`hv2__line hv2__line--${k}`} data-wheels-line={k}>
              {drum(k, 0)}
              {drum(k, 1)}
            </div>
          ))}
        </div>
        <p className="u-sr-only" data-wheels-announce aria-live="polite" />
      </section>


      <div className="hv2__classic container" hidden={mode !== "classic"}>
        <h2 className="hv2__classic-head">Selected work</h2>
        <ul className="hv2__list rowlist">
          {site.projects.map((p) => (
            <li key={p.name}>
              <Row href={p.url} external label={p.name} tags={[{ text: p.collab }, { text: p.year, pill: true }]} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
