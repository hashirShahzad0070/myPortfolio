/* Paper ground shaders: a scanned-paper stock (grain, felt, crumple under raking light,
   pressure streaks, fold creases, scanner edge) printed through a 45-degree halftone screen,
   plus a pointer "wake" trail that prints as a dot plume. */

export const PAPER_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const PAPER_SIM = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec2 uSplat;
uniform vec2 uDir;
uniform vec2 uShift;
uniform float uForce;
uniform float uRadius;
uniform float uAspect;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 puv = uv - uShift;
  float c = texture(uPrev, puv).r;
  float n = texture(uPrev, puv + vec2(uTexel.x, 0.0)).r
          + texture(uPrev, puv - vec2(uTexel.x, 0.0)).r
          + texture(uPrev, puv + vec2(0.0, uTexel.y)).r
          + texture(uPrev, puv - vec2(0.0, uTexel.y)).r;
  float v = mix(c, n * 0.25, 0.6) * 0.94;
  vec2 d = (uv - uSplat) * vec2(uAspect, 1.0);
  d -= uDir * dot(d, uDir) * 0.65;
  float r = uRadius * (1.0 + uForce * 1.5);
  v += uForce * exp(-dot(d, d) / (r * r));
  outColor = vec4(min(v, 1.0), 0.0, 0.0, 1.0);
}`;

export const PAPER_MAIN = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uScroll;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uHi;
uniform float uStrength;
uniform sampler2D uTrail;
uniform vec2 uTrailTexel;
uniform vec2 uMouse;
uniform vec4 uA;
uniform vec4 uB;
uniform vec4 uC;
uniform vec4 uD;
uniform vec4 uE;
uniform float uAlive;
uniform float uDim;
uniform vec4 uR0;
uniform vec4 uR1;
uniform vec4 uR2;
uniform vec4 uR3;
uniform vec4 uR4;
uniform vec4 uR5;
out vec4 outColor;
float ringE(vec4 rr, vec2 p, float asp) {
  if (rr.w < 0.001) return 0.0;
  vec2 dd = (p - rr.xy) * vec2(asp, 1.0);
  float r = length(dd);
  float e = (r - rr.z) / 0.05;
  float front = exp(-e * e);
  float behind = rr.z - r;
  float tail = smoothstep(0.28, 0.0, behind) * step(0.0, behind) * 0.14;
  return (front + tail) * rr.w;
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = r * p * 2.03;
    a *= 0.5;
  }
  return v;
}
float fbm2(vec2 p) {
  return vnoise(p) * 0.5 + vnoise(mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03) * 0.25 + 0.125;
}
float fbm3(vec2 p) {
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  float v = vnoise(p) * 0.5;
  p = r * p * 2.03;
  v += vnoise(p) * 0.25;
  p = r * p * 2.03;
  return v + vnoise(p) * 0.125 + 0.0625;
}
float creaseInk(float t) {
  return exp(-abs(t) / 1.4) * 0.085 + exp(-max(t, 0.0) / 26.0) * 0.03;
}
float creaseHi(float t) {
  return exp(-max(-t, 0.0) / 7.0) * 0.05;
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 vp = px / uRes;
  float asp = uRes.x / uRes.y;
  float T = 0.0;
  vec2 tg = vec2(0.0);
  if (uAlive > 0.5) {
    T = texture(uTrail, vp).r;
    tg = vec2(
      texture(uTrail, vp + vec2(uTrailTexel.x, 0.0)).r - T,
      texture(uTrail, vp + vec2(0.0, uTrailTexel.y)).r - T
    );
  }
  vec2 sp = vec2(vp.x * asp, vp.y + uScroll / uRes.y);
  sp += (uMouse - 0.5) * vec2(asp, 1.0) * uC.w;
  sp += tg * uC.x;
  if (uE.z > 0.0001) {
    sp += (vec2(vnoise(sp * 2.3 + uE.w), vnoise(sp * 2.3 + uE.w + 7.0)) - 0.5) * uE.z;
  }
  float d = 0.0;
  float tonal = 0.0;
  float hi = 0.0;
  d += (fbm2(sp * 900.0) - 0.5) * uA.x;
  d += (hash(px * 1.013) - 0.5) * 0.022;
  d += (fbm3(sp * 46.0) - 0.5) * uA.y;
  float H = fbm3(sp * 4.6);
  vec2 g = vec2(dFdx(H), dFdy(H)) * uRes.y;
  vec2 L = normalize(vec2(0.6, 0.8));
  tonal += dot(L, g) * uA.z;
  tonal += dot(L, tg) * uC.y;
  tonal += T * uD.w * 0.14;
  hi += T * uC.z;
  d += (hash(px * 2.31) - 0.5) * T * uD.w * 0.25;
  if (uAlive > 0.5) {
    float wpitch = uD.y * uE.y;
    mat2 R45 = mat2(0.7071, 0.7071, -0.7071, 0.7071);
    vec2 wp = (R45 * (sp * uRes.y)) / wpitch;
    vec2 cid = floor(wp);
    vec2 cc = fract(wp) - 0.5;
    vec2 dl = (((cid + 0.5) * wpitch) * R45) / uRes.y - sp;
    dl.x /= asp;
    vec2 cvp = clamp(vp + dl, 0.0, 1.0);
    float Tc = texture(uTrail, cvp).r;
    Tc += ringE(uR0, cvp, asp) + ringE(uR1, cvp, asp) + ringE(uR2, cvp, asp)
        + ringE(uR3, cvp, asp) + ringE(uR4, cvp, asp) + ringE(uR5, cvp, asp);
    float on = step(hash(cid + 0.7) * 0.85 + 0.06, Tc);
    d += on * smoothstep(0.36, 0.27, length(cc)) * uE.x;
  }
  vec2 fpx = floor(sp * uRes.y * 0.5);
  float f1 = hash(fpx + 3.7);
  float f2 = hash(fpx + 9.1);
  d += step(0.9985, f1) * uD.z * 0.5;
  hi += step(0.9993, f2) * uD.z;
  float r1 = 1.0 - abs(2.0 * vnoise(vec2(sp.x * 1.3, sp.y * 15.0)) - 1.0);
  mat2 R = mat2(0.966, 0.259, -0.259, 0.966);
  vec2 rp = R * sp;
  float r2 = 1.0 - abs(2.0 * vnoise(vec2(rp.x * 17.0, rp.y * 1.5)) - 1.0);
  d += smoothstep(0.963, 1.0, r1) * uA.w;
  d += smoothstep(0.963, 1.0, r2) * uB.x;
  float s = fbm3(sp * 1.1 + 17.0);
  float stain = pow(smoothstep(0.62, 1.0, s), 2.0);
  tonal += stain * uB.y;
  float fy = sp.y - (0.34 + 0.012 * sin(sp.x * 2.1) + 0.014 * (vnoise(vec2(sp.x * 3.0, 7.3)) - 0.5));
  float fy2 = sp.y - (0.71 + 0.010 * sin(sp.x * 1.7 + 2.0) + 0.014 * (vnoise(vec2(sp.x * 2.8, 12.9)) - 0.5));
  float fx = sp.x - (0.56 * asp + 0.010 * sin(sp.y * 2.7) + 0.012 * (vnoise(vec2(sp.y * 3.2, 3.1)) - 0.5));
  d += creaseInk(fy * uRes.y) * uB.z;
  hi += creaseHi(fy * uRes.y) * uB.z;
  d += creaseInk(fy2 * uRes.y) * 0.85 * uB.z;
  hi += creaseHi(fy2 * uRes.y) * 0.85 * uB.z;
  d += creaseInk(fx * uRes.y) * 0.6 * uB.z;
  hi += creaseHi(fx * uRes.y) * 0.6 * uB.z;
  vec2 rim = min(vp, 1.0 - vp) * uRes;
  d += exp(-min(min(rim.x, rim.y), 90.0) / 30.0) * 0.05 * uB.w;
  tonal += smoothstep(0.55, 0.95, distance(vp, vec2(0.5, 0.5))) * 0.04 * uB.w;
  float tone = clamp(0.5 + tonal * 9.0, 0.0, 1.0);
  vec2 hp = mat2(0.7071, 0.7071, -0.7071, 0.7071) * (sp * uRes.y) / uD.y;
  float cellD = length(fract(hp) - 0.5);
  float dotR = mix(0.08, 0.66, tone);
  float ht = smoothstep(dotR + 0.16, dotR - 0.16, cellD);
  float amp = (0.18 + 0.82 * smoothstep(0.0, 0.14, abs(tone - 0.5))) * uD.x;
  d += mix(tonal, (ht - 0.5) * 0.16, amp);
  float inkAmt = clamp(max(d, 0.0) * uStrength, 0.0, 0.35);
  float hiAmt = clamp((max(-d, 0.0) + hi) * uStrength, 0.0, 0.3);
  vec3 col = mix(uPaper, uInk, inkAmt);
  col = mix(col, uHi, hiAmt);
  col *= 1.0 - uDim;
  col += (hash(px * 1.7) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
