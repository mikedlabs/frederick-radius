"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { getOpenStatus, isDisplayOnlyHours } from "@/lib/hours";
import OpenClosedDot from "@/components/place/OpenClosedDot";
import { formatCheckedDay } from "@/lib/trust";

/** An open, closing-soon or closed state is only true for the minute it was computed. */
function isClockDependent(status: OpenStatus): boolean {
  return status.state === "open" || status.state === "closing-soon" || status.state === "closed";
}

/**
 * LiveOpenStatus — the detail status line, recomputed against the visitor's
 * clock. The place page hero and the place sheet both use it, so the two
 * surfaces say the same thing about the same place.
 *
 * The page is cached (revalidate 300, served stale while it revalidates), so
 * the server-baked open_status is as old as the last render of that page. On
 * a page nobody has opened since the last build that is many hours: a build
 * at 9:50 PM baked "Closing soon · 10pm" into Il Porto's page, and the first
 * visitor at 9 AM the next day saw it until hydration (November 2026
 * feedback review). An open, closing-soon or closed state is a claim about
 * this minute, so a baked one is never painted when the hours are here to
 * recompute it. The line holds its height with an empty placeholder until
 * the first effect tick computes the state from the SAME hours + verified
 * inputs against the visitor's clock, and a minute tick keeps it current so
 * the hero and the hours table cannot disagree for longer than the tick. The
 * states that do not depend on the time of day (unknown, unverified and a
 * display-only schedule) still paint from the server value at once.
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
  // Null means "not computed in this browser yet". Readers without scripts
  // get no status line, and the weekly table in HoursBlock still renders. A
  // display-only schedule never asserts a state, so it has nothing to wait for.
  const [status, setStatus] = useState<OpenStatus | null>(
    () => (hours && !isDisplayOnlyHours(hours) && isClockDependent(initial) ? null : initial),
  );

  useEffect(() => {
    if (!hours) return;
    const tick = () => setStatus(getOpenStatus(hours, { verified }, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, verified]);

  if (status === null) {
    // One text-xs line with no claim in it, so nothing below moves when the
    // computed state replaces it. The minimum width is close to a typical
    // state ("Open until 9pm"), so a price or other fact beside it in the
    // same row moves little when the state arrives.
    return <span aria-hidden data-place-status-pending className="inline-block min-w-[8.5rem] text-xs font-medium">{"\u00a0"}</span>;
  }
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
