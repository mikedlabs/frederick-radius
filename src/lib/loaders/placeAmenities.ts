/**
 * Per-place structured amenities → existing tag slugs.
 *
 * `src/data/places-amenities.json` is produced by `npm run enrich:amenities`
 * (Google Places v1 amenity booleans). It maps each place slug to the subset
 * of amenity fields Google AFFIRMATIVELY reports true — we never store false,
 * so a missing field means "unknown," never "no" (honesty rule). Until that
 * fetch is run the file is `{}` and every lookup returns [], so nothing breaks
 * and no facet appears (the category page's >=3 threshold already hides empties).
 *
 * The tag slugs below already exist in src/data/tags.ts with display names, and
 * the category page's FACET_CANDIDATES already lists several — so the moment the
 * data lands (run the script + `npm run build:client-places`), the amenity
 * filters light up with no further code.
 */
import RAW from "@/data/places-amenities.json";

type AmenityRecord = Record<string, boolean>;
const AMENITIES = RAW as Record<string, AmenityRecord>;

/**
 * Google Places v1 boolean field → our tag slug (src/data/tags.ts). Only the
 * fields that map to a REAL, labelled tag are listed; the rest of what the
 * script captures (servesBreakfast, etc.) is stored for later but not yet
 * surfaced as a facet.
 */
const FIELD_TO_TAG: Record<string, string> = {
  outdoorSeating: "outdoor-seating",
  allowsDogs: "dog-friendly",
  reservable: "reservations",
  takeout: "takeout",
  delivery: "delivery",
  liveMusic: "live-music",
  goodForGroups: "groups",
  goodForChildren: "kids-6-12",
  menuForChildren: "kids-6-12",
  restroom: "restroom",
};

/** The set of amenity fields the enrich script requests + stores. Exported so
 *  the script and any future consumer share ONE source of truth. */
export const AMENITY_FIELDS = [
  "outdoorSeating", "allowsDogs", "reservable", "takeout", "delivery",
  "dineIn", "curbsidePickup", "liveMusic", "goodForGroups", "goodForChildren",
  "menuForChildren", "goodForWatchingSports", "restroom", "servesBreakfast",
  "servesBrunch", "servesLunch", "servesDinner", "servesVegetarianFood",
  "servesBeer", "servesWine", "servesCocktails", "servesCoffee", "servesDessert",
] as const;

/** The tag slugs derived from a place's stored amenities (true fields only),
 *  deduped. [] when the place has no amenity record yet. */
export function amenityTags(slug: string): string[] {
  const rec = AMENITIES[slug];
  if (!rec) return [];
  const out = new Set<string>();
  for (const [field, on] of Object.entries(rec)) {
    const tag = on ? FIELD_TO_TAG[field] : undefined;
    if (tag) out.add(tag);
  }
  return [...out];
}

/** Whether ANY place has amenity data yet — lets a surface decide to show the
 *  amenity facet row at all. */
export function hasAnyAmenityData(): boolean {
  return Object.keys(AMENITIES).length > 0;
}
