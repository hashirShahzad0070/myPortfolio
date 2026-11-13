"use client";

import { useEffect, useState } from "react";
import { site } from "@/content/site";

function useClock() {
  const [t, setT] = useState("--:--");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: site.timezone, hour12: false });
    const tick = () => setT(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function useFps() {
  const [fps, setFps] = useState("--");
  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 500) {
        setFps(String(Math.min(999, Math.round((frames * 1000) / (now - last)))));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

function useLcp() {
  const [lcp, setLcp] = useState<string | null>(null);
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const po = new PerformanceObserver((list) => {
        const e = list.getEntries().at(-1);
        if (e) setLcp(`${(e.startTime / 1000).toFixed(2)}s`);
      });
      po.observe({ type: "largest-contentful-paint", buffered: true });
      return () => po.disconnect();
    } catch {
      return;
    }
  }, []);
  return lcp;
}

export function HudChips({ compact = false }: { compact?: boolean }) {
  const time = useClock();
  const fps = useFps();
  const lcp = useLcp();
  const [presence, setPresence] = useState(true);

  return (
    <>
      <span className="hud__chip text-hud"><span className="hud__k">{site.tzLabel}::</span><span className="hud__v">{time}</span></span>
      <span className="hud__chip text-hud"><span className="hud__k">FPS::</span><span className="hud__v">{fps}</span></span>
      {!compact && lcp && (
        <span className="hud__chip text-hud"><span className="hud__k">LCP::</span><span className="hud__v">{lcp}</span></span>
      )}
      {!compact && (
        <button className="hud__chip text-hud" type="button" onClick={() => setPresence((p) => !p)} aria-pressed={presence}>
          <span className="hud__k">PRESENCE::</span>
          <span className="hud__v">{presence && <span className="hud__dot" />}{presence ? "ON" : "OFF"}</span>
        </button>
      )}
      <span className="hud__chip text-hud"><span className="hud__k">Booking::</span><span className="hud__v">{site.booking}</span></span>
    </>
  );
}

export function Hud() {
  return (
    <div className="hud">
      <HudChips />
    </div>
  );
}
