"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_MS = 2 * 60_000;

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
  const router = useRouter();

  useEffect(() => {
    const tick = () => setSec(Math.max(0, Math.round((Date.now() - renderedAt) / 1000)));
    tick();
    // A half-minute cadence keeps the counter honest without the nervous
    // second-by-second flicker in the masthead (owner report, 2026-07-18).
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [renderedAt]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - renderedAt < AUTO_REFRESH_MS) return;
      router.refresh();
    };
    const id = window.setInterval(refreshIfVisible, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [renderedAt, router]);

  if (sec === null) return null;

  const label =
    sec < 60
      ? "just now"
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
