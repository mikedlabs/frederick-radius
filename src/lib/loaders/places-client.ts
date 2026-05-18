import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters, type LngLat } from "@/lib/geo";

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

/**
 * Client-safe placesWithinRadius: same shape/contract, over the slim
 * already-decorated set. The only difference vs the server loader is
 * open_status is the build-time value (recomputing it live needs the
 * per-place hours arrays, which were intentionally dropped to keep
 * this 2MB instead of 12MB — an honest tradeoff for a UI hint).
 */
export function clientPlacesWithinRadius(
  origin: LngLat,
  meters: number,
): PlaceCardData[] {
  return CLIENT_PLACES.map((p) => ({
    ...p,
    distance_m: haversineMeters(origin, p.geom),
  }))
    .filter((p) => (p.distance_m ?? Infinity) <= meters)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
