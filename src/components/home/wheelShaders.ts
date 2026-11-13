/* Shaders for the wheels hero: the image "proof" cards (cloth-like sheet that
   warps with the wheel's speed), and the hover focus ring. */

export const SHEET_WARP = /* glsl */ `
  uniform float uVel;
  uniform float uBend;
  uniform float uJerk;
  uniform float uTrail;
  uniform float uWarp;
  uniform float uPush;
  uniform float uRestWarp;
  uniform float uTravelX;
  uniform float uFocus;
  uniform float uDrift;
  uniform float uArc;
  uniform float uShear;
  uniform float uFlag;
  uniform float uFlagT;
  uniform float uStir;
  uniform float uStirT;
  uniform float uHead;
  uniform float uHead2;
  uniform float uStirOn;
  uniform float uTube;
  uniform float uTubeS;
  uniform float uTubeZ;
  vec3 sheetWarp(vec3 p, vec2 uv) {
    float PI = 3.141592653589793;
    // the stir: the sheet breathing under the hand
    float breath =
      sin(uv.x * PI * 1.3 + uStirT) * sin(uv.y * PI * 1.1 - uStirT * 0.7) * 0.6 +
      sin((uv.x + uv.y) * PI * 1.9 + uStirT * 1.3) * 0.4;
    vec2 q = (uv - 0.5) * 2.0 + vec2(1e-4, 1e-4);
    float t = atan(q.y, q.x) / 6.28318530718 + 0.5;
    float d1 = abs(fract(t - uHead + 0.5) - 0.5);
    float d2 = abs(fract(t + uHead2 + 0.27 + 0.5) - 0.5);
    float rim = smoothstep(0.15, 1.0, max(abs(q.x), abs(q.y)));
    float lift = (exp(-d1 * d1 * 70.0) + 0.5 * exp(-d2 * d2 * 70.0)) * rim;
    p.z += uStir * (breath * 0.8 + lift * uStirOn * 0.3);
    // the flag: free edge ripples while the sheet is in flight
    float mast = uv.x * uv.x;
    p.z += uFlag * mast * (0.6 + 0.4 * sin(uv.y * PI)) *
      (sin(uv.x * PI * 1.4 - uFlagT) * 0.75 + sin(uv.x * PI * 2.6 - uFlagT * 1.5 + uv.y * 2.0) * 0.25);
    // active drift toward centre + the ribbon arc
    p.x += uDrift * uFocus;
    p.z += uArc * sin(uv.x * PI) * (0.35 + 0.65 * uFocus);
    // travel physics: a wave through the cloth, a bow, leading-edge shear
    float w = (uVel + uJerk * 0.5) * uBend;
    p.z += sin(uv.x * PI * 1.6 + uVel * 5.0) * sin(uv.y * PI) * w * 0.9;
    p.z += sin(uv.y * PI) * w * 0.7;
    p.x += (uv.y - 0.5) * uVel * uShear;
    // the trailing edge curls back
    float tv = mix(uv.y, uv.x, uTravelX) - 0.5;
    float behind = clamp(-sign(uVel) * tv * 2.0, 0.0, 1.0);
    p.z -= behind * behind * abs(uVel) * uTrail;
    // in-plane stretch along the travel; centre column leads the corners
    float across = sin(mix(uv.x, uv.y, uTravelX) * PI);
    float along = across * (tv * 2.0 * (abs(uVel) * uWarp + uRestWarp * uFocus) + uVel * uPush);
    if (uTravelX > 0.5) p.x += along; else p.y += along;
    // the tube: edges bow out and the face domes under the hand
    float bx = sin(uv.y * PI), by = sin(uv.x * PI);
    p.x += (uv.x - 0.5) * 2.0 * bx * uTube * uTubeS;
    p.y += (uv.y - 0.5) * 2.0 * by * uTube;
    p.z += bx * by * uTube * uTubeZ;
    return p;
  }
`;

export const CARD_VERT = /* glsl */ `
  ${SHEET_WARP}
  uniform vec2 uSize;
  uniform vec2 uPar;
  uniform float uSheenH;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vVp;
  varying vec3 vLp;
  void main() {
    vUv = uv;
    vec3 p = sheetWarp(position, uv);
    vec2 e = vec2(0.02);
    vec3 xa = sheetWarp(position + vec3(e.x * uSize.x, 0.0, 0.0), uv + vec2(e.x, 0.0));
    vec3 xb = sheetWarp(position - vec3(e.x * uSize.x, 0.0, 0.0), uv - vec2(e.x, 0.0));
    vec3 ya = sheetWarp(position + vec3(0.0, e.y * uSize.y, 0.0), uv + vec2(0.0, e.y));
    vec3 yb = sheetWarp(position - vec3(0.0, e.y * uSize.y, 0.0), uv - vec2(0.0, e.y));
    vN = normalize(normalMatrix * normalize(cross(xa - xb, ya - yb)));
    vec4 vp = modelViewMatrix * vec4(p, 1.0);
    vVp = vp.xyz;
    vLp = (modelViewMatrix * vec4(uPar.x * 0.75 * uSize.x, uPar.y * 0.75 * uSize.x, uSheenH * uSize.y, 1.0)).xyz;
    gl_Position = projectionMatrix * vp;
  }
`;

export const CARD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uInk;
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uImgA;
  uniform float uRestA;
  uniform float uCropY;
  uniform float uFocus;
  uniform float uFish;
  uniform float uDim;
  uniform float uHover;
  uniform float uSheen;
  uniform float uSheenK;
  uniform vec2 uPar;
  uniform float uVel;
  uniform float uStreak;
  uniform float uGrain;
  uniform float uSeed;
  uniform float uReveal;
  uniform float uSoft;
  uniform float uDof;
  uniform float uSpoke;
  uniform float uLamp;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vVp;
  varying vec3 vLp;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    vec2 pos = (vUv - 0.5) * uSize;
    float dist = sdRoundRect(pos, uSize * 0.5, uRadius);
    float aa = fwidth(dist);
    float shape = 1.0 - smoothstep(-aa, aa, dist);
    if (shape < 0.003) discard;
    float cardA = uSize.x / uSize.y;
    // cover-crop the image into the card
    vec2 uv = vUv;
    float sRatio = uRestA / uImgA;
    if (sRatio < 1.0) uv.x = uv.x * sRatio + (1.0 - sRatio) * 0.5;
    else uv.y = uv.y / sRatio + (1.0 - 1.0 / sRatio) * uCropY;
    // hover parallax
    vec2 sh = uPar * 0.013 * uHover;
    uv = 0.5 + (uv - 0.5) * (1.0 - 2.0 * abs(sh)) + sh;
    // lens: a gentle fisheye on the focused proof
    vec2 lensC = vec2(0.5) + uPar * 0.05 * uHover;
    vec2 cc = uv - lensC;
    float k = uFish * uFocus;
    vec2 nearE = vec2(0.5) - abs(lensC - vec2(0.5));
    float dmin = min(nearE.x, nearE.y);
    uv = lensC + cc * (1.0 - k * dot(cc, cc)) / (1.0 - k * dmin * dmin);
    // speed streak (chromatic) + depth-of-field via mip bias
    float s = clamp(uVel * uStreak, -0.02, 0.02);
    vec2 dir = vec2(0.0, 1.0);
    float lod = uSoft * abs(uVel) + uDof * (1.0 - uFocus);
    vec3 col;
    col.r = texture2D(uMap, uv + dir * s, lod).r;
    col.g = texture2D(uMap, uv, lod).g;
    col.b = texture2D(uMap, uv - dir * s, lod).b;
    // proof grid: ink lines that dissolve into the image as it is revealed
    vec2 cells = vec2(floor(cardA * 9.0 + 0.5), 9.0);
    vec2 gp = vUv * cells;
    vec2 gd = abs(fract(gp - 0.5) - 0.5) / fwidth(gp);
    float line = 1.0 - min(min(gd.x, gd.y), 1.0);
    line = max(line, 1.0 - min(abs(dist + 1.5 * aa) / (1.1 * aa), 1.0));
    vec4 m = vec4(uInk, line * 0.72);
    float n = hash(vUv * 9.7 + uSeed * 3.1);
    float reveal = smoothstep(n - 0.12, n + 0.12, uReveal * 1.24 - 0.12);
    col = mix(m.rgb, col, reveal);
    col += (hash(vUv * 617.0 + uSeed) - 0.5) * uGrain;
    // dim off-focus proofs; the lamp falls off around the wheel
    col *= mix(1.0 - uDim, 1.0, uFocus);
    float lit = cos(clamp(uSpoke, -3.14159, 3.14159)) * 0.5 + 0.5;
    col *= mix(1.0 - uLamp, 1.0, lit);
    // sheen under the hand
    vec3 N = normalize(vN);
    vec3 V = normalize(-vVp);
    vec3 L = normalize(vLp - vVp);
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float ndv = max(dot(N, V), 0.0);
    float pool = pow(ndh, uSheenK) * 0.75 + pow(ndh, uSheenK * 4.0) * 0.35;
    float glaze = pow(1.0 - ndv, 4.0) * 0.5;
    col = mix(col, vec3(1.0), clamp((pool + glaze) * uSheen, 0.0, 1.0));
    float a = shape * mix(m.a, 1.0, reveal);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

export const RING_VERT = /* glsl */ `
  ${SHEET_WARP}
  uniform vec2 uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec2 cuv = 0.5 + position.xy / uSize;
    vec3 p = sheetWarp(position, cuv);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const RING_FRAG = /* glsl */ `
  uniform vec2 uHalf;
  uniform float uR;
  uniform float uW;
  uniform float uOn;
  uniform float uHead;
  uniform float uHead2;
  uniform float uBase;
  uniform float uCur;
  uniform float uShine;
  uniform vec3 uColor;
  varying vec2 vP;
  float sdRR(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = sdRR(vP, uHalf, uR);
    float aa = fwidth(d);
    float band = 1.0 - smoothstep(uW, uW + aa, abs(d));
    float glow = exp(-(d * d) / (uW * uW * 16.0)) * 0.3;
    vec2 q = vP / (uHalf + uR);
    float t = atan(q.y, q.x) / 6.28318530718 + 0.5;
    float d1 = abs(fract(t - uHead + 0.5) - 0.5);
    float head = exp(-d1 * d1 * 240.0);
    float d2 = abs(fract(t + uHead2 + 0.27 + 0.5) - 0.5);
    float spot = exp(-d2 * d2 * 55.0) * 0.28;
    float d3 = abs(fract(t - uCur + 0.5) - 0.5);
    float shine = exp(-d3 * d3 * 48.0) * uShine;
    float a = (band + glow) * (uBase + head + spot + shine) * uOn;
    gl_FragColor = vec4(uColor * a, a);
  }
`;
