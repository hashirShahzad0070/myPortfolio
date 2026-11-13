"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
type Panel = "cmd" | "notif" | "drawer" | null;

type Ui = {
  panel: Panel;
  open: (p: Exclude<Panel, null>) => void;
  close: () => void;
  toggle: (p: Exclude<Panel, null>) => void;
  theme: ThemePref;
  resolved: "light" | "dark";
  setTheme: (t: ThemePref) => void;
};

const Ctx = createContext<Ui | null>(null);

const read = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage blocked */ }
};

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Hydrate theme preference after mount (the inline head script already applied it).
  useEffect(() => {
    const saved = read("theme") as ThemePref | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark" || saved === "system") setThemeState(saved);
  }, []);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const r = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", r);
      setResolved(r);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    write("theme", t);
    setThemeState(t);
  }, []);

  const open = useCallback((p: Exclude<Panel, null>) => setPanel(p), []);
  const close = useCallback(() => setPanel(null), []);
  const toggle = useCallback((p: Exclude<Panel, null>) => setPanel((c) => (c === p ? null : p)), []);

  // Global keys: ⌘K / Ctrl+K toggles the command menu, Esc closes anything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPanel((c) => (c === "cmd" ? null : "cmd"));
      } else if (e.key === "Escape") {
        setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ panel, open, close, toggle, theme, resolved, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used inside <UiProvider>");
  return v;
}
