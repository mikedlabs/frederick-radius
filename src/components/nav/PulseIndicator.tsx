"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";

/**
 * PulseIndicator — header dot that lights up when something is
 * happening in Frederick County (NWS alerts, school alerts, traffic
 * incidents, power outages).
 *
 * Fetches /api/pulse/status on mount + every 5 minutes. The endpoint
 * is cached server-side so polling is cheap. When all clear,
 * renders the icon in muted ink so the affordance is still
 * discoverable but doesn't compete with anything else. When active,
 * a small colored dot rides the top-right corner of the icon button.
 *
 * Lives in TopBar between the More icon and the LocationChip — same
 * grid spot the old "Pulse" tile occupied in the Field Guide drawer.
 */
type PulseStatus = {
  active: boolean;
  count: number;
  tone: "alert" | "caution" | "quiet";
};

const TONE_COLOR: Record<PulseStatus["tone"], string> = {
  alert: "var(--app-negative, #C0392B)",
  caution: "var(--app-warning, #B8860B)",
  quiet: "var(--app-positive)",
};

export default function PulseIndicator() {
  const [status, setStatus] = useState<PulseStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/pulse/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as PulseStatus;
        if (!cancelled) setStatus(json);
      } catch {
        // silent — header doesn't render an error for a polling util
      }
    };
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const active = status?.active ?? false;
  const tone = status?.tone ?? "quiet";
  const count = status?.count ?? 0;

  return (
    <Link
      href="/pulse"
      aria-label={
        active
          ? `County alerts: ${count} active ${count === 1 ? "item" : "items"}`
          : "County alerts: all clear"
      }
      title={active ? `County alerts: ${count} active` : "County alerts: all clear"}
      className="tap-44 relative grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
      style={{
        borderColor: "var(--app-border)",
        color: active ? TONE_COLOR[tone] : "var(--app-ink-3)",
      }}
    >
      <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      {active && (
        <span
          aria-hidden
          className="absolute right-1 top-1 inline-flex h-2 w-2 items-center justify-center rounded-full"
          style={{
            background: TONE_COLOR[tone],
            boxShadow:
              tone === "alert"
                ? `0 0 0 2px var(--app-bg-elevated), 0 0 0 3px color-mix(in srgb, ${TONE_COLOR[tone]} 50%, transparent)`
                : `0 0 0 2px var(--app-bg-elevated)`,
          }}
        />
      )}
    </Link>
  );
}
