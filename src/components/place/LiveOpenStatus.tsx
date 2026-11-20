"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { getOpenStatus, isDisplayOnlyHours } from "@/lib/hours";
import OpenClosedDot from "@/components/place/OpenClosedDot";
import { formatCheckedDay } from "@/lib/trust";

/**
 * LiveOpenStatus — the detail status line, recomputed against the visitor's
 * clock. The place page hero and the place sheet both use it, so the two
 * surfaces say the same thing about the same place.
 *
 * The page is ISR (revalidate 300), so the server-baked open_status can be
 * minutes stale: around a closing time the hero said "Closing soon · 10pm"
 * while HoursBlock below (client-computed) said "Closed" — two opposite
 * claims on one screen (fresh-eyes audit, Jul 2026). Same fix class as the
 * /map stale-status repair (W1): render the server value as the
 * pre-hydration fallback, then recompute from the SAME hours + verified
 * inputs on mount and on a minute tick so the hero and the hours table can
 * never disagree for more than the tick.
 *
 * One line carries the answer and its caveat together. A confirmed open,
 * closing-soon or closed state is the answer by itself. When the hours are
 * not confirmed, or only qualify part of the venue, the line keeps that
 * caveat in plain words and follows it with the date the hours themselves
 * were last checked (`hoursCheckedAt`), when one exists. The listing-level
 * check date never appears here; it belongs in the source line.
 *
 * Places without structured hours keep the server status untouched - there
 * is nothing fresher to compute from.
 */
export default function LiveOpenStatus({
  hours,
  verified,
  initial,
  hoursCheckedAt,
}: {
  hours?: Hours;
  verified: boolean;
  initial: OpenStatus;
  /** When the hours were last observed at their source (place.hours_updated_at). */
  hoursCheckedAt?: string;
}) {
  const [status, setStatus] = useState<OpenStatus>(initial);

  useEffect(() => {
    if (!hours) return;
    const tick = () => setStatus(getOpenStatus(hours, { verified }, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, verified]);

  // A current scoped schedule is not a failed refresh, and a stale initial
  // open state must never override its display-only qualification before mount.
  const answer = isDisplayOnlyHours(hours)
    ? <span className="text-xs font-medium" style={{ color: "var(--app-ink-3)" }}>Venue opening not confirmed</span>
    : status.state === "unknown"
      ? <span className="text-xs font-medium" style={{ color: "var(--app-ink-3)" }}>Hours not recently confirmed</span>
      : <OpenClosedDot status={status} />;
  const caveated = isDisplayOnlyHours(hours) || status.state === "unknown" || status.state === "unverified";
  const checkedDay = caveated ? formatCheckedDay(hoursCheckedAt) : null;
  if (!checkedDay) return answer;
  // A caveat keeps a plain date under it. The green "checked at source"
  // freshness badge would contradict "not recently confirmed" for the week
  // after hours stop being published but before the check is two weeks old.
  // The date takes its own line so a narrow screen never starts a row with
  // a separator dot.
  return (
    <span data-place-status-line className="inline-flex flex-col items-start gap-0.5">
      {answer}
      <span className="sr-only">. </span>
      <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>
        Hours last checked {checkedDay}
      </span>
    </span>
  );
}
