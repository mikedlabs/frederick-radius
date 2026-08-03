import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { getOpenStatus } from "@/lib/hours";
import { isHoursFresh } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";

type ClientPlaceData = PlaceCardData & {
  /** Build-time policy stamped by build-client-places. This avoids reading a
   * private server env var from a browser bundle while still aging strict
   * schedules out during a long-lived deployment. */
  hours_policy_strict?: boolean;
  /** Build-time verdict from the canonical loader. Rich author/source data is
   * hydrated only when a photo is opened, not repeated across the catalog. */
  google_photo_policy_passed?: true;
};

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
export function withoutUnpublishableGooglePhoto(
  place: ClientPlaceData,
): ClientPlaceData {
  const photo = place.google_photo_url;
  if (!photo) return place;
  return place.google_photo_policy_passed
    ? place
    : { ...place, google_photo_url: undefined };
}

const ALL_CLIENT_PLACES = (CLIENT_RAW as unknown as ClientPlaceData[]).map(
  withoutUnpublishableGooglePhoto,
);

/** Hide places Google or our manual curation has marked closed. The
 *  server's `isOperational` filter is the source of truth, but client
 *  surfaces (search, saved, radius, planner) read this slim bundle
 *  directly and were leaking permanently-closed venues into results.
 *  Single predicate, applied at the loader so every consumer is
 *  automatically clean. */
function isOpen(p: PlaceCardData): boolean {
  return p.is_operational !== "closed_permanently" && p.is_operational !== "closed_temporarily";
}

const CLIENT_PLACES = ALL_CLIENT_PLACES.filter(isOpen);

const BY_SLUG: Record<string, PlaceCardData> = (() => {
  const m = Object.create(null) as Record<string, PlaceCardData>;
  // Detail lookups CAN return a closed place (its detail page should
  // still render with a clear "Closed permanently" label) — but the
  // discovery surfaces below only see operational rows.
  for (const p of ALL_CLIENT_PLACES) m[p.slug] = p;
  return m;
})();

/**
 * Recompute open-now at call time from the shipped structured `hours`, so
 * the client never renders a stale build-time "Open until 9". Places with
 * no hours resolve to { state: "unknown" } exactly as before. Cheap: the
 * slim set now carries the COMPACT { mon: [{ open, close }] } schedule (a
 * few hundred bytes), not the heavy google_hours strings that were
 * dropped to keep this bundle small.
 */
function withLiveStatus(p: ClientPlaceData): PlaceCardData {
  const now = new Date();
  const mayAssertHours = Boolean(
    p.hours_verified &&
      p.hours &&
      (!p.hours_policy_strict || isHoursFresh(p.hours_updated_at, now)) &&
      mayPublishVisitabilityHours(p.slug, p.hours, now),
  );
  return {
    ...p,
    hours: mayAssertHours ? p.hours : undefined,
    hours_verified: mayAssertHours,
    open_status: getOpenStatus(
      mayAssertHours ? p.hours : undefined,
      { verified: mayAssertHours },
      now,
    ),
  };
}

export function clientPlaces(): PlaceCardData[] {
  return CLIENT_PLACES.map(withLiveStatus);
}

export function clientPlaceBySlug(slug: string): PlaceCardData | undefined {
  const p = BY_SLUG[slug];
  return p ? withLiveStatus(p) : undefined;
}

/**
 * Client-safe placesWithinRadius: same shape/contract, over the slim
 * already-decorated set. open_status is recomputed live (withLiveStatus)
 * now that the compact structured hours ship in the slim bundle, so the
 * radius readout's open-now matches the server's.
 */
export function clientPlacesWithinRadius(
  origin: LngLat,
  meters: number,
  spatialDistances?: ReadonlyMap<string, number>,
): PlaceCardData[] {
  return CLIENT_PLACES.flatMap((p) => {
    const distance = spatialDistances
      ? spatialDistances.get(p.slug)
      : haversineMeters(origin, p.geom);
    // A trusted PostGIS map contains only rows inside the requested radius.
    // Missing slugs are therefore outside the result, not an unknown distance.
    if (distance === undefined || !Number.isFinite(distance) || distance > meters) {
      return [];
    }
    return [{ ...withLiveStatus(p), distance_m: distance }];
  }).sort(
    (a, b) =>
      (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity) ||
      a.slug.localeCompare(b.slug),
  );
}
