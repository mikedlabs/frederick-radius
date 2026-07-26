"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";

/**
 * PulseIndicator — header dot that lights up when something is
 * happening in Frederick County (NWS alerts, school alerts, traffic
 * incidents, power outages).
 *
 * Fetches /api/pulse/status on mount + every 5 minutes. The endpoint
 * is cached server-side so polling is cheap. The header stays lean when a
 * complete read is all clear; an active alert or unavailable read earns a
 * labelled control. Activity is not a universal icon-only action, so those
 * meaningful states keep visible words on touch screens.
 *
 * Lives in TopBar between the More icon and the LocationChip — same
 * grid spot the old "Pulse" tile occupied in the Field Guide drawer.
 */
type PulseStatus = {
  active: boolean;
  count: number;
  tone: "alert" | "caution" | "quiet";
  /** False when a source feed failed on this fetch, so a zero count is
   *  "unknown", not "all clear" (audit FR-002). Older cached payloads may
   *  omit it; treated as ok when absent. */
  ok?: boolean;
};

const TONE_COLOR: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-danger)",
  caution: "var(--app-warning)",
  quiet: "var(--app-positive)",
};

export default function PulseIndicator() {
  const [status, setStatus] = useState<PulseStatus | null>(null);
  // True once a fetch has failed with no prior good status: we then render an
  // explicit "unavailable", never a false "all clear" (audit FR-002). A later
  // success clears it. A failure AFTER a success keeps the last-known status
  // (stale beats blank), so this only guards the never-loaded case.
  const [failed, setFailed] = useState(false);

  const everLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/pulse/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as PulseStatus;
        if (!cancelled) {
          everLoaded.current = true;
          setStatus(json);
          setFailed(false);
        }
      } catch {
        // A failed poll never asserts "all clear": mark unavailable only when
        // we've never had a good read (else we keep the last-known status).
        if (!cancelled && !everLoaded.current) setFailed(true);
      }
    };
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const active = status?.active ?? false;
  const tone = status?.tone ?? "quiet";
  const count = status?.count ?? 0;
  // "Unknown" whenever we cannot honestly claim all-clear: never loaded, a
  // first-load failure, or the server flagged a degraded fetch that found
  // nothing. Only a fresh, complete, zero-count read reads as all clear.
  const unknown = !active && (status === null || failed || status?.ok === false);
  const loading = status === null && !failed;

  // A quiet, complete status is useful on /pulse but not worth permanent
  // global chrome. Loading also stays invisible to avoid a control appearing
  // briefly and then shifting the header when the all-clear response lands.
  if (loading || (!active && !unknown)) return null;

  return (
    <Link
      href="/pulse"
      prefetch={false}
      aria-label={
        active
          ? `County alerts: ${count} active ${count === 1 ? "item" : "items"}`
          : unknown
            ? "County alerts: status unavailable"
            : "County alerts: all clear"
      }
      title={
        active
          ? `County alerts: ${count} active`
          : unknown
            ? "County alerts: status unavailable"
            : "County alerts: all clear"
      }
      className="tap-44-y relative inline-flex h-9 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-2 transition hover:bg-[var(--app-bg-sunken)] sm:px-2.5"
      style={{
        borderColor: "var(--app-border)",
        color: active ? TONE_COLOR[tone] : "var(--app-ink-3)",
      }}
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center" aria-hidden>
        <Activity className="h-4 w-4" strokeWidth={1.75} />
        {active && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-2 w-2 items-center justify-center rounded-full"
            style={{
              background: TONE_COLOR[tone],
              boxShadow:
                tone === "alert"
                  ? `0 0 0 2px var(--app-bg-elevated), 0 0 0 3px color-mix(in srgb, ${TONE_COLOR[tone]} 50%, transparent)`
                  : `0 0 0 2px var(--app-bg-elevated)`,
            }}
          />
        )}
        {/* Unavailable: a hollow ring, so "we don't know" never looks the same
            as the calm all-clear state (audit FR-002). */}
        {!active && unknown && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full"
            style={{ boxShadow: "0 0 0 2px var(--app-bg-elevated), inset 0 0 0 1.5px var(--app-ink-3)" }}
          />
        )}
      </span>
      <span className="hidden text-[13px] font-semibold leading-none sm:inline">
        {active ? `${count} ${count === 1 ? "alert" : "alerts"}` : "Status unavailable"}
      </span>
    </Link>
  );
}
