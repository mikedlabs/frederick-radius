"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { usePathname } from "next/navigation";
import AppTransitionLink from "./AppTransitionLink";
import { countyStatusLabel, countyStatusSnapshotDeadline, COUNTY_STATUS_FUTURE_TOLERANCE_MS, type CountyStatusSummary } from "@/lib/pulse/county-status";
import { createAbortDeadline } from "@/lib/promise-deadline";
import { documentReadIsActive, scheduleDocumentRead } from "@/lib/document-read-lifecycle";

/**
 * PulseIndicator is the header dot that lights up when something is
 * happening in Frederick County (NWS alerts, school alerts, traffic
 * incidents, power outages).
 *
 * Fetches /api/pulse/status on mount, then again shortly before the report on
 * screen expires, and at least every 5 minutes. When an early read returns
 * the same deadline, the server is holding its report, so later reads aim at
 * the deadline itself. Reads that keep coming back with little time left,
 * already expired or with incomplete coverage back off, doubling the gap from
 * 10 seconds up to 5 minutes. A failed read is retried after 1 minute, then
 * after 2, 4 and 5. The underlying source snapshots retain their cache
 * windows; the summary rechecks source expiry. Pulse remains a stable top-level
 * destination while the indicator communicates active alerts, all-clear, or
 * unavailable data without making the navigation appear and disappear.
 *
 * A report is shown as current only inside its validity window. Inside that
 * window it stays on screen while the next read runs, and it is the first
 * thing painted after a reload in the same tab. A failed read or a passed
 * deadline always replaces the level with "Unable to verify". The deadline is
 * checked against the wall clock at least every 30 seconds, because timers
 * can pause while a tab stays visible across a system sleep.
 *
 * Lives in TopBar between the LocationChip and Tools.
 */
type PulseStatus = CountyStatusSummary;

export const PULSE_STATUS_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;
// Start the next read early enough to finish, or time out, before the report
// on screen expires.
const REFRESH_LEAD_MS = PULSE_STATUS_TIMEOUT_MS;
// A run of short-lived reports must not turn into back-to-back reads. Each
// hurried read in a row doubles this gap, up to the poll interval.
const MIN_REFRESH_GAP_MS = 10_000;
// A read that has to start sooner than this counts as hurried.
const HURRIED_READ_MS = 30_000;
// A report with incomplete coverage is read again soon. Sources usually
// recover within seconds.
const PARTIAL_REFRESH_MS = 30_000;
// One failed read is retried after a minute, then the wait doubles.
const FAILED_RETRY_MS = 60_000;
// Timers can pause while the tab stays visible, so the deadline is checked
// against the wall clock at least this often.
const EXPIRY_CHECK_MS = 30_000;
/** The last accepted report, kept for this tab so a reload can paint it first. */
export const PULSE_STATUS_STORAGE_KEY = "fr:pulse:status:v1";
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
    && Number.isFinite(Date.parse(status.lastUpdated))
    && typeof status.validUntil === "string"
    && Number.isFinite(Date.parse(status.validUntil));
}

/** The moment a report stops being current, or null when it is not current now. */
function currentUntil(status: PulseStatus, now: number): number | null {
  const age = now - Date.parse(status.lastUpdated);
  const deadline = countyStatusSnapshotDeadline(status);
  const current = Number.isFinite(age) && age >= -FUTURE_CLOCK_TOLERANCE_MS && deadline !== null && now < deadline;
  return current ? deadline : null;
}

/** Storage can be blocked or full. The pill works the same without it. */
function readStoredStatus(): PulseStatus | null {
  let stored: PulseStatus | null = null;
  try {
    const raw = window.sessionStorage.getItem(PULSE_STATUS_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (validStatus(value) && currentUntil(value, Date.now()) !== null) stored = value;
  } catch {
    // The first paint starts from "Checking", as it does with no stored report.
  }
  return stored;
}

function storeStatus(status: PulseStatus | null) {
  try {
    if (!status) {
      window.sessionStorage.removeItem(PULSE_STATUS_STORAGE_KEY);
      return;
    }
    // Only the fields the pill reads. Source checks stay on the Pulse page.
    const { active, count, tone, level, ok, lastUpdated, validUntil } = status;
    window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, JSON.stringify({ active, count, tone, level, ok, lastUpdated, validUntil }));
  } catch {
    // Nothing to do. The next document load starts from "Checking".
  }
}

const TONE_COLOR: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-danger)",
  caution: "var(--app-warning)",
  quiet: "var(--app-positive)",
};
const TONE_FOREGROUND: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-danger-text)",
  caution: "var(--state-closing)",
  quiet: "var(--state-open)",
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
    let cancelScheduled: (() => void) | null = null;
    // The last accepted report that no later check has contradicted. Storage
    // is read here, after hydration, so server and first client render match.
    let current: PulseStatus | null = readStoredStatus();
    // Wall-clock time the scheduled read is due.
    let readDue = 0;
    // Hurried reads and failed reads in a row, for backoff.
    let hurried = 0;
    let failures = 0;
    // An early read returned the same deadline: the server holds its report
    // until then, so reading before the deadline only repeats it.
    let serverHoldsDeadline = false;
    const visible = documentReadIsActive;
    const expire = () => {
      expiry = undefined;
      current = null;
      if (!disposed) setPhase(request || cancelScheduled ? "checking" : "unavailable");
    };
    /** Show the held report only inside its validity window and drop it at
     * the deadline. Returns the time it has left, or null when none is shown. */
    const showCurrent = (): number | null => {
      if (expiry) clearTimeout(expiry);
      expiry = undefined;
      const now = Date.now();
      const until = current ? currentUntil(current, now) : null;
      let remaining: number | null = null;
      if (current && until !== null) {
        setStatus(current);
        setPhase("ready");
        expiry = setTimeout(recheck, Math.min(until - now, EXPIRY_CHECK_MS));
        remaining = until - now;
      } else current = null;
      return remaining;
    };
    const recheck = () => {
      expiry = undefined;
      // A read that is overdue by the wall clock was held back by paused timers.
      if (timer && Date.now() >= readDue) {
        clearTimeout(timer);
        timer = undefined;
        scheduleStatus();
      }
      if (showCurrent() === null) expire();
    };
    /** The wait before the next read, at least the backed-off minimum gap. */
    const pace = (wanted: number, isHurried: boolean) => {
      if (!isHurried) hurried = 0;
      const floor = Math.min(POLL_INTERVAL_MS, MIN_REFRESH_GAP_MS * 2 ** hurried);
      if (isHurried) hurried++;
      return Math.min(POLL_INTERVAL_MS, Math.max(floor, wanted));
    };
    const scheduleStatus = () => {
      if (disposed || !visible() || request || cancelScheduled) return;
      cancelScheduled = scheduleDocumentRead(() => {
        cancelScheduled = null;
        void fetchStatus();
      }, () => { cancelScheduled = null; });
    };
    const cancel = () => {
      generation++;
      cancelScheduled?.();
      cancelScheduled = null;
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
      timer = undefined;
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
      // A report that is still valid stays on screen while it is refreshed.
      if (showCurrent() === null) setPhase("checking");
      let nextRead = POLL_INTERVAL_MS;
      try {
        // The deadline covers response headers AND body decoding. The race
        // also consumes late outcomes from transports that ignore abort.
        const read = async () => {
          const response = await fetch("/api/pulse/status", { cache: "no-store", signal: deadline.signal });
          if (!response.ok) throw new Error("Status check failed");
          const payload: unknown = await response.json();
          if (!validStatus(payload)) throw new Error("Invalid status report");
          return payload;
        };
        const payload = await Promise.race([read(), cancelled]);
        if (!disposed && id === generation && !deadline.signal.aborted) {
          // Held only while it was still current, so this read came early.
          const previous = current;
          current = payload;
          failures = 0;
          // showCurrent stops calling the report current at its earliest
          // source or alert expiry. The next read starts before that moment,
          // so an open page keeps a verified level instead of waiting out
          // the rest of the poll interval.
          const remaining = showCurrent();
          if (remaining === null) {
            // A well-formed report already past its deadline: the server has
            // not turned it over yet, or this device's clock runs ahead. It
            // also replaces the earlier report, as a failed check does.
            storeStatus(null);
            setPhase("unavailable");
            nextRead = pace(0, true);
          } else {
            storeStatus(payload);
            if (previous) serverHoldsDeadline = previous.validUntil === payload.validUntil;
            // Inside the lead window, aim at the deadline itself.
            const lead = serverHoldsDeadline ? 0 : REFRESH_LEAD_MS;
            let wanted = remaining > lead ? remaining - lead : remaining;
            if (!payload.ok) wanted = Math.min(wanted, PARTIAL_REFRESH_MS);
            nextRead = pace(wanted, wanted < HURRIED_READ_MS || !payload.ok);
          }
        }
      } catch {
        if (!disposed && id === generation && visible()) {
          // A failed check outranks the earlier report, even inside its window.
          current = null;
          storeStatus(null);
          if (expiry) clearTimeout(expiry);
          expiry = undefined;
          setPhase("unavailable");
          nextRead = Math.min(POLL_INTERVAL_MS, FAILED_RETRY_MS * 2 ** failures);
          failures++;
        }
      } finally {
        if (onAbort) deadline.signal.removeEventListener("abort", onAbort);
        deadline.dispose();
        if (request === controller) request = null;
        if (!disposed && id === generation && visible()) {
          readDue = Date.now() + nextRead;
          timer = setTimeout(() => { timer = undefined; scheduleStatus(); }, nextRead);
        }
      }
    };
    const onVisibility = () => {
      if (visible()) {
        showCurrent();
        scheduleStatus();
      } else {
        cancel();
        setPhase("unavailable");
      }
    };
    const onPageHide = () => { cancel(); setPhase("unavailable"); };
    // The ordinary first pageshow follows a mount that has already started
    // its read. Only a back-forward cache restore needs a new one.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onVisibility(); };
    if (visible()) showCurrent();
    scheduleStatus();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
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
  const level = checking ? "Checking" : earlier || phase === "unavailable" ? "Unknown" : status?.level ?? "Unknown";
  const stateLabel = level === "Unknown" ? "Unable to verify" : level;
  const reportLabel = level === "Clear" ? countyStatusLabel(level) : stateLabel;
  const mobileLabel = level === "Unknown" ? "Unverified" : reportLabel;
  const statusLabel = earlier
    ? `County status: ${stateLabel}. ${checking ? "Checking again." : "Current check unavailable."} Earlier report had ${alertCount}; current alerts are unverified.`
    : checking
      ? "County status: checking"
      : phase === "unavailable" || !status || level === "Unknown"
        ? "County status: Unable to verify; current alerts are unverified"
        : active
          ? `County status: ${countyStatusLabel(status.level)}; ${alertCount} reported${status.ok === false ? "; some sources unavailable" : ""}`
          : `County status: ${countyStatusLabel(status.level)}; no active alerts`;
  const currentAlerts = active && !unverified;

  return (
    <AppTransitionLink
      data-pulse-indicator
      data-pulse-state={phase}
      data-pulse-mobile-visible
      href="/pulse"
      prefetch={false}
      aria-label={statusLabel}
      aria-current={current ? "page" : undefined}
      title={statusLabel}
      // The ground and the dot's cutout ring are set together in classes,
      // so the hover ground can win and the ring always matches what the
      // link actually paints: the header ground at rest, the inset gray when
      // current or hovered.
      className={`${
        current
          ? "bg-[var(--app-bg-sunken)] [--pulse-ground:var(--app-bg-sunken)]"
          : "bg-[var(--app-bg)] [--pulse-ground:var(--app-bg)]"
      } relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--app-radius-sm)] px-1.5 transition hover:bg-[var(--app-bg-sunken)] hover:[--pulse-ground:var(--app-bg-sunken)] sm:px-2.5`}
      style={{
        color: current
          ? "var(--app-link)"
          : currentAlerts
            ? TONE_FOREGROUND[tone]
            : "var(--app-ink)",
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
                  ? `0 0 0 2px var(--pulse-ground), 0 0 0 3px color-mix(in srgb, ${TONE_COLOR[tone]} 50%, transparent)`
                  : `0 0 0 2px var(--pulse-ground)`,
            }}
          />
        )}
        {/* Unavailable: a hollow ring, so "we don't know" never looks the same
            as the calm all-clear state (audit FR-002). */}
        {(!currentAlerts && (unknown || earlier)) && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full"
            style={{ boxShadow: "0 0 0 2px var(--pulse-ground), inset 0 0 0 1.5px currentColor" }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        <span className="text-[0.8125rem] font-semibold leading-tight">County status</span>
        <span data-pulse-mobile-state className="text-[0.75rem] leading-tight sm:hidden">{mobileLabel}</span>
        {stateLabel && <span data-pulse-desktop-state className="hidden text-[0.75rem] leading-tight sm:inline">{reportLabel}</span>}
      </span>
    </AppTransitionLink>
  );
}
