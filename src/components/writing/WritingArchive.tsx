"use client";

import { useState } from "react";
import { site } from "@/content/site";
import { postHref, postYear, posts, shortDate } from "@/content/posts";
import { Row } from "../ui";

/** The plain archive: shown when the shelf can't run (no WebGL, or reduced motion). */
export function WritingArchive() {
  const [cat, setCat] = useState("all");
  const years = [...new Set(posts.map(postYear))].sort().reverse();
  const cats = ["all", ...site.writing.categories];

  return (
    <>
      {years.map((year) => {
        const list = posts.filter((p) => postYear(p) === year && (cat === "all" || p.cat === cat));
        return (
          <section className="writing__archive" key={year} aria-label={`${year} articles`}>
            <h2 className="section-label section-label--lg">{year}<span className="section-label__mark" aria-hidden="true"> ::</span></h2>
            <div className="writing__filters" role="tablist" aria-label="Filter articles by category">
              {cats.map((c) => (
                <button key={c} className="writing__filter text-label" type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}>
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
            <div className="writing__card">
              {list.map((p) => (
                <Row key={p.slug} href={postHref(p)} label={p.title} tags={[{ text: shortDate(p) }, { text: year, pill: true }, { text: p.cat }]} />
              ))}
              {list.length === 0 && <p className="writing__empty text-meta" aria-live="polite">Nothing filed here yet</p>}
            </div>
          </section>
        );
      })}
    </>
  );
}
