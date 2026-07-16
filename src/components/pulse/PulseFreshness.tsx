"use client";

import { useEffect, useState } from "react";

/**
 * PulseFreshness — a live "updated Ns ago" counter that ticks every second,
 * measured from when the server rendered the page (i.e. when the feeds were
 * fetched). It renders NOTHING on the server / first paint (so there's no
 * hydration mismatch), then fills in and counts up.
 *
 * This is the small, honest signal the dashboard was missing: visible proof
 * the page is a live read, not a static snapshot. The number climbs until the
 * page revalidates (ISR, 120s) and re-renders with a fresh timestamp, so the
 * count IS the data's real age — never faked.
 */
export default function PulseFreshness({ renderedAt }: { renderedAt: number }) {
  const [sec, setSec] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setSec(Math.max(0, Math.round((Date.now() - renderedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [renderedAt]);

  if (sec === null) return null;

  const label =
    sec < 60
      ? `${sec}s ago`
      : sec < 3600
        ? `${Math.floor(sec / 60)}m ago`
        : `${Math.floor(sec / 3600)}h ago`;

  // Inherit the surrounding ink: this renders inside the DARK hero eyebrow,
  // where the old hardcoded --app-ink-3 (a light-ground gray) made the one
  // line proving the page is live nearly invisible.
  return (
    <span className="tabular-nums">
      · updated {label}
    </span>
  );
}
