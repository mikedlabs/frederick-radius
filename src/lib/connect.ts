/**
 * connect.ts — the connectivity layer.
 *
 * Frederick Radius has rich but disconnected entities: ~1,300 places, a
 * curated + live event set, 12 municipalities, civic anchors, and a live
 * county pulse. Each is keyed independently (a municipality slug here, a
 * static center there, a town-gated list somewhere else). Nothing fused
 * the user's *actual position* to a single county-wide, multi-entity
 * picture — so "what's around me right now, anywhere in the county" was
 * not expressible.
 *
 * This module is that fusion. It is the graph:
 *
 *   point ──resolveMunicipality──▶ municipality
 *   municipality ──civicAnchorsFor──▶ civic context
 *   point ──nearbyNow──▶ { municipality, places, events, civic } by true
 *                          distance, county-wide, not town-gated
 *
 * Design constraints, deliberately:
 *   - PURE and ISOMORPHIC. No network, no client-only API, no Date.now()
 *     hidden inside. Every function is deterministic given its inputs, so
 *     it runs identically on the server (revalidate pages) and the client
 *     (geolocation) and is unit-testable. `now` is always injected.
 *   - COUNTY-WIDE BY POSITION. Discovery is radius-from-you, never gated
 *     to one municipality, so a user in Brunswick sees the Thurmont thing
 *     that is actually closer to them than half of downtown Frederick.
 *   - HONEST. It composes the existing canonical loaders (which already
 *     drop closed places and known-closed venues); it never invents data.
 *     Source-backed feeds that are still gated (farmers markets, business
 *     specials — see data/sources.yaml, all pending_approval) are NOT
 *     faked here; `nearbyNow` exposes a typed seam so they slot in via
 *     the same join the day a human activates them.
 */

import { type Municipality } from "@/data/municipalities";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
// A2.6: this module is server-side only (it's used by /api/nearby and
// other route handlers). Client surfaces that need the lightweight
// point → municipality utilities import from `@/lib/location` directly
// so they don't drag places-client.json into the browser bundle.
import { clientPlacesWithinRadius } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  applyLivePlaceEvidenceMap,
  type LivePlaceEvidence,
} from "@/lib/live-place-evidence";
import {
  eventsLive,
  eventsNext24h,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { isGeoPrecise } from "@/lib/events/geo-confidence";
import { locations, type Location } from "@/lib/locations";
import {
  resolveMunicipality,
  locationLabel,
  type MunicipalityHit,
} from "@/lib/location";

// Re-export for backward compat: lib/integrations/* still import these
// from "@/lib/connect". They're server-only callers so the chain
// staying intact for them is fine.
export { resolveMunicipality, locationLabel };
export type { MunicipalityHit };

// ───────────────────────────────────────────────────────────────────────────
// municipality ▶ civic context
// ───────────────────────────────────────────────────────────────────────────

export type CivicAnchor = Location & {
  municipality_slug: string;
  municipality_name: string;
  distance_m: number;
};

/** locations.ts categories that count as civic context (not businesses). */
const CIVIC_CATEGORIES: ReadonlySet<Location["category"]> = new Set([
  "Civic",
  "Development",
  "Park",
]);

function asAnchor(l: Location): CivicAnchor {
  const hit = resolveMunicipality({ lng: l.lng, lat: l.lat });
  return {
    ...l,
    municipality_slug: hit.municipality.slug,
    municipality_name: hit.municipality.name,
    distance_m: hit.distance_m,
  };
}

/** Every civic/development/park anchor, each resolved to a municipality. */
export function civicAnchors(): CivicAnchor[] {
  return locations.filter((l) => CIVIC_CATEGORIES.has(l.category)).map(asAnchor);
}

/** Civic anchors whose nearest municipality is `muniSlug`, closest first. */
export function civicAnchorsFor(muniSlug: string): CivicAnchor[] {
  return civicAnchors()
    .filter((a) => a.municipality_slug === muniSlug)
    .sort((a, b) => a.distance_m - b.distance_m);
}

// ───────────────────────────────────────────────────────────────────────────
// point ▶ everything around it, right now, county-wide
// ───────────────────────────────────────────────────────────────────────────

export type NearbyOptions = {
  /** Injected clock — keeps the join pure and testable. */
  now: Date;
  /** Discovery radius in metres. Default ~12 mi: a real rural-county reach. */
  radiusM?: number;
  /** Cap per list (places / upcoming). Live events are never capped out. */
  limit?: number;
  /**
   * Optional, checksum-verified PostGIS distances for places inside radiusM.
   * When absent, the existing in-memory Haversine path remains authoritative.
   */
  placeDistances?: ReadonlyMap<string, number>;
  /**
   * Optional current database evidence, loaded by the server route under a
   * short deadline. Keeping the merge pure preserves deterministic ranking
   * tests and lets every database failure fall back to the shipped snapshot.
   */
  placeEvidence?: ReadonlyMap<string, LivePlaceEvidence>;
};

/**
 * A typed seam for source-backed feeds that are still gated in
 * data/sources.yaml (farmers markets, business specials, live music
 * aggregators). They are intentionally empty until a human flips a
 * source to active and a transform lands — `nearbyNow` already returns
 * the shape so the UI and tests do not change when they come online.
 */
export type GatedFeeds = {
  farmersMarkets: PlaceCardData[];
  specials: EventWithMeta[];
};

export type NearbyContext = {
  origin: LngLat;
  municipality: Municipality;
  /** True when the user is inside the municipality bbox, not just near. */
  inside: boolean;
  label: string;
  radiusM: number;
  /** Open or likely-open places within radius, nearest first. */
  openPlaces: PlaceCardData[];
  /** Events live right now within radius, nearest first. */
  liveEvents: EventWithMeta[];
  /** Events starting in the next 24h within radius, soonest first. */
  upcomingEvents: EventWithMeta[];
  /** Civic anchors for the resolving municipality, closest first. */
  civic: CivicAnchor[];
  /** Gated source feeds (empty until activated — never faked). */
  feeds: GatedFeeds;
  counts: {
    openPlaces: number;
    liveEvents: number;
    upcomingEvents: number;
    civic: number;
  };
};

export const DEFAULT_NEARBY_RADIUS_M = 19_312; // ~12 miles

function withinRadius<T extends { distance_m?: number }>(
  rows: T[],
  radiusM: number,
): T[] {
  return rows.filter((r) => (r.distance_m ?? Infinity) <= radiusM);
}

/**
 * THE join. Given where the user actually is and the time, return the
 * single connected picture: the municipality they are in (or nearest to)
 * and its civic context, plus the open places and live/soon events
 * around them — county-wide, ordered by true distance, not gated to one
 * town. This is what makes a location-aware "Live Now" expressible.
 *
 * Composes only canonical, already-filtered loaders, so closed places
 * and known-closed venues are excluded for free and the result is as
 * honest as the rest of the app. Pure given `opts.now`.
 */
export function nearbyNow(origin: LngLat, opts: NearbyOptions): NearbyContext {
  const radiusM = opts.radiusM ?? DEFAULT_NEARBY_RADIUS_M;
  const limit = opts.limit ?? 8;
  const now = opts.now;

  const hit = resolveMunicipality(origin);

  // placesWithinRadius already dedupes and stamps distance. Its unknown-hours
  // rows remain useful elsewhere, but this contract is specifically named
  // `openPlaces` and the Today section labels it "Open near you." Keep only
  // recently confirmed open/closing-soon rows so an hours gap is never shown
  // as an availability claim.
  const nearbyPlaces = clientPlacesWithinRadius(
    origin,
    radiusM,
    opts.placeDistances,
  );
  const openPlaces = applyLivePlaceEvidenceMap(
    nearbyPlaces,
    opts.placeEvidence ?? new Map(),
    now,
  )
    .filter(
      (place) =>
        place.is_operational !== "closed_permanently" &&
        place.is_operational !== "closed_temporarily",
    )
    .filter((p) => isOpenNow(p.open_status))
    .slice(0, limit);

  // eventsLive / eventsNext24h are county-wide and venue-closed-safe but
  // unanchored to a point; re-stamp distance from the user and bound it.
  // A distance-led module ("within reach") is a reachability promise, so
  // only addressable events qualify — an area-centroid event has no
  // honest distance to bound or sort by (audit #2 P1).
  const stamp = (e: EventWithMeta): EventWithMeta => ({
    ...e,
    distance_m: haversineMeters(origin, e.geom),
  });

  const liveEvents = withinRadius(
    eventsLive(now).filter(isGeoPrecise).map(stamp),
    radiusM,
  ).sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

  const upcomingEvents = withinRadius(
    eventsNext24h(now).filter(isGeoPrecise).map(stamp),
    radiusM,
  )
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .slice(0, limit);

  const civic = civicAnchorsFor(hit.municipality.slug);

  return {
    origin,
    municipality: hit.municipality,
    inside: hit.inside,
    label: locationLabel(origin),
    radiusM,
    openPlaces,
    liveEvents,
    upcomingEvents,
    civic,
    feeds: { farmersMarkets: [], specials: [] },
    counts: {
      openPlaces: openPlaces.length,
      liveEvents: liveEvents.length,
      upcomingEvents: upcomingEvents.length,
      civic: civic.length,
    },
  };
}

/**
 * True when there is genuinely nothing to surface near the user — the
 * caller should widen the radius or show a county-wide fallback rather
 * than an empty panel.
 */
export function isNearbyEmpty(ctx: NearbyContext): boolean {
  return (
    ctx.counts.openPlaces === 0 &&
    ctx.counts.liveEvents === 0 &&
    ctx.counts.upcomingEvents === 0
  );
}
