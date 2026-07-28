"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Truck, ChevronRight, Radio } from "lucide-react";
import { FOOD_TRUCKS } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * FoodTruckToday — a calm discovery door to the food-truck roster.
 *
 * Deliberately NOT a live claim: until trucks opt into beacons we can't say
 * who's out right now, so this is a "here's the county's trucks, check their
 * feeds" entry, not a made-up "3 trucks open now" headline. A real operator
 * beacon upgrades the card automatically; otherwise it previews the feature.
 */
export default function FoodTruckToday() {
  const accent = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";
  const count = FOOD_TRUCKS.length;
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/food-trucks/live", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { pins?: unknown[] };
        if (active) setLiveCount(Array.isArray(body.pins) ? body.pins.length : 0);
      } catch {
        // The roster remains useful when the optional live read fails.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/food-trucks"
      className="tactile tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${accent} 15%, var(--app-bg-elevated))`, color: accent }}
      >
        {liveCount > 0 ? <Radio className="h-5 w-5" strokeWidth={2} /> : <Truck className="h-5 w-5" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {liveCount > 0 ? `${liveCount} food ${liveCount === 1 ? "truck is" : "trucks are"} live` : "Food trucks & carts"}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {liveCount > 0
            ? "See the operator-confirmed location and when the pin expires."
            : `${count} local vendors are listed. Open the schedule for confirmed upcoming stops.`}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2}
        style={{ color: "var(--app-ink-3)" }}
      />
    </Link>
  );
}
