import * as THREE from "three";
import gsap from "gsap";

/* The desk under the contact letter: an orthographic WebGL scene (pixel units)
   holding the bond sheet, the thermal intake stub, a paperclip and the foil
   letterhead mark, lit by a desk lamp that follows the cursor. The HTML form
   sits on top, transparent, in exactly the same place. */

const BOND = "#f3f2ef", THERMAL = "#f7f7f4";
const T = { lamp: 0.2, lampD: 460, ambient: 0.94, shadow: 0.4, tooth: 1, foil: 0.3, par: 1 };
const TOP = 116, BOTTOM = 132;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Layout = { vw: number; narrow: boolean; sx: number; sy: number; sw: number; sh: number; tx: number; ty: number; tw: number; th: number; stageH: number };

function measure(desk: HTMLElement, sheet: HTMLElement): Layout {
  const vw = desk.clientWidth, narrow = vw < 760;
  const sw = narrow ? vw - 32 : Math.round(Math.min(Math.max(vw * 0.56, 560), 800));
  sheet.style.width = `${sw}px`;
  const sh = sheet.offsetHeight;
  const tw = narrow ? Math.min(sw, 300) : Math.round(sw * 0.34), th = Math.round(tw * 1.04);
  if (narrow) {
    const ty = TOP + sh + 40;
    return { vw, narrow, sx: 16, sy: TOP, sw, sh, tx: Math.round((vw - tw) / 2), ty, tw, th, stageH: ty + th + BOTTOM };
  }
  const over = Math.round(tw * 0.45), sx = Math.round((vw - (sw + over)) / 2);
  return { vw, narrow, sx, sy: TOP, sw, sh, tx: sx + sw - (tw - over), ty: 94, tw, th, stageH: TOP + sh + BOTTOM };
}

const PAPER_GLSL = /* glsl */ `
  float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x),
               mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float pFbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * pNoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float paperH(vec2 px, float seed){ return pFbm(px * 0.010 + seed) * 0.62 + pFbm(px * 0.038 + seed * 2.1) * 0.38; }
  float paperT(vec2 px, float seed){ return pNoise(px * 0.42 + seed * 3.7) * 0.65 + pNoise(px * 0.95 + seed * 5.3) * 0.35; }
`;

/** Paper stock: lit standard material with grain, flecks and a normal-mapped tooth. */
function paperMaterial(o: { color: string; seed: number; grain?: number; tooth?: number; alphaMap?: THREE.Texture }) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color), roughness: 0.96, metalness: 0, ...(o.alphaMap ? { alphaMap: o.alphaMap, transparent: true } : {}) });
  m.defines = { ...(m.defines ?? {}), USE_UV: "" };
  const px = { value: new THREE.Vector2(600, 800) }, tooth = { value: o.tooth ?? 1 };
  m.userData.px = px;
  m.userData.tooth = tooth;
  m.onBeforeCompile = (s) => {
    s.uniforms.uPx = px;
    s.uniforms.uSeed = { value: o.seed };
    s.uniforms.uGrain = { value: o.grain ?? 1 };
    s.uniforms.uTooth = tooth;
    s.fragmentShader = s.fragmentShader
      .replace("void main() {", `uniform vec2 uPx; uniform float uSeed; uniform float uGrain; uniform float uTooth;\n${PAPER_GLSL}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 pPx = vUv * uPx;
        float pH = paperH(pPx, uSeed);
        diffuseColor.rgb *= 1.0 + (pH - 0.5) * 0.055 * uGrain;
        float fleck = pHash(floor(pPx * 0.7) + uSeed);
        diffuseColor.rgb *= mix(1.0, 0.9, step(0.9990, fleck) * uGrain);`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        {
          float e = 1.0;
          float t0 = paperT(pPx, uSeed);
          float tx = paperT(pPx + vec2(e, 0.0), uSeed);
          float ty = paperT(pPx + vec2(0.0, e), uSeed);
          float f0 = paperH(pPx, uSeed);
          float fx = paperH(pPx + vec2(6.0, 0.0), uSeed);
          float fy = paperH(pPx + vec2(0.0, 6.0), uSeed);
          vec2 g = vec2((t0 - tx) * 2.2 + (f0 - fx) * 0.8, (t0 - ty) * 2.2 + (f0 - fy) * 0.8);
          normal = normalize(normal + vec3(g * uTooth, 0.0));
        }`);
  };
  const key = `letter-paper|${o.alphaMap ? "a" : "o"}`;
  m.customProgramCacheKey = () => key;
  return m;
}

/** Soft lift shadow: a blurred rounded rect. */
function shadowTexture(aspect: number) {
  const h = Math.round(512 * aspect), c = document.createElement("canvas");
  c.width = 512; c.height = h;
  const ctx = c.getContext("2d")!, k = 1.4;
  ctx.filter = "blur(20px)";
  ctx.fillStyle = "rgba(15,15,15,0.95)";
  ctx.beginPath(); ctx.roundRect((512 - 512 / k) / 2, (h - h / k) / 2, 512 / k, h / k, 4); ctx.fill();
  return new THREE.CanvasTexture(c);
}

/** Alpha for the stub: a zigzag tear along its top edge. */
function tearTexture(aspect: number) {
  const h = Math.round(512 * aspect), c = document.createElement("canvas");
  c.width = 512; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, h);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, 10);
  for (let e = 0; e <= 42; e++) ctx.lineTo((e / 42) * 512, e % 2 ? 0 : 11);
  ctx.lineTo(512, h); ctx.closePath(); ctx.fill();
  return new THREE.CanvasTexture(c);
}

/** The letterhead monogram for the foil stamp (circle + capsule, like the logo). */
function foilTexture(initials: [string, string]) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const ctx = c.getContext("2d")!;
  const sans = getComputedStyle(document.documentElement).getPropertyValue("--font-geist").trim() || "system-ui, sans-serif";
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(112, 128, 96, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(232, 32, 192, 192, 96); ctx.stroke();
  ctx.font = `500 122px ${sans}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(initials[0], 112, 132);
  ctx.fillText(initials[1], 328, 132);
  return new THREE.CanvasTexture(c);
}

function studioEnv() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#7a7c80"); g.addColorStop(0.5, "#3e3f42"); g.addColorStop(1, "#1a1b1d");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(150, 40, 300, 150); ctx.fillRect(620, 70, 60, 210);
  ctx.fillStyle = "#55555b"; ctx.fillRect(760, 120, 190, 130);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Desk = { dispose(): void; strike(): void };

export function createDesk(desk: HTMLElement, canvas: HTMLCanvasElement, sheet: HTMLElement, stub: HTMLElement, initials: [string, string]): Desk | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  cam.position.z = 100;
  const envSrc = studioEnv();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(envSrc);
  const PI = Math.PI;
  const ambient = new THREE.AmbientLight(0xffffff, T.ambient * PI);
  scene.add(ambient);
  const lamp = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(lamp);
  const sky = new THREE.DirectionalLight(0xffffff, 0.1 * PI);
  sky.position.set(-0.5, 0.6, 1);
  scene.add(sky);
  lamp.intensity = T.lamp * PI * T.lampD * T.lampD;

  // the sheet + its lift shadow
  const sheetMat = paperMaterial({ color: BOND, seed: 3.1, tooth: T.tooth });
  sheetMat.transparent = true;
  const sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMat);
  const shadowTex = shadowTexture(1.3);
  const sheetShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: T.shadow, depthWrite: false });
  const sheetShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetShadowMat);
  const sheetG = new THREE.Group();
  sheetG.add(sheetShadow, sheetMesh);
  scene.add(sheetG);

  // the stub + shadow + paperclip
  const tear = tearTexture(1.04);
  const stubMat = paperMaterial({ color: THERMAL, seed: 11.7, grain: 0.45, tooth: 0.35, alphaMap: tear });
  const stubMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), stubMat);
  const stubShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: T.shadow * 0.8, depthWrite: false });
  const stubShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), stubShadowMat);
  const stubG = new THREE.Group();
  stubG.add(stubShadow, stubMesh);
  scene.add(stubG);
  const wire = new THREE.MeshStandardMaterial({ color: 0xd6d8db, metalness: 0.8, roughness: 0.38, envMap: env.texture, envMapIntensity: 1.6 });
  const clipPts = [[22, 66], [22, 12], [20, 5], [14, 1], [7, 4], [4, 11], [4, 56], [6, 63], [11, 67], [16, 63], [18, 56], [18, 16], [16, 12], [12, 10], [9, 12], [8, 17], [8, 48]]
    .map(([x, y]) => new THREE.Vector3(x, -y, 0));
  const clipGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(clipPts, false, "catmullrom", 0.35), 140, 1.5, 10, false);
  const clip = new THREE.Mesh(clipGeo, wire);
  stubG.add(clip);

  // the foil-stamped letterhead mark
  const foilTex = foilTexture(initials);
  const foil = new THREE.MeshStandardMaterial({
    color: 0xd9d9dc, metalness: 0.85, roughness: T.foil, envMap: env.texture, envMapIntensity: 1.6,
    alphaMap: foilTex, bumpMap: foilTex, bumpScale: 1.6, transparent: true, alphaTest: 0.02,
  });
  const foilMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), foil);
  sheetG.add(foilMesh);
  const markEl = sheet.querySelector<HTMLElement>("[data-letter-mark]");

  const put = (m: THREE.Object3D, x: number, y: number, w: number, h: number, z: number) => {
    m.position.set(x + w / 2, -(y + h / 2), z);
    m.scale.set(w, h, 1);
  };

  let L = measure(desk, sheet);
  let W = 1, H = 1;
  const shadowScale = new THREE.Vector3(1, 1, 1);
  const sheetAnim = { y: 0, lift: 0, press: 1 };
  const stubDrop = { y: 0 };
  const par = { x: 0, y: 0 };

  const layout = () => {
    L = measure(desk, sheet);
    W = L.vw; H = L.stageH;
    desk.style.height = `${H}px`;
    renderer.setSize(W, H, false);
    cam.left = 0; cam.right = W; cam.top = 0; cam.bottom = -H;
    cam.updateProjectionMatrix();
    sheet.style.left = `${L.sx}px`; sheet.style.top = `${L.sy}px`;
    stub.style.left = `${L.tx}px`; stub.style.top = `${L.ty}px`;
    stub.style.width = `${L.tw}px`; stub.style.height = `${L.th}px`;
    put(sheetMesh, L.sx, L.sy, L.sw, L.sh, 0);
    (sheetMat.userData.px.value as THREE.Vector2).set(L.sw, L.sh);
    put(sheetShadow, L.sx - L.sw * 0.06, L.sy - L.sh * 0.05 + 8, L.sw * 1.12, L.sh * 1.1, -2);
    shadowScale.copy(sheetShadow.scale);
    put(stubMesh, L.tx, L.ty, L.tw, L.th, 4);
    (stubMat.userData.px.value as THREE.Vector2).set(L.tw, L.th);
    put(stubShadow, L.tx - L.tw * 0.07, L.ty - L.th * 0.06 + 6, L.tw * 1.14, L.th * 1.12, 3);
    clip.visible = !L.narrow;
    const k = Math.max(0.9, L.sw / 720);
    clip.position.set(L.tx + 6, -(L.ty + 4), 7);
    clip.scale.set(k, k, k);
    if (markEl) {
      const r = markEl.getBoundingClientRect(), d = desk.getBoundingClientRect();
      const w = r.width, h = r.width / 2;
      put(foilMesh, r.left - d.left, r.top - d.top - sheetAnim.y + (r.height - h) / 2, w, h, 1);
    }
  };
  layout();
  const ro = new ResizeObserver(() => layout());
  ro.observe(sheet);
  ro.observe(desk);

  const ac = new AbortController();
  const signal = ac.signal;
  const ptr = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35 };
  addEventListener("pointermove", (e) => {
    const r = desk.getBoundingClientRect();
    ptr.tx = (e.clientX - r.left) / Math.max(1, r.width);
    ptr.ty = (e.clientY - r.top) / Math.max(1, r.height);
  }, { signal, passive: true });
  let hidden = document.hidden;
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; }, { signal });

  // the sheet's HTML is clipped where the stub lies over it
  let clipPath = "";
  const clipSheet = () => {
    if (L.narrow) { if (clipPath) { sheet.style.clipPath = ""; clipPath = ""; } return; }
    const x = Math.round(L.tx - L.sx + par.x - 8);
    const y = Math.round(L.ty + L.th - L.sy + par.y + stubDrop.y - sheetAnim.y + 6);
    const p = `polygon(0 0, ${x}px 0, ${x}px ${y}px, 100% ${y}px, 100% 100%, 0 100%)`;
    if (p !== clipPath) { sheet.style.clipPath = p; clipPath = p; }
  };

  const tick = () => {
    if (hidden) return;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    lamp.position.set(ptr.x * W, -(ptr.y * H), T.lampD);
    if (!L.narrow && T.par > 0) {
      const s = Math.tanh(scrollY / 600) * 14;
      const tx = (-(ptr.x - 0.5) * 12 - s * 0.2) * T.par, ty = (-(ptr.y - 0.5) * 8 - s) * T.par;
      par.x += (tx - par.x) * 0.08; par.y += (ty - par.y) * 0.08;
    } else { par.x += (0 - par.x) * 0.08; par.y += (0 - par.y) * 0.08; }
    const sy = par.y + stubDrop.y;
    stubG.position.set(par.x, -sy, 0);
    stub.style.translate = `${par.x.toFixed(2)}px ${sy.toFixed(2)}px`;
    sheetG.position.y = -sheetAnim.y;
    sheet.style.translate = sheetAnim.y ? `0 ${sheetAnim.y.toFixed(2)}px` : "";
    const k = (1 + sheetAnim.lift * 0.1) * sheetAnim.press;
    sheetShadow.scale.set(shadowScale.x * k, shadowScale.y * k, 1);
    clipSheet();
    renderer.render(scene, cam);
  };
  gsap.ticker.add(tick);

  let entered = false;
  const shadowFor = () => T.shadow * (document.documentElement.getAttribute("data-theme") === "dark" ? 1.3 : 1);
  const retheme = () => {
    if (!entered && !reduced()) return;
    sheetShadowMat.opacity = shadowFor();
    stubShadowMat.opacity = shadowFor() * 0.8;
  };
  retheme();
  const mo = new MutationObserver(retheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ruled lines draw across the letter body
  const rulesEl = sheet.querySelector<HTMLElement>("[data-letter-rules]");
  const rules: { v: number }[] = [];
  const paintRules = () => { if (rulesEl) rulesEl.style.backgroundSize = rules.map((r) => `${(r.v * 100).toFixed(2)}% 1px`).join(","); };
  const armRules = () => {
    if (!rulesEl) return;
    const n = Math.max(6, Math.round(rulesEl.offsetHeight / 30));
    rules.length = 0;
    for (let i = 0; i < n; i++) rules.push({ v: 0 });
    rulesEl.style.backgroundImage = rules.map(() => "linear-gradient(var(--prule), var(--prule))").join(",");
    rulesEl.style.backgroundRepeat = "no-repeat";
    rulesEl.style.backgroundPosition = rules.map((_, i) => `0 ${29 + 30 * i}px`).join(",");
    paintRules();
  };
  const releaseRules = () => {
    if (!rulesEl) return;
    rulesEl.style.backgroundImage = ""; rulesEl.style.backgroundSize = "";
    rulesEl.style.backgroundRepeat = ""; rulesEl.style.backgroundPosition = "";
  };

  const tl = gsap.timeline({ paused: true });
  const arm = () => {
    armRules();
    sheetMat.opacity = 0; sheetShadowMat.opacity = 0; stubShadowMat.opacity = 0; foil.opacity = 0;
    stubDrop.y = L.narrow ? -60 : -(L.ty + L.th + 24);
    sheetAnim.y = Math.max(260, Math.round(innerHeight * 0.5));
    sheetAnim.lift = 1;
  };
  const enter = () => {
    if (entered) return;
    entered = true;
    const s = shadowFor();
    tl.to(sheetMat, { opacity: 1, duration: 0.45, ease: "power2.out" }, 0)
      .to(sheetAnim, { y: 0, duration: 2.4, ease: "expo.out" }, 0)
      .to(sheetAnim, { lift: 0, duration: 2, ease: "expo.out" }, 0.3)
      .to(sheetShadowMat, { opacity: s, duration: 1.2, ease: "expo.out" }, 0)
      .to(foil, { opacity: 1, duration: 0.7, ease: "power2.out" }, 0.3)
      .to(stubDrop, { y: 0, duration: 1.4, ease: "expo.out" }, 0.8)
      .to(stubShadowMat, { opacity: s * 0.8, duration: 0.7, ease: "power2.out" }, 1.05)
      .call(() => { sheetMat.transparent = false; sheetMat.needsUpdate = true; }, [], 2.6);
    if (rules.length) {
      const st = 0.07;
      tl.to(rules, { v: 1, duration: 1.4, ease: "expo.out", stagger: st, onUpdate: paintRules }, 0.8)
        .call(releaseRules, [], 0.8 + st * (rules.length - 1) + 1.45);
    }
    tl.play();
  };
  if (!reduced()) {
    arm();
    requestAnimationFrame(() => {
      if (document.documentElement.hasAttribute("data-veil")) document.addEventListener("veil:reveal", enter, { once: true, signal });
      else enter();
    });
  } else entered = true;
  const failsafe = setTimeout(enter, 4000);

  return {
    strike() {
      gsap.to(sheetAnim, { press: 0.985, duration: 0.09, yoyo: true, repeat: 1, ease: "power2.inOut" });
      gsap.fromTo(sheetShadowMat, { opacity: sheetShadowMat.opacity * 0.6 }, { opacity: sheetShadowMat.opacity, duration: 0.6, ease: "expo.out" });
    },
    dispose() {
      clearTimeout(failsafe);
      tl.kill();
      gsap.ticker.remove(tick);
      ac.abort();
      ro.disconnect();
      mo.disconnect();
      releaseRules();
      [shadowTex, tear, foilTex, envSrc].forEach((t) => t.dispose());
      env.texture.dispose();
      pmrem.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
      [sheetMat, sheetShadowMat, stubMat, stubShadowMat, wire, foil].forEach((m) => m.dispose());
      // dispose only: the canvas is reused if the component remounts, so its context must stay alive
      renderer.dispose();
      desk.style.height = "";
      sheet.style.clipPath = ""; sheet.style.translate = ""; sheet.style.width = ""; sheet.style.left = ""; sheet.style.top = "";
      stub.style.translate = ""; stub.style.left = ""; stub.style.top = ""; stub.style.width = ""; stub.style.height = "";
    },
  };
}
