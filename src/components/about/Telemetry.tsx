"use client";

import { useEffect, useMemo, useState } from "react";
import { site } from "@/content/site";

/** Deterministic pseudo-random so server and client render the same grid. */
const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export function Telemetry() {
  const [time, setTime] = useState("--:--:--");
  const [state, setState] = useState("Sync");
  const cells = useMemo(() => Array.from({ length: 26 * 7 }, (_, i) => {
    const r = hash(i);
    return r < 0.35 ? 0 : Math.round(20 + r * 70);
  }), []);
  const total = cells.reduce((a, c) => a + (c ? Math.round(c / 12) : 0), 0);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: site.timezone, hour12: false });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    const t = setTimeout(() => setState("Live"), 900);
    return () => { clearInterval(id); clearTimeout(t); };
  }, []);

  return (
    <>
      <div className="ov3__head">
        <span className="text-mono-tag">Telemetry::<span className="ov3__tag">{state}</span></span>
      </div>
      <div className="ov3__rows text-mono-meta">
        <span><span className="k">LOCAL::</span><span>{time}</span></span>
        <span><span className="k">POS::</span><span>{site.about.position}</span></span>
        <span><span className="k">COMMITS::</span><span>{total.toLocaleString("en-US")}</span></span>
      </div>
      <div className="ov3__commits" aria-hidden="true">
        {cells.map((l, i) => <i key={i} style={{ ["--l" as string]: l || 6 }} />)}
      </div>
    </>
  );
}
