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

import { MUNICIPALITIES, type Municipality } from "@/data/municipalities";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { placesWithinRadius, type PlaceCardData } from "@/lib/loaders/places";
import {
  eventsLive,
  eventsNext24h,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { locations, type Location } from "@/lib/locations";

// ───────────────────────────────────────────────────────────────────────────
// point ▶ municipality
// ───────────────────────────────────────────────────────────────────────────

export type MunicipalityHit = {
  municipality: Municipality;
  /** True when the point falls inside the municipality's bbox. */
  inside: boolean;
  /** Great-circle metres from the point to the municipality centroid. */
  distance_m: number;
};

function inBbox(p: LngLat, bbox: [number, number, number, number]): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat;
}

/**
 * Resolve a coordinate to one of the county's 12 municipalities.
 *
 * Containment wins: if the point is inside exactly one bbox we return it
 * with `inside:true`. Bboxes can overlap at the seams (Mount Airy sits in
 * four counties); when several contain the point we keep the one whose
 * centroid is closest, which is the correct disambiguation for a user
 * standing near a town line. With no containing bbox we fall back to the
 * nearest centroid so the function is total — every point in (and near)
 * the county resolves to something, never null.
 *
 * Pure: depends only on the static MUNICIPALITIES table. No network, no
 * reverse-geocode API, no key, works offline and on the server.
 */
export function resolveMunicipality(point: LngLat): MunicipalityHit {
  let containing: MunicipalityHit | null = null;
  let nearest: MunicipalityHit | null = null;

  for (const m of MUNICIPALITIES) {
    const distance_m = haversineMeters(point, m.centroid);
    if (!nearest || distance_m < nearest.distance_m) {
      nearest = { municipality: m, inside: false, distance_m };
    }
    if (inBbox(point, m.bbox)) {
      if (!containing || distance_m < containing.distance_m) {
        containing = { municipality: m, inside: true, distance_m };
      }
    }
  }

  // nearest is never null: MUNICIPALITIES is a non-empty const.
  return containing ?? nearest!;
}

/**
 * A short, honest location label for the geolocation chip and headers.
 * Inside a town → "Frederick, MD". Outside but close → "Near Thurmont".
 * Far from every centroid → "Frederick County, MD" (generic but true —
 * the app's whole footprint is the county).
 */
export function locationLabel(point: LngLat): string {
  const hit = resolveMunicipality(point);
  if (hit.inside) return `${hit.municipality.name}, MD`;
  if (hit.distance_m <= 8_000) return `Near ${hit.municipality.name}`;
  return "Frederick County, MD";
}

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

const DEFAULT_RADIUS_M = 19_312; // ~12 miles

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
  const radiusM = opts.radiusM ?? DEFAULT_RADIUS_M;
  const limit = opts.limit ?? 8;
  const now = opts.now;

  const hit = resolveMunicipality(origin);

  // placesWithinRadius already: dedupes, drops closed, stamps distance.
  const openPlaces = placesWithinRadius(origin, radiusM, now)
    .filter((p) => p.open_status.state !== "closed")
    .slice(0, limit);

  // eventsLive / eventsNext24h are county-wide and venue-closed-safe but
  // unanchored to a point; re-stamp distance from the user and bound it.
  const stamp = (e: EventWithMeta): EventWithMeta => ({
    ...e,
    distance_m: haversineMeters(origin, e.geom),
  });

  const liveEvents = withinRadius(eventsLive(now).map(stamp), radiusM).sort(
    (a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0),
  );

  const upcomingEvents = withinRadius(
    eventsNext24h(now).map(stamp),
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
