"use client";

import { useMemo } from "react";
import {
  Coffee,
  Utensils,
  Beer,
  Trees,
  Palette,
  ShoppingBag,
  Toilet,
  SquareParking,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Amenity } from "@/lib/loaders/amenities";
import { metersToMinutes, type TravelMode } from "@/lib/geo";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { haptic } from "@/lib/haptics";

/**
 * WithinReach — the map's "you can reach X in N minutes" outcomes strip.
 *
 * Answers the question a stranger actually has — "what's close, and how
 * close?" — instead of "488 places in radius." For each useful kind it
 * finds the NEAREST match inside the current radius, derives walk/bike/
 * drive minutes, and renders a compact tappable chip. Sorted nearest
 * first so the quickest wins lead. Self-hides kinds with no match (and
 * the whole strip when nothing's reachable), so dialing the slider down
 * never shows empty placeholders. Live: the parent recomputes the inside
 * set on every slider/center change, so this tracks the radius.
 *
 * Supersedes the 3-tile BestNearbyMoves with a fuller, denser picture.
 */

type Group = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  cats?: string[]; // place categories that satisfy this kind
  amenity?: string; // OR an OSM amenity kind
};

const GROUPS: Group[] = [
  { key: "coffee", label: "Coffee", icon: Coffee, color: "var(--app-brand)", cats: ["coffee", "bakery"] },
  { key: "eat", label: "Eat", icon: Utensils, color: "#A02929", cats: ["restaurant", "pizza"] },
  { key: "drinks", label: "Drinks", icon: Beer, color: "#B26B00", cats: ["bar", "brewery"] },
  { key: "park", label: "Park", icon: Trees, color: "var(--app-brand-2)", cats: ["park", "trail", "playground", "outdoors"] },
  { key: "art", label: "Art", icon: Palette, color: "#7E2C6F", cats: ["gallery", "museum", "theater"] },
  { key: "shops", label: "Shops", icon: ShoppingBag, color: "var(--app-cool)", cats: ["shopping", "market", "book-store"] },
  { key: "restroom", label: "Restroom", icon: Toilet, color: "var(--app-cool)", amenity: "restroom" },
  { key: "parking", label: "Parking", icon: SquareParking, color: "var(--app-ink-3)", cats: ["parking"] },
];

type Reach = {
  group: Group;
  name: string;
  minutes: number;
  place?: PlaceCardData;
};

export default function WithinReach({
  places,
  amenities,
  mode,
}: {
  /** Inside-radius places, distance-decorated, distance-ascending. */
  places: PlaceCardData[];
  /** Inside-radius OSM amenities, distance-ascending. */
  amenities: (Amenity & { distance_m: number })[];
  mode: TravelMode;
}) {
  const { openSheet } = usePlaceSheet();

  const reach = useMemo<Reach[]>(() => {
    const out: Reach[] = [];
    for (const group of GROUPS) {
      if (group.cats) {
        const cats = new Set(group.cats);
        const hit = places.find(
          (p) =>
            cats.has(p.category) &&
            p.distance_m !== undefined &&
            p.open_status?.state !== "closed",
        );
        if (hit && hit.distance_m !== undefined) {
          out.push({
            group,
            name: hit.name,
            minutes: Math.max(1, metersToMinutes(mode, hit.distance_m)),
            place: hit,
          });
        }
      } else if (group.amenity) {
        const hit = amenities.find((a) => a.kind === group.amenity);
        if (hit) {
          out.push({
            group,
            name: hit.name ?? group.label,
            minutes: Math.max(1, metersToMinutes(mode, hit.distance_m)),
          });
        }
      }
    }
    // Nearest opportunities first.
    return out.sort((a, b) => a.minutes - b.minutes);
  }, [places, amenities, mode]);

  if (reach.length === 0) return null;

  return (
    <section aria-label="Within reach" className="space-y-2">
      <h2 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        Within reach
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {reach.map((r) => {
          const Icon = r.group.icon;
          const tappable = Boolean(r.place);
          const Tag = tappable ? "button" : "div";
          return (
            <li key={r.group.key}>
              <Tag
                type={tappable ? "button" : undefined}
                title={r.name}
                onClick={
                  tappable
                    ? () => {
                        haptic("light");
                        openSheet(r.place!);
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] py-1.5 pl-2 pr-2.5 text-left transition ${
                  tappable ? "tactile-interactive active:scale-[0.96]" : ""
                }`}
                style={{ borderColor: "var(--app-border)" }}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${r.group.color} 16%, transparent)` }}
                  aria-hidden
                >
                  <Icon className="h-3 w-3" strokeWidth={2.25} style={{ color: r.group.color }} />
                </span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {r.group.label}
                </span>
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: r.group.color }}
                >
                  {r.minutes}m
                </span>
              </Tag>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Nearest of each, by {mode === "drive" ? "drive" : mode === "bike" ? "bike" : "walk"} time. Tap to open.
      </p>
    </section>
  );
}
