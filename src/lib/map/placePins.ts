import "server-only";

import { decoratePlace, publicPlaces } from "@/lib/loaders/places";
import { duplicateNameQualifiers } from "@/lib/format/placeName";
import type { MapPinPlace } from "@/components/map/types";

/**
 * The map only needs enough place data to draw, filter, rank and open a slug.
 * Keep this as an allowlist: adding a field here increases a county-wide
 * response by roughly the field size multiplied by every published place.
 */
export function mapPinPlace(
  place: Parameters<typeof decoratePlace>[0],
  now: Date,
  /** Set only for a place that shares its name and town with another one. */
  nameDetail?: string,
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
    name_detail: nameDetail,
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
  const published = publicPlaces();
  // Two stores with one name in one town ("Food Lion" in Frederick) are the
  // only pins that carry a street line. Every other pin omits the field.
  const nameDetails = duplicateNameQualifiers(published);
  const places = published.map((place) => mapPinPlace(place, now, nameDetails.get(place.slug)));
  memo = { bucket, places };
  return places;
}
