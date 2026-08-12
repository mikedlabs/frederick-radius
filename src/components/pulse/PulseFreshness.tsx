"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const PULSE_AUTO_REFRESH_MS = 2 * 60_000;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60_000;

export function pulseSnapshotNeedsRefresh(
  renderedAt: number,
  now: number = Date.now(),
): boolean {
  if (!Number.isFinite(renderedAt) || !Number.isFinite(now)) return true;
  const age = now - renderedAt;
  return age < -FUTURE_CLOCK_TOLERANCE_MS || age >= PULSE_AUTO_REFRESH_MS;
}

export function formatPulseSnapshotTime(renderedAt: number): string {
  const date = new Date(renderedAt);
  if (!Number.isFinite(date.getTime())) return "time unavailable";
  // `Intl.DateTimeFormat#format` may join the date and time with either a
  // comma or the word "at" across Node and browser ICU builds. Assemble the
  // same Eastern label from parts so hydration never changes the punctuation.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  const dayPeriod = part("dayPeriod");
  if (!month || !day || !hour || !minute || !dayPeriod) {
    return "time unavailable";
  }
  return `${month} ${day}, ${hour}:${minute} ${dayPeriod}`;
}

/** A quiet claim expires with the page snapshot. Warning, partial-data, and
 * active-alert labels remain intact because they are already conservative. */
export function pulseStatusForSnapshot(
  status: string,
  canClaimCurrent: boolean,
  renderedAt: number,
  now: number = Date.now(),
): string {
  return canClaimCurrent && pulseSnapshotNeedsRefresh(renderedAt, now)
    ? "Updating"
    : status;
}

export function PulseStatusLabel({
  renderedAt,
  status,
  canClaimCurrent,
  color,
}: {
  renderedAt: number;
  status: string;
  canClaimCurrent: boolean;
  color: string;
}) {
  // Derive the first value during the server render too. A cached stale page
  // must not ship "All quiet" to reader mode and then correct itself only
  // after hydration. The warning suppression covers the narrow case where
  // the two-minute boundary passes between server render and hydration.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [renderedAt]);

  const label = pulseStatusForSnapshot(
    status,
    canClaimCurrent,
    renderedAt,
    now,
  );
  const updating = label !== status;

  return (
    <span
      suppressHydrationWarning
      aria-live="polite"
      className="mt-0.5 block text-[12px] font-semibold"
      style={{ color: updating ? "var(--app-warning)" : color }}
    >
      {label}
    </span>
  );
}

/**
 * PulseFreshness — a live "page refreshed Ns ago" counter measured from when the
 * server assembled the page. Individual feeds can be older and show their own
 * timestamps inside the board. Before hydration it renders the server's
 * absolute Eastern timestamp, so reader mode and no-JavaScript visitors still
 * get a useful freshness marker. The relative counter takes over after mount.
 *
 * This is the small, honest signal the dashboard was missing: visible proof
 * the page is a live read, not a static snapshot. The number climbs until the
 * page revalidates (ISR, 120s) and re-renders with a fresh timestamp, so the
 * count is the age of this page assembly, not a claim that every provider published
 * new data at that moment.
 */
export default function PulseFreshness({ renderedAt }: { renderedAt: number }) {
  const [sec, setSec] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      const age = Date.now() - renderedAt;
      setSec(Number.isFinite(age) ? Math.max(0, Math.round(age / 1000)) : null);
    };
    tick();
    // A half-minute cadence keeps the counter honest without the nervous
    // second-by-second flicker in the masthead (owner report, 2026-07-18).
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [renderedAt]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!pulseSnapshotNeedsRefresh(renderedAt)) return;
      router.refresh();
    };
    const id = window.setInterval(refreshIfVisible, PULSE_AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    // A cached page can already be older than the refresh window when it
    // mounts. Check once immediately instead of waiting another two minutes.
    const initial = window.setTimeout(refreshIfVisible, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(initial);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [renderedAt, router]);

  if (sec === null) {
    const renderedDate = new Date(renderedAt);
    return (
      <time
        dateTime={
          Number.isFinite(renderedDate.getTime())
            ? renderedDate.toISOString()
            : undefined
        }
        className="shrink-0 whitespace-nowrap text-[10px] font-medium normal-case tracking-normal tabular-nums"
      >
        As of {formatPulseSnapshotTime(renderedAt)}
      </time>
    );
  }

  const label =
    sec < 60
      ? "now"
      : sec < 3600
        ? `${Math.floor(sec / 60)}m ago`
        : `${Math.floor(sec / 3600)}h ago`;
  const needsRefresh = sec * 1000 >= PULSE_AUTO_REFRESH_MS;

  // Inherit the surrounding ink: this renders inside the DARK hero eyebrow,
  // where the old hardcoded --app-ink-3 (a light-ground gray) made the one
  // line proving the page is live nearly invisible.
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] font-medium normal-case tracking-normal tabular-nums">
      {needsRefresh ? `Page last refreshed ${label}` : `Page refreshed ${label}`}
    </span>
  );
}
