import type { Metadata } from "next";
import { site } from "@/content/site";
import { WritingArchive } from "@/components/writing/WritingArchive";
import { ShelfBinder } from "@/components/writing/ShelfBinder";

export const metadata: Metadata = { title: "Writing" };

export default function WritingPage() {
  return (
    <main className="writing">
      {/* The WebGL shelf binds to this stage; without WebGL (or with reduced motion) the classic list stays. */}
      <section
        className="wstage"
        data-folders
        data-lenis-prevent
        hidden
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Writing — a shelf of post folders. Arrow keys browse, Enter opens."
      >
        <div className="wstage__ui container">
          <div className="wstage__info">
            {/* a plain anchor: the shelf rewrites its href to the front folder's post */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="wstage__info-btn" data-folders-title href="/writing" aria-describedby="wstage-tip wstage-excerpt">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 7.2v3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="8" cy="5" r=".8" fill="currentColor" />
              </svg>
            </a>
            <div className="wstage__tip" id="wstage-tip" role="tooltip" aria-live="polite">
              <p className="wstage__tip-title" data-folders-tip-title />
              <div className="wstage__tip-tags">
                <span className="chip text-meta" data-folders-chip-date />
                <span className="chip text-meta chip--pill" data-folders-chip-year />
                <span className="chip text-meta" data-folders-chip-cat />
              </div>
            </div>
            <p className="u-sr-only" id="wstage-excerpt" data-folders-excerpt />
          </div>
        </div>
      </section>

      <div className="writing__classic container" data-folders-classic>
        <div className="writing__col">
          <header className="writing__intro">
            <h1 className="section-label section-label--lg">Writing<span className="section-label__mark" aria-hidden="true"> ::</span></h1>
            <div className="writing__prose">
              {site.writing.intro.map((p, i) => <p key={i} className="text-lead">{p}</p>)}
            </div>
          </header>
          <WritingArchive />
        </div>
      </div>
      <ShelfBinder />
    </main>
  );
}
