import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site, type PostBlock } from "@/content/site";
import { findPost, headingId, longDate, postNum, posts } from "@/content/posts";
import { Toc } from "@/components/writing/Toc";
import { Row } from "@/components/ui";

// Posts are static, so a navigation can wait for the whole page: the paper must exist
// the moment the route commits for the shelf to slide it up out of the folder.
export const instant = false;

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  return post ? { title: post.title, description: post.summary } : {};
}

function Block({ b }: { b: PostBlock }) {
  if ("h2" in b) return <h2 id={headingId(b.h2)}>{b.h2}</h2>;
  if ("ul" in b) return <ul>{b.ul.map((li, i) => <li key={i}>{li}</li>)}</ul>;
  if ("quote" in b) return <blockquote><p>{b.quote}</p></blockquote>;
  return <p>{b.p}</p>;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();
  const toc = post.body.flatMap((b) => ("h2" in b ? [{ id: headingId(b.h2), text: b.h2 }] : []));
  const num = String(postNum(post)).padStart(2, "0");

  return (
    <main className="wpost container" data-writing-post data-folders-slug={post.slug}>
      {toc.length > 0 && (
        <aside className="wpost__rail" data-flight-wait>
          <Toc items={toc} />
        </aside>
      )}
      <div className="wpost__close">
        <Link href="/writing" className="closebox" aria-label="Close — back to writing" data-flight-wait>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
      <article className="wpost__col" data-flight-paper>
        <p className="wpost__masthead text-label" aria-hidden="true">
          <span>{site.name}:: Writing</span>
          <span>N°{num}</span>
        </p>
        <p className="wpost__date"><span aria-hidden="true">:: </span>{longDate(post)}</p>
        <h1 className="wpost__title">{post.title}</h1>
        {post.tldr && (
          <aside className="wpost__tldr" aria-label="TL;DR">
            <p className="wpost__tldr-label text-label">TL;DR</p>
            <p className="wpost__tldr-text">{post.tldr}</p>
          </aside>
        )}
        <div className="wpost__article" data-post-article>
          {post.body.map((b, i) => <Block key={i} b={b} />)}
        </div>
        {post.credits && post.credits.length > 0 && (
          <section className="wpost__credits" aria-label="Credits">
            <p className="wpost__credits-label text-label">Credits</p>
            <div className="wpost__credits-rule" aria-hidden="true" />
            <div className="wpost__credits-list">
              {post.credits.map((c) => <Row key={c.href} href={c.href} label={c.label} tags={[]} external />)}
            </div>
          </section>
        )}
        <div className="wpost__signoff">
          <p>Sincerely,</p>
          <span className="wpost__sig">{site.name}</span>
        </div>
      </article>
    </main>
  );
}
