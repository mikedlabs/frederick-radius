"use client";

import { Crosshair, Map as MapIcon } from "lucide-react";
import Segmented, { type SegmentItem } from "@/components/ui/Segmented";

/**
 * MapModeToggle — the Nearby / Whole county pill at the top of /map.
 *
 * Browse (Whole county) is the default landing — the clean full-map
 * surface, no isochrone, no bottom sheet (the owner's "the map IS the
 * page" direction). Radius ("Nearby") stays a deliberate opt-in: the
 * guided within-reach tool with its isochrone + control sheet. The May
 * 2026 brand review had made radius the default ("soul of the map");
 * this flips the landing to the clean map while keeping both modes.
 *
 * The labels are TASK language, not architecture: "Radius | Browse"
 * named our two internal modes and made the user decode them. "Nearby"
 * says what radius mode answers (what's within reach of this center —
 * honest even when the center is a town, not the user); "Whole county"
 * says what browse shows. The browse icon is the map glyph, not the
 * layers glyph — browse now HAS a Layers control, and two different
 * things wearing the same icon read as one thing.
 *
 * Built on the canonical Segmented primitive (link segments, which
 * carry the pending spinner so a slow Browse fetch never feels
 * "stuck"). The glassy floating backdrop is preserved via the wrapper
 * so the control stays legible over map tiles. Links carry the next
 * mode in `?mode=`; the route drops the other mode's params so a
 * Radius URL doesn't drag along Browse's `?intent=` (and vice versa).
 */

const ITEMS: ReadonlyArray<SegmentItem<"radius" | "browse">> = [
  { key: "radius", label: "Nearby", icon: Crosshair, href: "/map?mode=radius" },
  { key: "browse", label: "Whole county", icon: MapIcon, href: "/map?mode=browse" },
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
