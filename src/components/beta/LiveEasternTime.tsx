"use client";

import { useEffect, useState } from "react";
import { formatEasternClock } from "@/lib/format/easternClock";

/**
 * LiveEasternTime — the minute in the /beta "right now" line, kept true.
 *
 * The page is server-rendered per request, so the minute is honest the
 * instant it loads. This lets it stay honest while the tab sits open: on
 * mount it takes over and refreshes the value at the top of each minute.
 *
 * This is data freshness, not animation. The text simply changes; there is
 * no transform, opacity, or transition, so there is nothing for
 * prefers-reduced-motion to disable. No aria-live either, because a screen
 * reader should not announce the time every sixty seconds.
 *
 * Progressive enhancement: with JavaScript off, the server-seeded `initial`
 * stands, showing the request-time minute. That honesty is why /beta must
 * stay dynamic (no ISR) — a cached minute would be a small lie.
 */
export default function LiveEasternTime({ initial, iso }: { initial: string; iso: string }) {
  const [{ label, at }, setClock] = useState({ label: initial, at: iso });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const now = new Date();
      setClock({ label: formatEasternClock(now), at: now.toISOString() });
    };
    // Align the first update to the top of the next minute, then run every
    // minute after that, so the displayed value flips exactly when it changes.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return <time dateTime={at}>{label}</time>;
}
