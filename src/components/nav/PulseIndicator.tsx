"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { usePathname } from "next/navigation";
import AppTransitionLink from "./AppTransitionLink";
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
 *
 * The chip prints one readable word that matches the /pulse masthead:
 * Urgent, Advisory, Quiet or Unknown (Checking while a request is in flight).
 * The count lives in the accessible name and, when there is more than one
 * report, as a small numeral on the dot. The old 9px "1 alert" label was too
 * small to read and did not match the word the page printed (Oct 2026 review).
 */
export type PulseStatus = {
  active: boolean;
  count: number;
  tone: "alert" | "caution" | "quiet";
  ok: boolean;
  /** Snapshot assembly time, not a claim that every publisher was checked. */
  lastUpdated: string;
};

export const PULSE_STATUS_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
// /api/pulse/status caches 300s over a 60s currentSituation snapshot. This
// limits the assembly age only; individual publisher checks remain upstream.
const MAX_SNAPSHOT_AGE_MS = (300 + 60) * 1000;
// Match the existing currentSituationModel and PulseFreshness clock tolerance.
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

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
    && typeof status.lastUpdated === "string"
    && Number.isFinite(Date.parse(status.lastUpdated));
}

const TONE_COLOR: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-danger)",
  caution: "var(--app-warning)",
  quiet: "var(--app-positive)",
};

export type PulseChipWord = "Urgent" | "Advisory" | "Quiet" | "Unknown" | "Checking";

/**
 * The one word the header chip prints. It follows selectCountyStatus's own
 * grading, so the chip says the word /pulse prints: an Urgent item makes the
 * alert tone, Advisory items the caution tone, and a quiet report is Quiet
 * only when every source answered. Anything unverified is Unknown.
 */
export function pulseChipWord(
  status: Pick<PulseStatus, "active" | "tone" | "ok"> | null,
  phase: "checking" | "ready" | "unavailable",
): PulseChipWord {
  if (phase === "checking") return "Checking";
  if (phase !== "ready" || !status) return "Unknown";
  if (status.active) return status.tone === "alert" ? "Urgent" : "Advisory";
  return status.ok ? "Quiet" : "Unknown";
}

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
  const currentAlerts = active && !unverified;
  const word = pulseChipWord(status, phase);
  const alertCount = `${count} ${count === 1 ? "alert" : "alerts"}`;
  // The accessible name starts with the word the chip shows, so a voice user
  // can say what they see, then carries the count the chip no longer prints.
  const statusLabel = earlier
    ? `County status: ${checking ? "checking" : "Unknown"}. Earlier report had ${alertCount}; current alerts are unverified.`
    : checking
      ? "County status: checking"
      : currentAlerts
        ? `County status: ${word}, ${alertCount} reported${status?.ok === false ? "; some sources unavailable" : ""}`
        : word === "Quiet"
          ? "County status: Quiet, no active alerts"
          : "County status: Unknown";
  // The word carries its own color so it always matches what it says, even
  // on /pulse, where the rest of the link takes the current-page color.
  // Unknown is never a danger color: it is muted ink beside a hollow ring.
  const stateColor = currentAlerts
    ? TONE_COLOR[tone]
    : word === "Unknown"
      ? "var(--app-ink-3)"
      : "var(--app-ink-2)";
  const mobileVisible = current || active || unknown || checking;
  // On a phone a quiet county shows no chip outside /pulse, so the word only
  // renders where the chip does.
  const showMobileWord = word !== "Quiet" || current;
  const dotNumeral = currentAlerts && count > 1 ? (count > 9 ? "9+" : String(count)) : null;

  return (
    <AppTransitionLink
      data-pulse-indicator
      data-pulse-state={phase}
      href="/pulse"
      prefetch={false}
      aria-label={statusLabel}
      aria-current={current ? "page" : undefined}
      title={statusLabel}
      // px-1 on phones: the 11px word is wider than the old 9px label, and
      // the tighter inset keeps the header row the width it was at 320 and
      // 390px. The chip still grows to fit its word and never drops below 44px.
      className={`relative h-11 min-w-11 shrink-0 items-center justify-center flex-col gap-0.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-1 transition hover:bg-[var(--app-bg-sunken)] sm:inline-flex sm:flex-row sm:gap-1.5 sm:px-2.5 ${
        mobileVisible ? "inline-flex" : "hidden"
      }`}
      style={{
        borderColor: current ? "var(--app-brand)" : "var(--app-border)",
        color: current
          ? "var(--app-brand-press)"
          : currentAlerts
            ? TONE_COLOR[tone]
            : word === "Unknown"
              ? "var(--app-ink-3)"
              : "var(--app-ink-2)",
        background: current ? "var(--app-brand-tint-6)" : undefined,
      }}
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center" aria-hidden>
        <Activity className="h-4 w-4" strokeWidth={1.75} />
        {currentAlerts && (
          <span
            data-pulse-dot={tone}
            data-pulse-dot-count={dotNumeral ?? undefined}
            className={
              dotNumeral
                ? "absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-caption font-bold leading-none tabular-nums"
                : "absolute -right-1 -top-1 inline-flex h-2 w-2 items-center justify-center rounded-full"
            }
            style={{
              background: TONE_COLOR[tone],
              color: "var(--app-on-brand)",
              boxShadow:
                tone === "alert"
                  ? `0 0 0 2px var(--app-bg-elevated), 0 0 0 3px color-mix(in srgb, ${TONE_COLOR[tone]} 50%, transparent)`
                  : `0 0 0 2px var(--app-bg-elevated)`,
            }}
          >
            {dotNumeral}
          </span>
        )}
        {/* Unavailable: a hollow ring, so "we don't know" never looks the same
            as the calm all-clear state (audit FR-002). */}
        {(!currentAlerts && (unknown || earlier)) && (
          <span
            data-pulse-dot="unknown"
            className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full"
            style={{ boxShadow: "0 0 0 2px var(--app-bg-elevated), inset 0 0 0 1.5px var(--app-ink-3)" }}
          />
        )}
      </span>
      {showMobileWord && <span data-pulse-mobile-state className="text-caption font-semibold leading-none sm:hidden" style={{ color: stateColor }}>{word}</span>}
      <span className="hidden flex-col gap-0.5 sm:inline-flex">
        <span className="text-[14px] font-semibold leading-none">County status</span>
        <span data-pulse-desktop-state className="text-caption font-semibold leading-none" style={{ color: stateColor }}>{word}</span>
      </span>
    </AppTransitionLink>
  );
}
