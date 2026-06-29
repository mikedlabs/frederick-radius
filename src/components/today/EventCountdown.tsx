"use client";

import { useEffect, useState } from "react";
import { isHappeningNow } from "@/lib/live-activity";

const WINDOW_MIN = 90; // only speak within ~90 min of the start

/**
 * EventCountdown — a tiny live clause appended to the tonight-event eyebrow in
 * TodayCard ("Tonight · in 40 min" / "Tonight · On now"). Renders nothing unless
 * the event starts within ~90 minutes or is happening now, so time-sensitivity
 * is FELT without nagging. Inherits currentColor so it stays legible over any
 * sky tone. Mounted-gated (renders null until the client ticks) so there is no
 * SSR/hydration divergence; reuses isHappeningNow for the honest "On now" test.
 */
export default function EventCountdown({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt?: string | null;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount clock start; SSR has no live clock, gating on null avoids a hydration mismatch
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30_000); // match LiveClock cadence
    return () => clearInterval(id);
  }, []);

  if (nowMs === null) return null; // pre-mount: nothing (no server/client divergence)
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;

  if (isHappeningNow(startsAt, endsAt, new Date(nowMs))) {
    return (
      <span>
        <span aria-hidden> · </span>
        <span
          aria-hidden
          className="live-dot mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
          style={{ background: "currentColor" }}
        />
        On now
      </span>
    );
  }

  const mins = Math.round((start - nowMs) / 60_000);
  if (mins <= 0 || mins > WINDOW_MIN) return null; // already ended, or too far out
  const label = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return <span> · {label}</span>;
}
