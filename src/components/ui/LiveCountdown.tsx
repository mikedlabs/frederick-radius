"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * A quietly ticking "in 2h 08m" — the field-guide instrument register for
 * time-until facts (first pitch, golden hour). Client-only and mount-gated:
 * the server renders nothing, the countdown fades in after hydration, so the
 * ISR'd page never bakes a stale relative time (the audit's "Now" lesson) and
 * there is no hydration mismatch. Updates every 30s; renders nothing once the
 * moment passes or when it is further out than `windowHours`.
 */
export default function LiveCountdown({
  targetIso,
  prefix = "in",
  windowHours = 12,
  className,
  style,
}: {
  targetIso: string;
  /** Text before the time, e.g. "in" → "in 42m". */
  prefix?: string;
  /** Hide when the target is further out than this many hours. */
  windowHours?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const target = Date.parse(targetIso);
    if (!Number.isFinite(target)) return;
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0 || ms > windowHours * 3_600_000) {
        setLabel(null);
        return;
      }
      const mins = Math.round(ms / 60_000);
      setLabel(mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : `${mins}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [targetIso, windowHours]);

  if (!label) return null;
  return (
    <span className={className} style={style}>
      {prefix} {label}
    </span>
  );
}
