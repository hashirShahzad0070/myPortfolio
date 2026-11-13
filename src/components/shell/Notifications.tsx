"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { site } from "@/content/site";
import { Chip, LinkCircle } from "../ui";
import { ArrowRight } from "../Icons";
import { useUi } from "./UiContext";

/* "Seen" = how many feed items (from the top) the visitor has already read. */
const KEY = "notif:seen";
const listeners = new Set<() => void>();
const getSeen = () => {
  try { return Number(localStorage.getItem(KEY) ?? 0); } catch { return site.updates.length; }
};
const setSeen = (n: number) => {
  try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Unread items = the newest ones above the last-seen mark (max 3 so the badge isn't noisy). */
export function useUnread() {
  const seen = useSyncExternalStore(subscribe, getSeen, () => site.updates.length);
  return Math.max(0, Math.min(3, site.updates.length - seen));
}

export function Notifications() {
  const { panel, close } = useUi();
  const isOpen = panel === "notif";
  const unread = useUnread();
  // Snapshot unread count at open time so dots stay visible while the panel is up.
  const [openUnread, setOpenUnread] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setOpenUnread(unread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div className={`notif${isOpen ? " is-open" : ""}`} role="dialog" aria-label="What’s new" aria-hidden={!isOpen} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="notif__panel">
        <div className="notif__head">
          <span className="notif__title text-label">What’s new</span>
          {unread > 0 && <span className="notif__count text-mono-sm">{unread}</span>}
          {unread > 0 && (
            <button className="notif__clear text-label" type="button" onClick={() => setSeen(site.updates.length)}>
              Mark all read
            </button>
          )}
        </div>
        <div className="notif__list" data-lenis-prevent>
          {site.updates.map((u, i) => (
            <Link
              key={i}
              href={u.href}
              className="notif__item"
              data-hover
              data-unread={i < openUnread && i < unread ? "" : undefined}
              onClick={() => { setSeen(site.updates.length); close(); }}
            >
              <span className="notif__main">
                <span className="notif__meta">
                  <Chip pill>{u.tag}</Chip>
                  <span className="notif__time text-meta">{u.date}</span>
                </span>
                <span className="notif__label text-tag">{u.title}</span>
                <span className="notif__summary">{u.summary}</span>
              </span>
              <LinkCircle />
              <span className="notif__dot" />
            </Link>
          ))}
        </div>
        <div className="notif__footer">
          <Link className="notif__all text-label" href="/writing" onClick={close}>
            View all <ArrowRight width={11} height={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}
