"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { site } from "@/content/site";
import { shelfPosts } from "@/content/posts";
import { createShelf, type ShelfApi } from "./shelf";
import { setShelf } from "./shelfBus";

/** The folder shelf's canvas. It lives in the /writing layout, so the same scene carries
 *  from the shelf to a post (dimmed behind the page) and back again. */
export function WritingShelf() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<ShelfApi | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  useLayoutEffect(() => {
    routerRef.current = router;
  }, [router]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const posts = shelfPosts();
    if (!posts.length) return;
    api.current = createShelf(canvas, posts, {
      navigate: (href) => routerRef.current.push(href),
      prefetch: (href) => routerRef.current.prefetch(href),
      name: site.name,
    });
    setShelf(api.current);
    return () => {
      setShelf(null);
      api.current?.dispose();
      api.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = pathname;
    const shelf = api.current;
    if (!shelf) return;
    // the index page binds its own stage through the shelf bus once it has hydrated
    if (pathname === "/writing") return;
    const slug = pathname.split("/")[2] ?? "";
    // a client-side arrival gets the paper relay; a fresh load just sits on the dimmed shelf
    if (was && was !== pathname) shelf.arrive(slug);
    else shelf.toBackdrop(slug);
  }, [pathname]);

  return (
    <canvas
      ref={canvasRef}
      className="shelf-gl"
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1,
        opacity: 0, display: "block", transition: "opacity 0.6s ease, filter 0.7s ease",
      }}
    />
  );
}
