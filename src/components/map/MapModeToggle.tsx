"use client";

import Link, { useLinkStatus } from "next/link";
import { Crosshair, Layers, Loader2 } from "lucide-react";

/**
 * MapModeToggle — Radius / Browse pill that lives at the top of /map.
 *
 * Radius is the default mode (the "soul of the map" per the May 2026
 * brand review). Browse stays available for the user who knows what
 * they're looking for AND doesn't want a fixed center — same map
 * data, no isochrone overlay, classic intent + time chips.
 *
 * Why this is a client component: tapping "Browse" re-runs the /map
 * server component, which fetches a lot (traffic, 311, Mapillary,
 * trails, transit, boundaries, river gauges, the full event union)
 * before it can paint. With a bare <Link> that round-trip had ZERO
 * feedback — the tab looked dead for a beat, so it "felt stuck." We
 * now read useLinkStatus() per tab and swap the glyph for a spinner
 * the instant it's pressed, so the press always registers. Next keeps
 * the current map visible during the fetch (same route segment, only
 * ?mode changes), so there's no blank flash either way.
 *
 * Links carry the next mode in `?mode=`; we drop the other mode's
 * params so a Radius URL doesn't drag along Browse's `?intent=` (and
 * vice versa).
 */

function TabBody({
  icon: Icon,
  label,
}: {
  icon: typeof Crosshair;
  label: string;
}) {
  // useLinkStatus reflects the pending state of the nearest ancestor
  // <Link>, so each tab knows when ITS navigation is in flight.
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} aria-hidden />
      ) : (
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      )}
      {label}
    </>
  );
}

export default function MapModeToggle({
  mode,
}: {
  mode: "radius" | "browse";
}) {
  // Min 40px tall, comfortable horizontal padding, and an active press
  // scale so the pill reads as a real, hittable control — the old
  // ~28px target was easy to miss and gave no touch feedback.
  const tabClass =
    "inline-flex min-h-[40px] items-center gap-1.5 px-4 py-2 text-[12px] font-semibold transition active:scale-[0.95]";

  return (
    <div
      role="tablist"
      aria-label="Map mode"
      className="inline-flex shrink-0 overflow-hidden rounded-full border"
      style={{
        background:
          "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
        borderColor: "var(--app-border)",
        backdropFilter: "blur(12px) saturate(1.15)",
        WebkitBackdropFilter: "blur(12px) saturate(1.15)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <Link
        role="tab"
        aria-selected={mode === "radius"}
        href="/map?mode=radius"
        className={tabClass}
        style={{
          background: mode === "radius" ? "var(--app-brand)" : "transparent",
          color: mode === "radius" ? "white" : "var(--app-ink-2)",
        }}
      >
        <TabBody icon={Crosshair} label="Radius" />
      </Link>
      <Link
        role="tab"
        aria-selected={mode === "browse"}
        href="/map?mode=browse"
        className={tabClass}
        style={{
          background: mode === "browse" ? "var(--app-brand)" : "transparent",
          color: mode === "browse" ? "white" : "var(--app-ink-2)",
        }}
      >
        <TabBody icon={Layers} label="Browse" />
      </Link>
    </div>
  );
}
