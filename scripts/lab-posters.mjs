// Builds the Lab posters: one 960×720 SVG per tool in public/lab/<slug>.svg.
// Logos come from Devicon (MIT) in scripts/lab-icons. Run: node scripts/lab-posters.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = readFileSync(join(root, "src/content/site.ts"), "utf8");
const lab = site.slice(site.indexOf("lab: ["), site.indexOf("] as LabItem[]"));
const items = [...lab.matchAll(/slug: "([^"]+)", name: "([^"]+)", group: "([^"]+)".*?tint: "([^"]+)"/g)].map((m) => ({
  slug: m[1], name: m[2], group: m[3], tint: m[4],
}));

// slug → Devicon file (or a hand-drawn glyph below)
const ICON = { "react-native": "react", "scikit-learn": "scikitlearn", "github-actions": "githubactions", websockets: "socketio", dotnet: "dotnetcore", cpp: "cplusplus" };
// logos printed in black: knocked out to white on the dark tile
const KNOCKOUT = new Set(["express", "flask", "github", "nextjs", "socketio", "vercel"]);

const GLYPHS = {
  rest: `<svg viewBox="0 0 128 128"><g fill="none" stroke="#c9d1ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 22c-12 0-14 6-14 16v14c0 8-4 12-12 12 8 0 12 4 12 12v14c0 10 2 16 14 16"/>
    <path d="M84 22c12 0 14 6 14 16v14c0 8 4 12 12 12-8 0-12 4-12 12v14c0 10-2 16-14 16"/></g>
    <g fill="#c9d1ff"><circle cx="52" cy="64" r="5"/><circle cx="64" cy="64" r="5"/><circle cx="76" cy="64" r="5"/></g></svg>`,
  realtime: `<svg viewBox="0 0 128 128"><path d="M8 68h26l10-26 16 52 14-40 8 14h38" fill="none" stroke="#ff6a4d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="112" cy="68" r="9" fill="#ff6a4d"/><circle cx="112" cy="68" r="17" fill="none" stroke="#ff6a4d" stroke-opacity=".35" stroke-width="4"/></svg>`,
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const logo = (slug) => {
  if (GLYPHS[slug]) return GLYPHS[slug];
  const file = ICON[slug] ?? slug;
  const src = readFileSync(join(root, "scripts/lab-icons", `${file}.svg`), "utf8");
  const viewBox = src.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 128 128";
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // scope the logo's own ids so they can't collide with the poster's
  const scoped = inner.replace(/id="([^"]+)"/g, `id="${file}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${file}-$1)`).replace(/href="#([^"]+)"/g, `href="#${file}-$1"`);
  // scikit-learn's "learn" wordmark is near-black: print it light instead
  // .NET's lettering is cut out of its disc: back it with paper so it reads light on the dark tile
  const tuned = file === "scikitlearn" ? scoped.replace(/#010101/gi, "#f2f1ee")
    : file === "dotnetcore" ? `<circle cx="64" cy="64" r="60" fill="#f2f1ee"/>${scoped}` : scoped;
  const fx = KNOCKOUT.has(file) ? ` filter="url(#knock)"` : "";
  return `<svg viewBox="${viewBox}"><g${fx}>${tuned}</g></svg>`;
};

mkdirSync(join(root, "public/lab"), { recursive: true });
items.forEach((it, i) => {
  const n = String(i + 1).padStart(2, "0");
  const mark = logo(it.slug).replace("<svg ", `<svg x="330" y="190" width="300" height="300" `);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720" width="960" height="720">
<defs>
  <radialGradient id="glow" cx="50%" cy="47%" r="58%"><stop offset="0" stop-color="#fff" stop-opacity=".13"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.1" fill="#fff" fill-opacity=".07"/></pattern>
  <filter id="knock"><feColorMatrix type="matrix" values="-1 0 0 0 0.95  0 -1 0 0 0.95  0 0 -1 0 0.93  0 0 0 1 0"/></filter>
</defs>
<rect width="960" height="720" fill="${it.tint}"/>
<rect width="960" height="720" fill="url(#dots)"/>
<rect width="960" height="720" fill="url(#glow)"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="20" letter-spacing="1.5" fill="#f2f1ee">
  <text x="48" y="66" fill-opacity=".55">LAB:: N°${n}</text>
  <text x="912" y="66" text-anchor="end" fill-opacity=".55">${esc(it.group.toUpperCase())}</text>
  <rect x="48" y="88" width="864" height="1.5" fill-opacity=".12"/>
  <rect x="48" y="630" width="864" height="1.5" fill-opacity=".12"/>
  <text x="912" y="676" text-anchor="end" fill-opacity=".55">STACK</text>
</g>
<text x="48" y="680" font-family="Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="500" letter-spacing="-.5" fill="#f2f1ee">${esc(it.name)}</text>
${mark}
</svg>
`;
  writeFileSync(join(root, "public/lab", `${it.slug}.svg`), svg);
});
console.log(`wrote ${items.length} posters to public/lab/`);
