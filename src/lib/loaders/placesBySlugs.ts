import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  MAX_FOLLOWED_PLACES,
  MAX_FOLLOW_SLUG_LENGTH,
  normalizeFollowSlugs,
} from "@/lib/follows-contract";

export const MAX_PLACES_BY_SLUG = MAX_FOLLOWED_PLACES;
export const MAX_PLACE_SLUG_LENGTH = MAX_FOLLOW_SLUG_LENGTH;

export function normalizeRequestedPlaceSlugs(raw: string): string[] {
  return normalizeFollowSlugs(raw.split(","), MAX_PLACES_BY_SLUG);
}

/**
 * Resolve a small user-selected slug set without shipping the complete place
 * catalog to the browser. Unknown rows are intentionally omitted, but every
 * requested slug is considered answered by the caller so stale saves cannot
 * leave a loading state stuck forever.
 */
export function resolvePlacesBySlugs(
  slugs: readonly string[],
): PlaceCardData[] {
  const places: PlaceCardData[] = [];
  const seen = new Set<string>();
  for (const rawSlug of slugs.slice(0, MAX_PLACES_BY_SLUG)) {
    const slug = rawSlug.trim();
    if (
      !slug ||
      slug.length > MAX_PLACE_SLUG_LENGTH ||
      seen.has(slug)
    ) {
      continue;
    }
    seen.add(slug);
    const place = clientPlaceBySlug(slug);
    if (place) places.push(place);
  }
  return places;
}
