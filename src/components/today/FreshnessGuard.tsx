"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isStaleRender, renderedDayLabel } from "@/lib/freshness";

/**
 * Client-side freshness guard for live surfaces.
 *
 * /today says "Right now" — but the HTML the browser is holding may be a
 * cached shell (service worker, CDN) rendered days earlier. The June-9
 * external review caught exactly that: a Sunday-evening page presented as
 * the live state on Tuesday. The server cannot see this; only the client
 * can compare the page's render day with the device's actual day.
 *
 * Behavior when the Eastern calendar day differs:
 *   1. First detection → silently reload once (sessionStorage-guarded so a
 *      genuinely-stale server can't cause a reload loop). For SW/CDN
 *      staleness this self-heals with zero user-visible fuss.
 *   2. Still stale after that → an honest banner: when the page was
 *      rendered, plus a manual refresh button. While the banner shows, the
 *      page must NOT claim "Right now" — the banner says so explicitly.
 *
 * Fresh pages render nothing. Pure predicate lives in lib/freshness (unit
 * tested); this component is just the behavior shell.
 */
export default function FreshnessGuard({ renderedAtIso }: { renderedAtIso: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!isStaleRender(renderedAtIso)) return;
    const KEY = "fr-stale-reload-attempted";
    let attempted = false;
    try {
      attempted = sessionStorage.getItem(KEY) === "1";
      if (!attempted) sessionStorage.setItem(KEY, "1");
    } catch {
      // Storage unavailable (private mode): skip the auto-reload and go
      // straight to the banner rather than risking a reload loop.
      attempted = true;
    }
    if (!attempted) {
      window.location.reload();
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: staleness can only be known on the client after mount (comparing against the device clock during SSR would hydrate-mismatch); this sets state exactly once.
    setStale(true);
  }, [renderedAtIso]);

  if (!stale) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--app-radius-md)] border p-3"
      style={{
        background: "color-mix(in srgb, var(--app-brand) 8%, var(--app-paper))",
        borderColor: "color-mix(in srgb, var(--app-brand) 35%, transparent)",
      }}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
          This page is from {renderedDayLabel(renderedAtIso)}.
        </p>
        <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          Anything marked “right now” or “open now” below may be out of date.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-95"
        style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        Refresh
      </button>
    </div>
  );
}
