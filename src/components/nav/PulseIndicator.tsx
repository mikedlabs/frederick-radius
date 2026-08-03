"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * PulseIndicator — header dot that lights up when something is
 * happening in Frederick County (NWS alerts, school alerts, traffic
 * incidents, power outages).
 *
 * Fetches /api/pulse/status on mount + every 5 minutes. The endpoint
 * is cached server-side so polling is cheap. Pulse remains a stable top-level
 * destination while the indicator communicates active alerts, all-clear, or
 * unavailable data without making the navigation appear and disappear.
 *
 * Lives in TopBar between the LocationChip and Compass.
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
  const pathname = usePathname();
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
  const loading = status === null && !failed;
  // "Unknown" whenever we cannot honestly claim all-clear: a first-load
  // failure or a degraded fetch that found nothing. Initial loading remains a
  // neutral checking state, not a false unavailable warning.
  const unknown = !active && !loading && (failed || status?.ok === false);
  const current = pathname === "/pulse" || pathname.startsWith("/pulse/");
  const statusLabel = active
    ? `Pulse: ${count} active ${count === 1 ? "alert" : "alerts"}`
    : loading
      ? "Pulse: checking county status"
      : unknown
        ? "Pulse: status unavailable"
        : "Pulse: all clear";
  const mobileVisible = current || active || unknown;

  return (
    <Link
      data-pulse-indicator
      href="/pulse"
      prefetch={false}
      aria-label={statusLabel}
      aria-current={current ? "page" : undefined}
      title={statusLabel}
      className={`relative h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-2 transition hover:bg-[var(--app-bg-sunken)] sm:inline-flex sm:px-2.5 ${
        mobileVisible ? "inline-flex" : "hidden"
      }`}
      style={{
        borderColor: current ? "var(--app-brand)" : "var(--app-border)",
        color: current
          ? "var(--app-brand-press)"
          : active
            ? TONE_COLOR[tone]
            : "var(--app-ink-2)",
        background: current ? "var(--app-brand-tint-6)" : undefined,
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
      <span className="hidden text-[14px] font-semibold leading-none sm:inline">
        Pulse
      </span>
    </Link>
  );
}
