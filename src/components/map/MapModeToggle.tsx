"use client";

import { Crosshair, Layers } from "lucide-react";
import Segmented, { type SegmentItem } from "@/components/ui/Segmented";

/**
 * MapModeToggle — Radius / Browse pill that lives at the top of /map.
 *
 * Radius is the default mode (the "soul of the map" per the May 2026
 * brand review). Browse stays available for the user who knows what
 * they're looking for AND doesn't want a fixed center — same map
 * data, no isochrone overlay, classic intent + time chips.
 *
 * Built on the canonical Segmented primitive (link segments, which
 * carry the pending spinner so a slow Browse fetch never feels
 * "stuck"). The glassy floating backdrop is preserved via the wrapper
 * so the control stays legible over map tiles. Links carry the next
 * mode in `?mode=`; the route drops the other mode's params so a
 * Radius URL doesn't drag along Browse's `?intent=` (and vice versa).
 */

const ITEMS: ReadonlyArray<SegmentItem<"radius" | "browse">> = [
  { key: "radius", label: "Radius", icon: Crosshair, href: "/explore?mode=radius" },
  { key: "browse", label: "Browse", icon: Layers, href: "/explore?mode=browse" },
];

export default function MapModeToggle({
  mode,
}: {
  mode: "radius" | "browse";
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-full"
      style={{
        backdropFilter: "blur(12px) saturate(1.15)",
        WebkitBackdropFilter: "blur(12px) saturate(1.15)",
      }}
    >
      <Segmented ariaLabel="Map mode" value={mode} items={ITEMS} size="sm" />
    </div>
  );
}
