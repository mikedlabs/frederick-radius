import Link from "next/link";
import { Crosshair, Layers } from "lucide-react";

/**
 * MapModeToggle — Radius / Browse pill that lives at the top of /map.
 *
 * Radius is the default mode (the "soul of the map" per the May 2026
 * brand review). Browse stays available for the user who knows what
 * they're looking for AND doesn't want a fixed center — same map
 * data, no isochrone overlay, classic intent + time chips.
 *
 * Server component; links carry the next mode in `?mode=`. We
 * preserve only the params relevant to the destination mode so a
 * Radius URL doesn't drag along the Browse mode's `?intent=` baggage
 * (and vice versa). The pill sits inside MapIntentChips' container
 * on browse mode and inside RadiusBuilder's overlay on radius mode.
 */
export default function MapModeToggle({
  mode,
}: {
  mode: "radius" | "browse";
}) {
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition"
        style={{
          background: mode === "radius" ? "var(--app-brand)" : "transparent",
          color: mode === "radius" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Crosshair className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Radius
      </Link>
      <Link
        role="tab"
        aria-selected={mode === "browse"}
        href="/map?mode=browse"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition"
        style={{
          background: mode === "browse" ? "var(--app-brand)" : "transparent",
          color: mode === "browse" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Layers className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Browse
      </Link>
    </div>
  );
}
