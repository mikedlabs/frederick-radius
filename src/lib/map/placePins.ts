import "server-only";

import { decoratePlace, publicPlaces } from "@/lib/loaders/places";
import type { MapPinPlace } from "@/components/map/types";

/**
 * The map only needs enough place data to draw, filter, rank and open a slug.
 * Keep this as an allowlist: adding a field here increases a county-wide
 * response by roughly the field size multiplied by every published place.
 */
export function mapPinPlace(
  place: Parameters<typeof decoratePlace>[0],
  now: Date,
): MapPinPlace {
  const decorated = decoratePlace(place, undefined, now);
  const pin: MapPinPlace = {
    slug: decorated.slug,
    name: decorated.name,
    category: decorated.category,
    subcategories: decorated.subcategories,
    geom: decorated.geom,
    open_status: decorated.open_status,
    is_verified: decorated.is_verified,
    field_notes: decorated.field_notes,
    source: decorated.source,
    municipality: decorated.municipality,
    short_blurb: decorated.short_blurb,
    primary_type: decorated.primary_type,
  };

  return Object.fromEntries(
    Object.entries(pin).filter(([, value]) => value !== undefined),
  ) as MapPinPlace;
}

let memo:
  | { bucket: number; places: MapPinPlace[] }
  | null = null;

/** Five-minute, process-local projection used by both the map API and SSR. */
export function mapPinPlaces(now = new Date()): MapPinPlace[] {
  const bucket = Math.floor(now.getTime() / 300_000);
  if (memo?.bucket === bucket) return memo.places;
  const places = publicPlaces().map((place) => mapPinPlace(place, now));
  memo = { bucket, places };
  return places;
}
