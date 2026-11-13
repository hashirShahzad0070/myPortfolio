"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { site } from "@/content/site";
import { Logo } from "../ui";
import { createDesk, type Desk } from "./desk";
import { customerCopy, signaturePad, signatureView, stampSVG, ukDate, type Stroke } from "./ink";

const KINDS = ["New business", "A collaboration", "Just a hello"];
const STUB_STATUS = { blank: "BEING WRITTEN", writing: "BEING WRITTEN", signed: "SIGNED", incomplete: "INCOMPLETE", sending: "IN THE TRAY", received: "RECEIVED", failed: "NOT SENT" } as const;
const SHEET_STATUS = { blank: "NOT YET SIGNED", writing: "NOT YET SIGNED", signed: "SIGNED, UNSENT", incomplete: "INCOMPLETE", sending: "SENDING", received: "RECEIVED", failed: "NOT SENT" } as const;
type State = keyof typeof STUB_STATUS;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Where did they hear about you? (a tag for your own records) */
const SOURCES: [string, RegExp][] = [
  ["referral", /\b(friend|colleague|client|coworker|co-worker|referr\w*|recommend\w*|introduc\w*|word of mouth)\b/i],
  ["linkedin", /\blinked ?in\b/i],
  ["github", /\bgit ?hub\b/i],
  ["x", /\b(x|twitter|tweet\w*|x\.com)\b/i],
  ["search", /\b(google|bing|duckduckgo|search\w*|chatgpt|gpt|claude|perplexity|gemini|ai)\b/i],
  ["work", /\b(your (work|site|website|portfolio|lab)|portfolio|saw (a|the|your) )/i],
];
const sourceTag = (s: string) => {
  const t = s.trim();
  if (!t) return "none";
  for (const [k, re] of SOURCES) if (re.test(t)) return k;
  return "other";
};

export function Letter() {
  const deskRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const stubRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const desk = deskRef.current!, form = formRef.current!, stub = stubRef.current!;
    const q = <T extends Element>(s: string) => desk.querySelector<T>(s)!;
    // today's date is written on the client (the page itself is prerendered)
    q<HTMLElement>("[data-letter-date]").textContent = ukDate(new Date());
    const email = q<HTMLInputElement>("[data-letter-email]");
    const body = q<HTMLTextAreaElement>("[data-letter-body]");
    const name = q<HTMLInputElement>("[data-letter-name]");
    const source = q<HTMLInputElement>("[data-letter-source]");
    const status = q<HTMLElement>("[data-letter-status]");
    const mailto = q<HTMLAnchorElement>("[data-letter-mailto]");
    const retry = q<HTMLButtonElement>("[data-letter-retry]");
    const stamp = q<HTMLElement>("[data-letter-stamp]");
    const copyBtn = q<HTMLButtonElement>("[data-letter-copy]");
    const sig = q<HTMLElement>("[data-letter-sig]");
    const ink = q<HTMLCanvasElement>("[data-letter-ink]");
    const clearBtn = q<HTMLButtonElement>("[data-letter-clear]");
    const send = q<HTMLButtonElement>("[data-letter-send]");
    const slip = q<HTMLDialogElement>("[data-letter-slip]");
    const padBox = q<HTMLElement>("[data-letter-pad-box]");
    const pad = q<HTMLCanvasElement>("[data-letter-pad]");
    const slipClear = q<HTMLButtonElement>("[data-letter-slip-clear]");
    const slipDone = q<HTMLButtonElement>("[data-letter-slip-done]");
    const note = (k: string) => desk.querySelector<HTMLElement>(`[data-letter-note="${k}"]`);

    // the WebGL desk (skipped for reduced motion — the plain layout stays)
    let deskGL: Desk | null = null;
    if (!reduced()) {
      desk.setAttribute("data-letter-posed", "");
      deskGL = createDesk(desk, canvasRef.current!, form, stub, site.initials);
      if (!deskGL) desk.removeAttribute("data-letter-posed");
    }

    const ac = new AbortController();
    const signal = ac.signal;
    const kind = () => desk.querySelector<HTMLInputElement>("[data-letter-kind]:checked")?.value ?? KINDS[0];
    const setStub = (k: string, v: string, filled = true) => {
      const el = stub.querySelector<HTMLElement>(`[data-stub="${k}"]`);
      if (el) { el.textContent = v; el.dataset.filled = filled ? "" : "no"; }
    };
    let state: State = "blank";
    let strokes: Stroke[] = [];
    let aspect = 640 / 240;
    const signed = () => strokes.length > 0 || name.value.trim().length > 1;
    const started = () => email.value.trim().length > 0 || body.value.trim().length > 0;
    const showError = (which: string | null, msg = "") => {
      desk.dataset.letterError = which ?? "";
      ["email", "body", "sign", "send"].forEach((k) => {
        const n = note(k);
        if (!n) return;
        const on = k === which;
        n.hidden = !on;
        if (on && k !== "send" && msg) n.textContent = msg;
      });
    };
    const setState = (s: State) => {
      state = s;
      desk.dataset.letterState = s;
      status.textContent = SHEET_STATUS[s];
      setStub("status", STUB_STATUS[s], s === "received" || s === "failed" || s === "sending" || s === "signed");
      send.disabled = s === "sending" || s === "received";
      if (s !== "incomplete" && s !== "failed") showError(null);
    };
    const refresh = () => { if (state !== "sending" && state !== "received") setState(signed() ? "signed" : started() ? "writing" : "blank"); };
    const grow = () => { body.style.height = "auto"; body.style.height = `${Math.max(body.scrollHeight, 180)}px`; };
    body.addEventListener("input", () => { grow(); refresh(); }, { signal });
    email.addEventListener("input", refresh, { signal });
    grow();

    const view = signatureView(sig, ink);
    const markSigned = () => {
      desk.toggleAttribute("data-letter-signed", signed());
      desk.toggleAttribute("data-letter-inked", strokes.length > 0);
      clearBtn.hidden = strokes.length === 0;
      refresh();
    };
    const padCtl = signaturePad(padBox, pad, () => { slipClear.hidden = !padCtl.signed(); });
    const openSlip = () => {
      if (state === "received" || state === "sending") return;
      padCtl.set(strokes);
      slipClear.hidden = strokes.length === 0;
      slip.showModal();
      padCtl.resize();
      if (!reduced()) gsap.fromTo(slip, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "expo.out", clearProps: "transform" });
    };
    const closeSlip = (keep: boolean) => {
      if (keep) { strokes = padCtl.strokes(); aspect = padCtl.aspect(); view.show(strokes, true, aspect); markSigned(); }
      const close = () => slip.close();
      if (reduced()) close();
      else gsap.to(slip, { y: 14, opacity: 0, duration: 0.18, ease: "power2.in", onComplete: () => { close(); gsap.set(slip, { clearProps: "all" }); } });
    };
    sig.addEventListener("click", openSlip, { signal });
    sig.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSlip(); } }, { signal });
    slipClear.addEventListener("click", () => padCtl.clear(), { signal });
    slipDone.addEventListener("click", () => closeSlip(true), { signal });
    slip.addEventListener("cancel", (e) => { e.preventDefault(); closeSlip(true); }, { signal });
    slip.addEventListener("click", (e) => { if (e.target === slip) closeSlip(true); }, { signal });
    name.addEventListener("input", markSigned, { signal });
    clearBtn.addEventListener("click", () => { strokes = []; padCtl.clear(); view.show([], false); markSigned(); }, { signal });
    desk.querySelectorAll<HTMLInputElement>("[data-letter-kind]").forEach((r) => r.addEventListener("change", () => setStub("file", kind().toUpperCase()), { signal }));
    setStub("file", kind().toUpperCase());
    setStub("job", "——", false);
    setStub("received", "——", false);
    setStub("replyby", "——", false);
    setState("blank");

    const head = form.querySelector<HTMLElement>("[data-letter-head]");
    const received = (jobNo?: number) => {
      const now = new Date(), reply = new Date(now.getTime() + 2592e5);
      const job = jobNo ?? 1000 + (now.getTime() % 9000);
      desk.setAttribute("data-letter-sent", "");
      setState("received");
      setStub("job", `N° ${job}`);
      setStub("received", ukDate(now));
      setStub("replyby", ukDate(reply));
      [email, body, name, source].forEach((el) => { el.readOnly = true; });
      copyBtn.hidden = false;
      copyBtn.onclick = async () => {
        copyBtn.disabled = true;
        const blob = await customerCopy({
          who: head?.dataset.who ?? site.name, role: head?.dataset.role ?? "", reach: head?.dataset.reach ?? "",
          date: ukDate(now), dear: `Dear ${site.firstName},`, kind: kind(), from: email.value.trim(), body: body.value.trim(),
          name: name.value.trim(), signature: strokes, aspect, stampDate: ukDate(now), seed: job, job: `N° ${job}`,
        });
        copyBtn.disabled = false;
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `letter-to-${site.firstName.toLowerCase()}-${job}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      };
      stamp.innerHTML = stampSVG(ukDate(now), job);
      stamp.hidden = false;
      if (reduced()) return;
      gsap.fromTo(stamp, { scale: 1.28, opacity: 0, rotate: -15 }, { scale: 1, opacity: 1, rotate: -9, duration: 0.34, ease: "expo.out" });
      deskGL?.strike();
    };
    const failed = (why: "offline" | "closed") => {
      setState("failed");
      const n = note("send");
      const reason = n?.querySelector<HTMLElement>("[data-letter-why]");
      if (reason) reason.textContent = why === "offline" ? "You're offline — the letter never left the desk." : "The counter is closed right now.";
      showError("send");
      const subject = `${kind()} — from ${email.value.trim()}`;
      const via = source.value.trim();
      const text = `${body.value.trim()}\n\n— ${name.value.trim() || email.value.trim()}${via ? `\n\nVia: ${via}` : ""}`;
      mailto.href = `${mailto.dataset.base}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    };
    const submit = async () => {
      if (state === "received" || state === "sending") return;
      if (!email.value.trim()) { setState("incomplete"); showError("email", "a return address, or there is nowhere to reply"); return email.focus(); }
      if (!email.checkValidity()) { setState("incomplete"); showError("email", "that address does not look right"); return email.focus(); }
      if (!body.value.trim()) { setState("incomplete"); showError("body", "the letter is blank"); return body.focus(); }
      if (!signed()) { setState("incomplete"); showError("sign", "sign it, or type your name under the line"); return openSlip(); }
      if (!navigator.onLine) return failed("offline");
      setState("sending");
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: kind(), email: email.value.trim(), body: body.value.trim(), name: name.value.trim(), source: source.value.trim(), sourceTag: sourceTag(source.value), signature: padCtl.png() }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json().catch(() => ({}))) as { job?: number };
        received(data.job);
      } catch {
        failed(navigator.onLine ? "closed" : "offline");
      }
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); void submit(); }, { signal });
    retry.addEventListener("click", () => void submit(), { signal });
    addEventListener("online", () => { if (state === "failed") refresh(); }, { signal });

    return () => {
      ac.abort();
      padCtl.dispose();
      view.dispose();
      if (slip.open) slip.close();
      deskGL?.dispose();
      desk.removeAttribute("data-letter-posed");
    };
  }, []);

  const reach = `${site.email} · ${site.location}`;
  return (
    <section className="desk" ref={deskRef} data-letter data-no-pulse>
      <canvas className="desk__canvas" ref={canvasRef} />
      <form className="sheet" ref={formRef} noValidate autoComplete="on" method="post" action="/api/contact">
        <div className="sheet__in">
          <header className="sheet__head" data-letter-head data-who={site.name} data-role={site.role} data-reach={reach}>
            <span className="sheet__mark" data-letter-mark><Logo /></span>
            <div className="sheet__lh">
              <p className="sheet__name">{site.name}</p>
              <p className="sheet__line">{site.role}</p>
              <p className="sheet__line"><a href={`mailto:${site.email}`}>{site.email}</a> · {site.location}</p>
            </div>
            <i className="sheet__rule" />
          </header>
          <p className="sheet__date" data-letter-date suppressHydrationWarning>{" "}</p>
          <p className="sheet__salut">Dear {site.firstName},</p>

          <fieldset className="sheet__re">
            <legend className="sheet__label">RE ::</legend>
            {KINDS.map((k, i) => (
              <label className="sheet__kind" key={k}>
                <input type="radio" name="kind" value={k} defaultChecked={i === 0} data-letter-kind />
                <span className="sheet__box" />
                <span>{k}</span>
              </label>
            ))}
          </fieldset>

          <label className="sheet__field sheet__field--email">
            <span className="sheet__label">FROM ::</span>
            <input type="email" name="email" placeholder="you@studio.com" required data-letter-email aria-describedby="note-email" />
            <i className="sheet__rule" />
          </label>
          <p className="sheet__note" id="note-email" data-letter-note="email" hidden />
          <label className="sheet__field sheet__field--via">
            <span className="sheet__label">VIA ::</span>
            <input type="text" name="source" maxLength={120} placeholder="A friend, LinkedIn, GitHub, a search… (optional)" autoComplete="off" data-letter-source />
            <i className="sheet__rule" />
          </label>

          <label className="sheet__body" data-letter-rules>
            <span className="u-sr-only">The letter</span>
            <textarea name="body" rows={6} placeholder="What are we building?" required data-letter-body aria-describedby="note-body" />
          </label>
          <p className="sheet__note" id="note-body" data-letter-note="body" hidden />

          <p className="sheet__close">Sincerely,</p>
          <div className="sig" data-letter-sig role="button" tabIndex={0} aria-label="Sign the letter">
            <canvas className="sig__ink" data-letter-ink />
            <span className="sig__ghost">sign here</span>
            <i className="sheet__rule" />
          </div>
          <div className="sheet__typed">
            <span className="sheet__typed-in"><input type="text" name="name" placeholder="Your name" autoComplete="name" data-letter-name /></span>
            <button type="button" className="sig__clear" data-letter-clear hidden>clear signature</button>
          </div>
          <p className="sheet__note" id="note-sign" data-letter-note="sign" hidden />

          <footer className="sheet__foot">
            <p className="sheet__status">ONE REPLY, NO NEWSLETTER · <span data-letter-status>NOT YET SIGNED</span></p>
            <span className="sheet__send">
              <button type="submit" data-letter-send className="btn btn--solid text-tag">
                <span className="btn__label roll" aria-hidden="true">{[..."Send it"].map((c, i) => <span key={i} style={{ ["--index" as string]: i }}>{c}</span>)}</span>
                <span className="u-sr-only">Send it</span>
              </button>
            </span>
            <button type="button" className="sheet__copy" data-letter-copy hidden>Keep a copy</button>
          </footer>
          <p className="sheet__note sheet__note--send" data-letter-note="send" hidden>
            <span data-letter-why>The counter is closed right now.</span>
            <a data-letter-mailto data-base={`mailto:${site.email}`} href={`mailto:${site.email}`}>Send it by email instead</a>
            <button type="button" className="sheet__retry" data-letter-retry>or try again</button>
          </p>
          <div className="stamp" data-letter-stamp hidden />
        </div>
      </form>

      <dialog className="slip" data-letter-slip aria-label="Sign the letter">
        <div className="slip__in">
          <p className="slip__head"><span>SIGN HERE</span><span className="slip__hint">WITH YOUR FINGER, MOUSE OR PEN</span></p>
          <div className="slip__pad" data-letter-pad-box>
            <canvas className="slip__canvas" data-letter-pad />
            <span className="slip__x">✕</span>
          </div>
          <div className="slip__foot">
            <button type="button" className="slip__clear" data-letter-slip-clear hidden>Clear</button>
            <button type="button" data-letter-slip-done className="btn btn--solid text-tag">
              <span className="btn__label roll" aria-hidden="true">{[..."Done"].map((c, i) => <span key={i} style={{ ["--index" as string]: i }}>{c}</span>)}</span>
              <span className="u-sr-only">Done</span>
            </button>
          </div>
        </div>
      </dialog>

      <aside className="stub" ref={stubRef} data-letter-stub aria-label="Job ticket">
        <p className="stub__head">{site.name.toUpperCase()}:: PRESS</p>
        <p className="stub__sub">INTAKE · COUNTER 01</p>
        <dl className="stub__rows">
          <div><dt>JOB</dt><dd data-stub="job">——</dd></div>
          <div><dt>RECEIVED</dt><dd data-stub="received">——</dd></div>
          <div><dt>REPLY BY</dt><dd data-stub="replyby">——</dd></div>
          <div><dt>STATUS</dt><dd data-stub="status">BEING WRITTEN</dd></div>
          <div><dt>FILE UNDER</dt><dd data-stub="file">NEW BUSINESS</dd></div>
        </dl>
        <span className="stub__bars" aria-hidden="true" />
        <p className="stub__foot">KEEP THIS HALF</p>
      </aside>
    </section>
  );
}
