"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * MapMarkFab — the contextual "Mark a spot" action, floating over the map.
 *
 * "Mark" used to sit as a bright center button in the primary nav, but
 * reporting is low-frequency and marking only makes sense where a spot exists.
 * So it lives here now, on /map, where dropping a pin is in context. Calmer
 * than the old solid-red nav cell: an elevated pill with a small vermilion
 * plus, so it's clearly the contribute action without shouting over the map.
 */
export default function MapMarkFab() {
  return (
    <Link
      href="/report"
      onPointerDown={() => haptic("light")}
      aria-label="Mark a spot: a hazard, condition, tip, or note"
      className="tap-44 pointer-events-auto inline-flex items-center gap-2 rounded-full border py-2 pl-2 pr-3.5 text-[13px] font-semibold transition active:scale-[0.97]"
      style={{
        background: "var(--app-bg-elevated-solid)",
        borderColor: "var(--app-border)",
        color: "var(--app-ink)",
        boxShadow: "0 8px 22px -8px rgba(20,20,18,0.28), var(--app-edge), var(--app-hi)",
      }}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full text-white"
        style={{ background: "var(--app-brand)" }}
        aria-hidden
      >
        <Plus className="h-4 w-4" strokeWidth={2.75} />
      </span>
      Mark a spot
    </Link>
  );
}
