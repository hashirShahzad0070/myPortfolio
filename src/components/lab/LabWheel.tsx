"use client";

import { useEffect, useRef } from "react";
import { site } from "@/content/site";
import { Chip, LinkCircle } from "../ui";
import { mountLab } from "./labEngine";

const items = site.lab;
const poster = (slug: string) => `/lab/${slug}.svg`;
const START = Math.max(0, items.findIndex((i) => i.slug === "react"));

/** The Lab: the stack as a list / wheel / grid, with each tool's poster on the right. */
export function LabWheel() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountLab(root);
  }, []);

  return (
    <section ref={rootRef} className="lab bleed-full" data-lab data-lab-cols="6" data-lab-start={START} data-lenis-prevent aria-label="Lab — the stack">
      <div className="lab__viewport" data-lab-viewport>
        <div className="lab__list" data-lab-list>
          {items.map((it) => (
            <a key={it.slug} className="lab__item" href={it.href} target="_blank" rel="noopener noreferrer" data-lab-item data-preview={poster(it.slug)}>
              <span className="lab__row-face">
                <span className="lab__name">{it.name}</span>
                <span className="lab__meta" aria-hidden="true">
                  <Chip>{it.group}</Chip>
                  {it.core && <Chip pill>Core</Chip>}
                  <LinkCircle diagonal />
                </span>
              </span>
              <span className="lab__card" aria-hidden="true">
                <span className="lab__card-media u-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="u-cover" src={poster(it.slug)} alt="" decoding="async" draggable={false} />
                </span>
                <span className="lab__card-cap">
                  <span className="lab__card-name text-meta">{it.name}</span>
                  <span className="lab__card-tags">
                    <Chip>{it.group}</Chip>
                    {it.core && <Chip pill>Core</Chip>}
                  </span>
                </span>
              </span>
            </a>
          ))}
        </div>
        <div className="pblur pblur--top" style={{ ["--pblur-h" as string]: "9em" }} aria-hidden="true">
          <div className="pblur__layer is--1" /><div className="pblur__layer is--2" /><div className="pblur__layer is--3" />
        </div>
        <div className="pblur pblur--bottom" style={{ ["--pblur-h" as string]: "6em" }} aria-hidden="true">
          <div className="pblur__layer is--1" /><div className="pblur__layer is--2" /><div className="pblur__layer is--3" />
        </div>
        <div className="lab__mode" role="group" aria-label="View mode" data-lab-mode-toggle>
          <button className="lab__mode-seg text-meta" type="button" data-lab-mode-set="flat" aria-pressed="false">List</button>
          <button className="lab__mode-seg text-meta" type="button" data-lab-mode-set="wheel" aria-pressed="true">
            <span className="lab__mode-bg" data-lab-mode-bg aria-hidden="true" />Wheel
          </button>
          <button className="lab__mode-seg text-meta" type="button" data-lab-mode-set="grid" aria-pressed="false">Grid</button>
        </div>
        <div className="lab__preview u-media" data-lab-preview aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lab__preview-img u-cover" data-lab-preview-img src={poster(items[START].slug)} alt="" decoding="async" />
        </div>
      </div>
    </section>
  );
}
