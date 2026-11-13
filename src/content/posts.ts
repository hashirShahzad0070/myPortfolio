import { site, type Post } from "./site";

export const posts = site.writing.posts;

/** N° on the folder: the oldest post is 01. */
export const postNum = (p: Post) => posts.length - posts.indexOf(p);
export const postHref = (p: Post) => `/writing/${p.slug}`;
export const postYear = (p: Post) => p.date.split(" ")[2] ?? "";
/** "NOV 11 2026" → "Nov 11" */
export const shortDate = (p: Post) => {
  const [m, d] = p.date.split(" ");
  return `${m[0]}${m.slice(1).toLowerCase()} ${d}`;
};
/** "NOV 11 2026" → "Nov, 11, 2026" */
export const longDate = (p: Post) => {
  const [m, d, y] = p.date.split(" ");
  return `${m[0]}${m.slice(1).toLowerCase()}, ${d}, ${y}`;
};
export const headingId = (text: string) =>
  text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const findPost = (slug: string) => posts.find((p) => p.slug === slug);

/** The flat record the folder shelf draws from. */
export type ShelfPost = {
  title: string;
  href: string;
  date: string;
  cat: string;
  num: number;
  tone: Post["tone"] | null;
  stock: Post["stock"] | null;
  cover: Post["cover"] | null;
  summary: string;
  tldr: string;
  longDate: string;
  excerpt: string;
};

export const shelfPosts = (): ShelfPost[] =>
  posts.map((p) => ({
    title: p.title,
    href: postHref(p),
    date: p.date,
    cat: p.cat,
    num: postNum(p),
    tone: p.tone ?? null,
    stock: p.stock ?? null,
    cover: p.cover ?? null,
    summary: p.summary,
    tldr: p.tldr ?? "",
    longDate: longDate(p),
    excerpt: p.body
      .map((b) => ("p" in b ? b.p : ""))
      .filter(Boolean)
      .join(" ")
      .slice(0, 1400),
  }));
