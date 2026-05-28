"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";

const DISMISS_KEY = "fr:notif-nudge-dismissed";

/**
 * NotificationsNudge — a discreet invite to enable push, surfaced
 * only when the user can act on it.
 *
 * Visibility rules:
 *   - Browser must support PushManager + Notification (Safari < 16.4
 *     on iOS doesn't, and we don't badger users with a feature they
 *     can't use)
 *   - Permission must NOT already be "granted" (subscribed) or
 *     "denied" (we don't nag users who said no at the browser level)
 *   - User hasn't dismissed it before this session
 *
 * Renders a small "Turn on notifications" row that links to
 * /settings/notifications where the full UI (topic toggles, test
 * send) lives. That separation lets us avoid duplicating the
 * subscribe logic — this is just a doorway.
 *
 * Placement: bottom of /my-radius (people on that page already
 * follow specific places — they're the audience most likely to
 * benefit from heads-up alerts). Avoid /now: it would be visual
 * noise on the daily-utility surface.
 */
export default function NotificationsNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    if (!("Notification" in window) || !("PushManager" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount feature-detection gate; the server can't read Notification.permission or sessionStorage, so this must run after hydration
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShow(false);
  };

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--app-radius-md)] border p-3"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-cool) 22%, var(--app-border))",
        background: "color-mix(in srgb, var(--app-cool) 5%, var(--app-bg-elevated))",
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--app-cool) 16%, transparent)",
          color: "var(--app-cool)",
        }}
      >
        <Bell className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Heads up when something changes
        </p>
        <p
          className="mt-0.5 text-[11.5px] leading-snug"
          style={{ color: "var(--app-ink-3)" }}
        >
          Civic alerts, road closures, and events at places you follow.
          Off by default — pick only the topics you care about.
        </p>
      </div>
      <Link
        href="/settings/notifications"
        className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-[var(--app-shadow-1)]"
        style={{ background: "var(--app-brand)" }}
      >
        Turn on
        <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="shrink-0 text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Not now
      </button>
    </div>
  );
}
