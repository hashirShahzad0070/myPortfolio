import type { Metadata } from "next";
import { site } from "@/content/site";
import { Telemetry } from "@/components/about/Telemetry";
import { Envelope } from "@/components/about/Envelope";
import { Footer } from "@/components/shell/Chrome";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  const a = site.about;
  return (
    <main className="ov3">
      <h1 className="u-sr-only">About {site.name}, {site.role}</h1>
      <div className="container">
        <div className="ov3__board">
          <div className="ov3__col">
            <section className="ov3__item ov3__hero" aria-label={site.name}>
              <Envelope />
            </section>

            <article className="ov3__item ov3__tele u-card" style={{ ["--rot" as string]: "-1.3deg" }}>
              <Telemetry />
            </article>

            <article id="record" className="ov3__item ov3__record u-card" style={{ ["--rot" as string]: ".8deg" }}>
              <div className="ov3__head"><span className="section-label section-label--lg">The record ::</span></div>
              <p className="ov3__title" style={{ marginBlockEnd: "1rem" }}>Where I’ve worked.</p>
              <table className="ov3__table text-tag">
                <thead><tr><th className="text-label">Company</th><th className="text-label">Role</th><th className="text-label">Year</th></tr></thead>
                <tbody>
                  {a.record.map((r) => (
                    <tr key={r.company}><td>{r.company}</td><td>{r.role}</td><td>{r.year}</td></tr>
                  ))}
                </tbody>
              </table>
            </article>
          </div>
          <div className="ov3__col">
            <article className="ov3__item ov3__route u-card" style={{ ["--rot" as string]: "1deg" }}>
              <span className="text-mono-tag">Route::</span>
              <div className="ov3__codes"><span>{a.route.fromCode}</span><i /><span>{a.route.toCode}</span></div>
              <div className="ov3__places text-meta"><span>{a.route.from}</span><span>{a.route.to}</span></div>
              <span className="text-mono-meta k">{a.route.meta}</span>
            </article>

            <article id="letter" className="ov3__item ov3__letter u-card" style={{ ["--rot" as string]: "-.6deg" }}>
              <span className="section-label section-label--lg">The letter ::</span>
              {a.letter.map((p, i) => <p key={i} className={i ? "text-body" : ""}>{p}</p>)}
            </article>

            <article id="onfile" className="ov3__item ov3__onfile u-card" style={{ ["--rot" as string]: "-.4deg" }}>
              <div className="ov3__head"><span className="section-label section-label--lg">On file ::</span></div>
              <p className="ov3__title" style={{ marginBlockEnd: "1rem" }}>What the work picked up.</p>
              <div className="ov3__cols">
                {a.onFile.map((group) => (
                  <div key={group.title}>
                    <p className="text-mono-tag" style={{ marginBlockEnd: ".5rem" }}>{group.title} :: {group.items.length}</p>
                    <ul className="ov3__list text-tag">
                      {group.items.map((x, i) => <li key={i}><span>{x.org} · {x.what}</span><span>{x.n}</span></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
