import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * CLIENT-SAFE place data. Imports ONLY the slim, pre-decorated
 * places-client.json (~2MB) — never @/lib/loaders/places, which
 * static-imports the ~12MB places-enrichment.json and would bundle it
 * into the browser (the 13MB chunk that froze the map/radius/search).
 *
 * Same canonical public set, already decorated server-side at build
 * (npm run build:client-places); only the per-place heavy arrays the
 * cards never read are dropped. `import type` of PlaceCardData is
 * erased, so this module pulls in zero loader code.
 */
const CLIENT_PLACES = CLIENT_RAW as unknown as PlaceCardData[];

const BY_SLUG: Record<string, PlaceCardData> = (() => {
  const m: Record<string, PlaceCardData> = {};
  for (const p of CLIENT_PLACES) m[p.slug] = p;
  return m;
})();

export function clientPlaces(): PlaceCardData[] {
  return CLIENT_PLACES;
}

export function clientPlaceBySlug(slug: string): PlaceCardData | undefined {
  return BY_SLUG[slug];
}
