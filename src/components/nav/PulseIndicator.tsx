"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { usePathname } from "next/navigation";
import AppTransitionLink from "./AppTransitionLink";
import { countyStatusLabel, COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS, COUNTY_STATUS_FUTURE_TOLERANCE_MS, type CountyStatusSummary } from "@/lib/pulse/county-status";
import { createAbortDeadline } from "@/lib/promise-deadline";

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
 * Lives in TopBar between the LocationChip and Tools.
 */
type PulseStatus = CountyStatusSummary;

export const PULSE_STATUS_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
// /api/pulse/status caches 300s over a 60s currentSituation snapshot. This
// limits the assembly age only; individual publisher checks remain upstream.
const MAX_SNAPSHOT_AGE_MS = COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS;
// Match the existing currentSituationModel and PulseFreshness clock tolerance.
const FUTURE_CLOCK_TOLERANCE_MS = COUNTY_STATUS_FUTURE_TOLERANCE_MS;

function validStatus(value: unknown): value is PulseStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<PulseStatus>;
  return typeof status.active === "boolean"
    && typeof status.ok === "boolean"
    && typeof status.count === "number"
    && Number.isSafeInteger(status.count) && status.count >= 0
    && status.active === (status.count > 0)
    && ["alert", "caution", "quiet"].includes(status.tone ?? "")
    && (status.active ? status.tone !== "quiet" : status.tone === "quiet")
    && ((status.active && (status.level === "Urgent" || status.level === "Advisory")
      && status.tone === (status.level === "Urgent" ? "alert" : "caution"))
      || (!status.active && status.level === (status.ok ? "Clear" : "Unknown")))
    && typeof status.lastUpdated === "string"
    && Number.isFinite(Date.parse(status.lastUpdated));
}

const TONE_COLOR: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-danger)",
  caution: "var(--app-warning)",
  quiet: "var(--app-positive)",
};

export default function PulseIndicator() {
  const pathname = usePathname();
  const [status, setStatus] = useState<PulseStatus | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "unavailable">("checking");

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState !== "hidden";
    const cancel = () => {
      generation++;
      if (timer) clearTimeout(timer);
      if (expiry) clearTimeout(expiry);
      timer = undefined;
      expiry = undefined;
      request?.abort();
      request = null;
    };
    const fetchStatus = async () => {
      if (disposed || !visible() || request) return;
      if (timer) clearTimeout(timer);
      if (expiry) clearTimeout(expiry);
      timer = undefined;
      expiry = undefined;
      const controller = new AbortController();
      request = controller;
      const id = ++generation;
      const deadline = createAbortDeadline(PULSE_STATUS_TIMEOUT_MS, controller.signal);
      let onAbort: (() => void) | undefined;
      const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new DOMException("Status check cancelled", "AbortError"));
        deadline.signal.addEventListener("abort", onAbort, { once: true });
        if (deadline.signal.aborted) onAbort();
      });
      setPhase("checking");
      try {
        // The deadline covers response headers AND body decoding. The race
        // also consumes late outcomes from transports that ignore abort.
        const read = async () => {
          const response = await fetch("/api/pulse/status", { cache: "no-store", signal: deadline.signal });
          if (!response.ok) throw new Error("Status check failed");
          const payload: unknown = await response.json();
          if (!validStatus(payload)) throw new Error("Invalid status report");
          const age = Date.now() - Date.parse(payload.lastUpdated);
          if (!Number.isFinite(age) || age < -FUTURE_CLOCK_TOLERANCE_MS || age >= MAX_SNAPSHOT_AGE_MS) {
            throw new Error("Status snapshot time is unverified");
          }
          return payload;
        };
        const payload = await Promise.race([read(), cancelled]);
        if (!disposed && id === generation && !deadline.signal.aborted) {
          setStatus(payload);
          setPhase("ready");
          // A cached report may be near expiry when it arrives. Do not leave
          // its quiet claim current until the next poll; no extra fetch occurs.
          const remaining = Math.max(0, Math.min(MAX_SNAPSHOT_AGE_MS,
            Date.parse(payload.lastUpdated) + MAX_SNAPSHOT_AGE_MS - Date.now()));
          expiry = setTimeout(() => {
            if (!disposed && id === generation) setPhase("unavailable");
          }, remaining);
        }
      } catch {
        if (!disposed && id === generation && visible()) setPhase("unavailable");
      } finally {
        if (onAbort) deadline.signal.removeEventListener("abort", onAbort);
        deadline.dispose();
        if (request === controller) request = null;
        if (!disposed && id === generation && visible()) {
          timer = setTimeout(fetchStatus, POLL_INTERVAL_MS);
        }
      }
    };
    const onVisibility = () => {
      if (visible()) void fetchStatus();
      else {
        cancel();
        setPhase("unavailable");
      }
    };
    void fetchStatus();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const active = status?.active ?? false;
  const tone = status?.tone ?? "quiet";
  const count = status?.count ?? 0;
  const checking = phase === "checking";
  const unverified = phase !== "ready";
  const unknown = phase === "unavailable" || (phase === "ready" && status?.ok === false);
  const current = pathname === "/pulse" || pathname.startsWith("/pulse/");
  const earlier = unverified && active;
  const alertCount = `${count} ${count === 1 ? "alert" : "alerts"}`;
  const stateLabel = checking ? "Checking" : earlier ? "Unknown" : phase === "unavailable" ? "Unknown" : status?.level ?? "Unknown";
  const statusLabel = earlier
    ? `County status: ${stateLabel}. ${checking ? "Checking again." : "Current check unavailable."} Earlier report had ${alertCount}; current alerts are unverified.`
    : checking
      ? "County status: checking"
      : phase === "unavailable" || !status || stateLabel === "Unknown"
        ? "County status: Unknown; current alerts are unverified"
        : active
          ? `County status: ${countyStatusLabel(status.level)}; ${alertCount} reported${status.ok === false ? "; some sources unavailable" : ""}`
          : `County status: ${countyStatusLabel(status.level)}; no active alerts`;
  const mobileVisible = current || active || unknown || checking;
  const currentAlerts = active && !unverified;

  return (
    <AppTransitionLink
      data-pulse-indicator
      data-pulse-state={phase}
      href="/pulse"
      prefetch={false}
      aria-label={statusLabel}
      aria-current={current ? "page" : undefined}
      title={statusLabel}
      className={`relative h-11 min-w-11 shrink-0 items-center justify-center flex-col gap-0.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-2 transition hover:bg-[var(--app-bg-sunken)] sm:inline-flex sm:flex-row sm:gap-1.5 sm:px-2.5 ${
        mobileVisible ? "inline-flex" : "hidden"
      }`}
      style={{
        borderColor: current ? "var(--app-brand)" : "var(--app-border)",
        color: current
          ? "var(--app-brand-press)"
          : currentAlerts
            ? TONE_COLOR[tone]
            : "var(--app-ink-2)",
        background: current ? "var(--app-brand-tint-6)" : undefined,
      }}
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center" aria-hidden>
        <Activity className="h-4 w-4" strokeWidth={1.75} />
        {currentAlerts && (
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
        {(!currentAlerts && (unknown || earlier)) && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full"
            style={{ boxShadow: "0 0 0 2px var(--app-bg-elevated), inset 0 0 0 1.5px var(--app-ink-3)" }}
          />
        )}
      </span>
      {stateLabel && <span data-pulse-mobile-state className="text-[9px] font-semibold leading-none sm:hidden">{stateLabel}</span>}
      <span className="hidden flex-col gap-0.5 sm:inline-flex">
        <span className="text-[14px] font-semibold leading-none">County status</span>
        {stateLabel && <span data-pulse-desktop-state className="text-[10px] leading-none">{status?.level === "Clear" && phase === "ready" ? countyStatusLabel(status.level) : stateLabel}</span>}
      </span>
    </AppTransitionLink>
  );
}
