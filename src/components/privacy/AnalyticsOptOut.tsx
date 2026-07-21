"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_OPTOUT_COOKIE,
  ANALYTICS_OPTOUT_STORAGE_KEY,
  MEMBER_COOKIE_MAX_AGE,
} from "@/lib/nfc-constants";

/**
 * AnalyticsOptOut — the reader's control over first-party activity logging.
 *
 * Opting out sets the fr_analytics_optout marker (cookie and localStorage) that
 * the tracker checks before every post, and tells the server to mark this member
 * opted out, so any event still in flight is dropped. Opting back in reverses
 * both. It reads its initial state from the cookie OR localStorage on mount, so
 * it is honest on a return visit even if one of the two was cleared.
 *
 * The server call FAILS CLOSED: turning logging off only shows as done once the
 * server confirms it persisted the flag (the persisted flag is what stops posts
 * from a stale cookie). If the server can't be reached, the toggle reverts and
 * says so, rather than claiming an opt-out that never took. All app tokens.
 */
function readOptOut(): boolean {
  if (typeof document === "undefined") return false;
  try {
    if (localStorage.getItem(ANALYTICS_OPTOUT_STORAGE_KEY) === "1") return true;
  } catch {
    /* storage disabled — fall through to the cookie */
  }
  return new RegExp(`(?:^|;\\s*)${ANALYTICS_OPTOUT_COOKIE}=1`).test(document.cookie);
}

function setClientMarker(on: boolean): void {
  if (on) {
    document.cookie = `${ANALYTICS_OPTOUT_COOKIE}=1; Path=/; Max-Age=${MEMBER_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
    try {
      localStorage.setItem(ANALYTICS_OPTOUT_STORAGE_KEY, "1");
    } catch {
      /* storage disabled — the cookie still carries the choice */
    }
  } else {
    document.cookie = `${ANALYTICS_OPTOUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    try {
      localStorage.removeItem(ANALYTICS_OPTOUT_STORAGE_KEY);
    } catch {
      /* storage disabled — nothing to clear */
    }
  }
}

export default function AnalyticsOptOut() {
  const [optedOut, setOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOptedOut(readOptOut());
  }, []);

  async function apply(next: boolean) {
    setBusy(true);
    setFailed(false);
    // Set the client marker first so the tracker stops posting immediately, then
    // require the server to confirm before we call it done.
    setClientMarker(next);
    setOptedOut(next);
    try {
      const res = await fetch("/api/track/optout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optout: next }),
        credentials: "same-origin",
      });
      // 204 = persisted (or no member row to persist against). A 5xx means the
      // choice did not stick server-side; revert the client marker and say so,
      // so the reader never sees a false "logging is off".
      if (!res.ok) {
        setClientMarker(!next);
        setOptedOut(!next);
        setFailed(true);
      }
    } catch {
      setClientMarker(!next);
      setOptedOut(!next);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-[var(--app-radius-md)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>
        {optedOut
          ? "Activity logging is off on this device. No new in-app activity is being recorded."
          : "In-app activity may be logged on this device while you use a beta invite. You can turn that off here."}
      </p>
      {failed && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
          That did not save. Check your connection and try again.
        </p>
      )}
      <button
        type="button"
        onClick={() => void apply(!optedOut)}
        disabled={busy}
        className="mt-3 inline-flex h-11 items-center rounded-full px-4 text-[13px] font-semibold"
        style={{
          background: optedOut ? "var(--app-positive)" : "var(--app-brand-press)",
          color: "#fff",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {optedOut ? "Turn activity logging back on" : "Turn off activity logging"}
      </button>
    </div>
  );
}
