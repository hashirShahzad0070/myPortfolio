import { site } from "@/content/site";
import { ArrowRight, socialIcon } from "./Icons";

/** Per-letter roll text: each glyph shadows a copy below itself and slides up on hover. */
export function Roll({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ ["--index" as string]: i }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

export function ArrowRoll({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <span className={`arrow-roll${diagonal ? " arrow-roll--diagonal" : ""}`} aria-hidden="true">
      <span className="arrow-roll__icon arrow-roll__current"><ArrowRight /></span>
      <span className="arrow-roll__icon arrow-roll__next"><ArrowRight /></span>
    </span>
  );
}

export function LinkCircle({ className = "", diagonal = false }: { className?: string; diagonal?: boolean }) {
  return (
    <span className={`linkcircle ${className}`}>
      <ArrowRoll diagonal={diagonal} />
    </span>
  );
}

export function Chip({ children, pill = false, className = "" }: { children: React.ReactNode; pill?: boolean; className?: string }) {
  return <span className={`chip text-meta${pill ? " chip--pill" : ""} ${className}`}>{children}</span>;
}

export function Logo() {
  return (
    <span className="logo" aria-label={site.name}>
      <span className="logo__shape logo__circle">{site.initials[0]}</span>
      <span className="logo__shape logo__capsule">{site.initials[1]}</span>
    </span>
  );
}

/** A dotted-line list row: label ─── chips (→) */
export function Row({ href, label, tags, external = false }: { href: string; label: string; tags: { text: string; pill?: boolean }[]; external?: boolean }) {
  return (
    <a href={href} className="row row--link" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className="row__label text-tag">{label}</span>
      <span className="row__line" />
      <span className="row__tags">
        {tags.map((t, i) => (
          <Chip key={i} pill={t.pill} className="row__tag">{t.text}</Chip>
        ))}
        <LinkCircle className="row__link" />
      </span>
    </a>
  );
}

export function Socials() {
  return (
    <ul className="socials">
      {site.socials.map((s) => {
        const Icon = socialIcon(s.label);
        return (
          <li key={s.label}>
            <a className="socials__link" href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
              <span className="socials__roll">
                <span className="socials__move"><Icon /><Icon /></span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
