"use client";

import { useMemo } from "react";
import { Coffee, Trees, Toilet } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Amenity } from "@/lib/loaders/amenities";
import { metersToMinutes, type TravelMode } from "@/lib/geo";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { haptic } from "@/lib/haptics";

/**
 * BestNearbyMoves — three curated "best move right now" tiles that
 * sit between the map ribbon and the radius controls.
 *
 * Pre-launch review §4 caught that /radius reads as a directory
 * ("104 places in radius") rather than an assistive surface ("here's
 * the coffee shop you should walk to right now"). The page has the
 * data to do better; it just wasn't surfacing it.
 *
 * Picks
 *   - Coffee within reach (categories: coffee, bakery)
 *   - Public restroom within reach (amenity kind: restroom)
 *   - Park within reach (categories: park, trail, outdoors, playground)
 *
 * Each tile picks the NEAREST match in the current radius, derives
 * the walk/bike/drive minutes from the current mode, and opens the
 * place's detail sheet on tap. When a slot has no match inside the
 * current radius (e.g. dialing way down on the slider) the tile
 * self-hides rather than rendering a sad empty state.
 *
 * Live-updating: the parent recomputes `inside` and `insideAmenities`
 * on every slider/center change, so this component naturally tracks
 * the radius as the user explores.
 */

const COFFEE_CATS = new Set(["coffee", "bakery"]);
const PARK_CATS = new Set(["park", "trail", "outdoors", "playground"]);

type Pick = {
  /** What kind of move this slot represents. Drives icon + tint. */
  kind: "coffee" | "restroom" | "park";
  label: string;
  /** Human-readable name of the destination. */
  name: string;
  /** Walk/bike/drive minutes to this destination. */
  minutes: number;
  /** When the slot is a real Place, we can open the sheet. */
  place?: PlaceCardData;
};

export default function BestNearbyMoves({
  places,
  amenities,
  mode,
}: {
  /** Already filtered to "inside radius" by the parent + decorated
   *  with distance_m. Distance-ascending recommended. */
  places: PlaceCardData[];
  /** OSM amenity points already filtered to "inside radius" + scored
   *  by haversine distance from the center. Distance-ascending. */
  amenities: (Amenity & { distance_m: number })[];
  /** Current radius mode — drives the minute-from-meters formula. */
  mode: TravelMode;
}) {
  const { openSheet } = usePlaceSheet();

  const picks = useMemo<Pick[]>(() => {
    const out: Pick[] = [];

    // Closest coffee (or bakery, which functions as the same morning
    // stop for most users).
    const coffee = places.find(
      (p) =>
        COFFEE_CATS.has(p.category) &&
        p.distance_m !== undefined &&
        p.open_status?.state !== "closed",
    );
    if (coffee && coffee.distance_m !== undefined) {
      out.push({
        kind: "coffee",
        label: "Coffee within reach",
        name: coffee.name,
        minutes: Math.max(1, metersToMinutes(mode, coffee.distance_m)),
        place: coffee,
      });
    }

    // Closest restroom — the OSM amenity layer is the canonical
    // source. No "open_status" check because public restrooms in
    // parks rarely have hours data; if they do, fine.
    const restroom = amenities.find((a) => a.kind === "restroom");
    if (restroom) {
      out.push({
        kind: "restroom",
        label: "Public restroom",
        name: restroom.name ?? "Public restroom",
        minutes: Math.max(1, metersToMinutes(mode, restroom.distance_m)),
      });
    }

    // Closest park / trail / outdoor space.
    const park = places.find(
      (p) => PARK_CATS.has(p.category) && p.distance_m !== undefined,
    );
    if (park && park.distance_m !== undefined) {
      out.push({
        kind: "park",
        label: "Park within reach",
        name: park.name,
        minutes: Math.max(1, metersToMinutes(mode, park.distance_m)),
        place: park,
      });
    }

    return out;
  }, [places, amenities, mode]);

  if (picks.length === 0) return null;

  return (
    <section
      aria-label="Best nearby moves"
      className="space-y-2"
    >
      <h2
        className="eyebrow px-1"
        style={{ color: "var(--app-ink-3)" }}
      >
        Best nearby moves
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {picks.map((p) => {
          const Icon = ICON[p.kind];
          const color = COLOR[p.kind];
          const onTap = () => {
            if (!p.place) return;
            haptic("light");
            openSheet(p.place);
          };
          const Wrapper = p.place ? "button" : "div";
          return (
            <li key={p.kind}>
              <Wrapper
                type={p.place ? "button" : undefined}
                onClick={p.place ? onTap : undefined}
                className={`flex w-full items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 text-left transition ${
                  p.place ? "hover-lift" : ""
                }`}
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow:
                    "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${color} 14%, transparent)`,
                  }}
                  aria-hidden
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={2}
                    style={{ color }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12px] font-bold uppercase tracking-[0.04em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {p.label}
                  </span>
                  <span
                    className="block truncate text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {p.name}
                  </span>
                  <span
                    className="block text-[11px] tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {p.minutes} min {mode === "drive" ? "drive" : mode === "bike" ? "bike" : "walk"}
                  </span>
                </span>
              </Wrapper>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ICON = {
  coffee: Coffee,
  restroom: Toilet,
  park: Trees,
} as const;

const COLOR = {
  coffee: "var(--app-brand)",
  restroom: "var(--app-cool)",
  park: "var(--app-brand-2)",
} as const;
