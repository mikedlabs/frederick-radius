"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { agoLabel, untilLabel } from "@/lib/format/relativeTime";

/**
 * LiveTime — one primitive for every "ticking" time label on the app.
 *
 *   mode="since"  counts UP from `from` (a render / fetch timestamp)
 *                 → "updated 2m ago". The number IS the data's real age.
 *   mode="until"  counts DOWN to `to` (an event / sunset / fireworks time)
 *                 → "in 1h 49m", ending on "now".
 *
 * SSR-safe: renders `fallback` (default nothing) on the server and the first
 * client paint, then fills in and ticks — so there's never a hydration
 * mismatch on a value that depends on the wall clock. This is the general
 * form of PulseFreshness; new surfaces should reach for LiveTime.
 *
 * Reduced-motion note: time is information, not decoration, so the label
 * still updates under prefers-reduced-motion. There is no visual flourish to
 * suppress — only a text swap on an interval.
 */
export default function LiveTime({
  mode,
  from,
  to,
  prefix = "",
  suffix = "",
  intervalMs,
  className,
  style,
  fallback = null,
}: {
  mode: "since" | "until";
  /** Epoch ms the "since" count measures from (usually the server render time). */
  from?: number;
  /** Epoch ms the "until" count counts down to. */
  to?: number;
  prefix?: string;
  suffix?: string;
  /** Override the tick interval. Defaults: 1s for countdowns, 15s for "ago". */
  intervalMs?: number;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      if (mode === "since" && from != null) setLabel(agoLabel(now - from));
      else if (mode === "until" && to != null) setLabel(untilLabel(to - now));
      else setLabel(null);
    };
    compute();
    const ms = intervalMs ?? (mode === "until" ? 1000 : 15_000);
    const id = setInterval(compute, ms);
    return () => clearInterval(id);
  }, [mode, from, to, intervalMs]);

  if (label === null) return <>{fallback}</>;
  return (
    <span className={className} style={style}>
      {prefix}
      {label}
      {suffix}
    </span>
  );
}
