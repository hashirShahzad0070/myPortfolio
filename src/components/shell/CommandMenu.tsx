"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { nav, site } from "@/content/site";
import { ArrowUpRight, Circle, Monitor, Moon, Page, Search, Sun } from "../Icons";
import { useUi, type ThemePref } from "./UiContext";

type Item = { group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

export function CommandMenu() {
  const { panel, close, setTheme, theme } = useUi();
  const isOpen = panel === "cmd";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => { router.push(href); close(); };
    const themeItem = (t: ThemePref, label: string, icon: React.ReactNode): Item => ({
      group: "Theme", label, icon, hint: theme === t ? "Active" : undefined, run: () => { setTheme(t); close(); },
    });
    return [
      { group: "Pages", label: "Home", hint: "/", icon: <Page />, run: go("/") },
      ...nav.map((n) => ({ group: "Pages", label: n.label, hint: n.href, icon: <Page />, run: go(n.href) })),
      ...site.projects.map((p) => ({
        group: "Work", label: p.name, hint: p.year, icon: <ArrowUpRight />,
        run: () => { window.open(p.url, "_blank", "noopener"); close(); },
      })),
      {
        group: "Tools", label: "Copy email", hint: site.email, icon: <Circle />,
        run: () => { navigator.clipboard?.writeText(site.email).catch(() => {}); close(); },
      },
      themeItem("light", "Light", <Sun />),
      themeItem("dark", "Dark", <Moon />),
      themeItem("system", "System", <Monitor />),
    ];
  }, [router, close, setTheme, theme]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.label} ${i.group} ${i.hint ?? ""}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[active]?.run(); }
  };

  const groups = [...new Set(filtered.map((i) => i.group))];

  return (
    <div className={`cmd${isOpen ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Command menu" aria-hidden={!isOpen} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="cmd__panel" onKeyDown={onKey}>
        <div className="cmd__search">
          <Search />
          <input
            ref={inputRef}
            className="cmd__input"
            placeholder="Search pages, work, tools…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            aria-label="Search"
            tabIndex={isOpen ? 0 : -1}
          />
        </div>
        <div className="cmd__list" ref={listRef} data-lenis-prevent>
          {filtered.length === 0 && <p className="cmd__empty text-tag">No results.</p>}
          {groups.map((g) => (
            <div className="cmd__group" key={g}>
              <p className="cmd__heading text-label">{g}</p>
              {filtered.map((it, idx) =>
                it.group !== g ? null : (
                  <button
                    key={`${g}-${it.label}`}
                    type="button"
                    className="cmd__item"
                    data-idx={idx}
                    data-active={idx === active}
                    onMouseMove={() => setActive(idx)}
                    onClick={it.run}
                    tabIndex={-1}
                  >
                    <span className="cmd__icon">{it.icon}</span>
                    <span className="cmd__label">{it.label}</span>
                    {it.hint && <span className="cmd__hint text-mono-meta">{it.hint}</span>}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="cmd__footer text-meta">
          <span className="cmd__fkey"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span className="cmd__fkey"><kbd>↵</kbd> Select</span>
          <span className="cmd__fkey"><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
