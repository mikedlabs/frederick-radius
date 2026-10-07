import type { PlaceCardData } from "@/lib/loaders/places";
import { fetchSheetLookupJson } from "@/lib/sheet-lookup-json";

export const PLACE_LOOKUP_TIMEOUT_MS = 15_000;

/** Resolve only the requested place through the shared bounded sheet transport. */
export async function fetchPlaceSheetLookup(
  slug: string,
  parentSignal: AbortSignal,
  timeoutMs = PLACE_LOOKUP_TIMEOUT_MS,
): Promise<PlaceCardData | null> {
  const payload = await fetchSheetLookupJson(
    `/api/places/by-slugs?slugs=${encodeURIComponent(slug)}`,
    parentSignal,
    timeoutMs,
  ) as { places?: PlaceCardData[] } | null;
  return Array.isArray(payload?.places)
    ? payload.places.find((place) => place.slug === slug) ?? null
    : null;
}
