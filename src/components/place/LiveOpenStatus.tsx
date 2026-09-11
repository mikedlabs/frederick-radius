"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { getOpenStatus } from "@/lib/hours";
import OpenClosedDot from "@/components/place/OpenClosedDot";

/**
 * LiveOpenStatus — the detail hero's open/closed line, recomputed against
 * the visitor's clock.
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
 * Places without structured hours keep the server status untouched - there
 * is nothing fresher to compute from.
 */
export default function LiveOpenStatus({
  hours,
  verified,
  initial,
}: {
  hours?: Hours;
  verified: boolean;
  initial: OpenStatus;
}) {
  const [status, setStatus] = useState<OpenStatus>(initial);

  useEffect(() => {
    if (!hours) return;
    const tick = () => setStatus(getOpenStatus(hours, { verified }, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, verified]);

  return <OpenClosedDot status={status} />;
}
