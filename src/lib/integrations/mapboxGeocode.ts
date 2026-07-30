/**
 * Forward geocoding for event venues — Mapbox Geocoding v6.
 *
 * WHY: most live-feed and cron-ingested events carry a TOWN CENTROID as
 * their geom (ical-live stamps every row with its feed's `default_geom`;
 * the ingested-series adapter falls back to the municipality centroid),
 * even when the feed's LOCATION parsed into a perfectly good street
 * address. That breaks pin accuracy on /map, hides VenueMiniMap on the
 * detail page, and gates the venue-photo join in eventThumb.ts off (its
 * fuzzy containment path only trusts precise geocodes). This module
 * upgrades exactly those rows: centroid-grade geom + street-address-
 * looking venue/address string → one cached Mapbox forward geocode,
 * county-gated, fail-soft.
 *
 * Cost discipline:
 *   - only strings that plausibly ARE street addresses are sent
 *     (looksLikeStreetAddress: leading house number or a street suffix);
 *   - each unique address geocodes at most once per assembly pass, and a
 *     pass is capped at MAX_GEOCODES_PER_PASS (overflow is counted and
 *     logged, never silently dropped);
 *   - every request explicitly declares `permanent=true`, as required
 *     by Mapbox when a geocoding result will be stored;
 *   - those permanent results are unstable_cache'd for 30 days keyed on
 *     the normalized query — addresses don't move;
 *   - transient failures (HTTP error, timeout) THROW inside the cached fn
 *     so they are never cached, and the caller converts them to null.
 *
 * Trust gates: the request carries NO types= filter (v6 rejects the
 * "street"/"block" filter values with a 422 — that 422 once nulled every
 * geocode silently), so precision is enforced on the RESPONSE: only
 * address/street/block feature types are accepted, meaning Mapbox can
 * never hand back a town/postcode centroid (which would swap one
 * centroid for another). The coordinate must also pass isValidCoord —
 * the real county polygon or reviewed Mount Airy town extent, or it is
 * rejected outright.
 */
import { unstable_cache } from "next/cache";
import { isValidCoord, type LngLat } from "@/lib/geo";
import {
  MAPBOX_GEOCODING_ENABLED,
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import { isAreaCentroid } from "@/lib/events/geo-confidence";
import type { EventWithMeta } from "@/lib/loaders/events";
import { meterUsage } from "@/lib/usage-meter";

// ── Pure helpers (spec-covered) ─────────────────────────────────────────

/**
 * Street suffixes that mark a plausible street address. `\b`-bounded so
 * "Market" doesn't match "Mark" etc. Known conservative false positives
 * ("St. John's Church" via the Saint abbreviation, "The Way Station")
 * cost at most one cached geocode that the feature-type gate will almost
 * always answer with nothing — never a wrong pin, because the county
 * gate and feature-type gate still apply.
 */
const STREET_SUFFIX =
  /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ln|lane|pike|ct|court|pl|place|hwy|highway|pkwy|parkway|sq|square|ter|terrace|cir|circle|aly|alley|tpke|turnpike)\b/i;

/** Plausible-street-address heuristic: starts with a house number, or
 *  contains a street-suffix word. Bare town names ("Frederick"), venue
 *  names ("Baker Park Bandshell"), and city tails ("Frederick, MD 21701")
 *  all fail it, so they never spend a geocode. */
export function looksLikeStreetAddress(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (/^\d/.test(t)) return true;
  return STREET_SUFFIX.test(t);
}

/** Cache/dedupe key for a geocode query: case/punctuation/whitespace
 *  variants of the same address must share one cache entry. */
export function normalizeAddressKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Build the forward-geocode query: "address, town, MD". The town and
 *  state are only appended when the address doesn't already carry them
 *  (splitLocation usually preserves the "City, ST ZIP" tail). */
export function buildGeocodeQuery(address: string, town?: string): string {
  if (/\b(?:md|maryland)\b/i.test(address)) return address;
  const hasTown = town ? address.toLowerCase().includes(town.toLowerCase()) : false;
  return [address, hasTown ? null : town, "MD"].filter(Boolean).join(", ");
}

/** Feature types precise enough to replace a centroid. "place" /
 *  "locality" / "postcode" results are centroids themselves — rejecting
 *  them is the whole point. */
const ACCEPTED_FEATURE_TYPES = new Set(["address", "street", "block"]);

type GeocodeFeature = {
  geometry?: { coordinates?: unknown };
  properties?: { feature_type?: unknown };
};

/**
 * Parse a Mapbox Geocoding v6 response down to a county-validated LngLat,
 * or null. Pure (spec-covered): rejects non-street feature types and any
 * coordinate outside the Frederick County polygon (+1.5km straddle
 * buffer) via isValidCoord — an out-of-county "match" is a mis-geocode by
 * definition and must keep the honest centroid behavior instead.
 */
export function parseGeocodeResponse(json: unknown): LngLat | null {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const f = features[0] as GeocodeFeature;
  const featureType = f?.properties?.feature_type;
  if (typeof featureType !== "string" || !ACCEPTED_FEATURE_TYPES.has(featureType)) {
    return null;
  }
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const coord = { lng: Number(coords[0]), lat: Number(coords[1]) };
  return isValidCoord(coord) ? coord : null;
}

// ── Network layer ───────────────────────────────────────────────────────

/** Proximity bias: downtown Frederick, the county's center of gravity. */
const PROXIMITY = "-77.41,39.41";
/** A geocode must never hold the (cron-warmed) assembly hostage. */
const GEOCODE_TIMEOUT_MS = 4_000;

/**
 * One uncached forward-geocode round trip. THROWS on transient trouble
 * (HTTP error, abort) so the unstable_cache wrapper never persists a
 * failure for 30 days; returns null only for the DEFINITIVE misses
 * (no result, imprecise feature type, out of county), which are safe to
 * cache. Exported for the spec (mocked fetch), not for app callers —
 * app code goes through geocodeAddressInCounty.
 */
export async function geocodeForwardUncached(q: string): Promise<LngLat | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const url =
      "https://api.mapbox.com/search/geocode/v6/forward" +
      `?q=${encodeURIComponent(q)}` +
      `&proximity=${PROXIMITY}` +
      // NO types= filter: Mapbox v6 REJECTS "street"/"block" as filter values
      // (422 VALIDATION_ERROR — verified live 2026-07-21; the allowed filter
      // list is country/region/place/district/locality/postcode/neighborhood/
      // address only). That 422 threw on EVERY request, so every scanner map
      // pin and hotspot link silently fail-softed to null on prod. Precision
      // is enforced on the RESPONSE instead: parseGeocodeResponse accepts only
      // address/street/block feature types, and isValidCoord gates the county.
      // permanent=true is required because successful coordinates are retained
      // in unstable_cache for 30 days; temporary Mapbox geocoding results must
      // not be stored.
      "&country=US&limit=1&permanent=true" +
      `&access_token=${MAPBOX_SERVER_TOKEN}`;
    // MAPBOX_SERVER_HEADERS is load-bearing: the production token is
    // URL-restricted and Mapbox matches the Referer on ALL APIs, so a
    // server fetch without it 403s in prod while passing local tests.
    meterUsage("mapbox_geocode");
    const res = await fetch(url, { signal: ctrl.signal, headers: MAPBOX_SERVER_HEADERS });
    if (!res.ok) throw new Error(`mapbox-geocode HTTP ${res.status}`);
    return parseGeocodeResponse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

const cachedGeocode = unstable_cache(
  async (addressKey: string, q: string) => {
    // addressKey exists only to key the cache on the NORMALIZED address,
    // so punctuation/case variants of one address share an entry.
    void addressKey;
    return geocodeForwardUncached(q);
  },
  // Deliberately NOT SHA-pinned, against the repo norm for event caches:
  // a geocode maps an address string to a coordinate and is deploy-
  // independent, so re-paying Mapbox for the whole address set on every
  // deploy buys nothing. Addresses don't move; 30 days is plenty fresh.
  // v2 invalidates coordinates originally fetched without permanent=true, so
  // every retained value is backed by an explicitly permanent request.
  ["mapbox-geocode-v2"],
  { revalidate: 30 * 24 * 3600 },
);

/**
 * Forward-geocode an address to a Frederick-County coordinate, 30-day
 * cached, fail-soft: no token / no result / imprecise / out-of-county /
 * upstream failure all resolve to null and the caller keeps its existing
 * (centroid) behavior exactly.
 */
export async function geocodeAddressInCounty(
  address: string,
  town?: string,
): Promise<LngLat | null> {
  // Token check OUTSIDE the cache: a missing token must not persist a
  // 30-day null that outlives the token being configured.
  if (!MAPBOX_GEOCODING_ENABLED || !MAPBOX_SERVER_TOKEN) return null;
  const q = buildGeocodeQuery(address, town);
  const key = normalizeAddressKey(q);
  if (!key) return null;
  try {
    return await cachedGeocode(key, q);
  } catch {
    return null; // transient upstream failure — uncached, retried next pass
  }
}

// ── Event upgrade pass ──────────────────────────────────────────────────

/** Hard per-assembly-pass budget. The 30-day geocode cache means a warm
 *  pass spends ~0; this bounds the cold worst case (first pass after the
 *  cache empties) so one assembly can never fan out unboundedly against
 *  a metered API. Overflow is counted and logged, not silent. */
const MAX_GEOCODES_PER_PASS = 50;

/** The address string worth geocoding for an event, or null when the
 *  event needs no upgrade (already precise / anchored to a place) or has
 *  nothing address-shaped to send. */
function addressCandidate(e: EventWithMeta): string | null {
  // A resolved venue place is already the authoritative pin — skip.
  if (e.venue_place_slug) return null;
  // Only centroid-grade geoms qualify. A distinct non-centroid coord
  // ("exact_address"/"unknown") is real information we must not clobber.
  if (!isAreaCentroid(e.geom)) return null;
  if (e.address && looksLikeStreetAddress(e.address)) return e.address;
  if (e.venue_name && looksLikeStreetAddress(e.venue_name)) return e.venue_name;
  return null;
}

/**
 * Upgrade centroid-geocoded events whose feed handed us a real street
 * address: geocode it (deduped per unique address, capped per pass),
 * and on success replace the geom and lift the precision flags —
 * placement "geocoded" + geo_confidence "exact_address" — so /map pins
 * land on the venue, the detail page earns its VenueMiniMap, and the
 * eventThumb photo join's precise-geo gates open. Every failure path
 * leaves the event byte-for-byte unchanged.
 *
 * Runs inside the cached unified assembly (kept hot by the warm-events
 * cron), so the geocode latency is paid on the cron / cold-miss path,
 * never per user request.
 */
export async function upgradeEventGeoms(events: EventWithMeta[]): Promise<EventWithMeta[]> {
  if (!MAPBOX_GEOCODING_ENABLED || !MAPBOX_SERVER_TOKEN) return events;

  // Collect unique geocode candidates (insertion order = event order).
  const wanted = new Map<string, { address: string; town?: string }>();
  const keyByIndex = new Map<number, string>();
  events.forEach((e, i) => {
    const address = addressCandidate(e);
    if (!address) return;
    const town = e.municipality_name || undefined;
    const key = normalizeAddressKey(buildGeocodeQuery(address, town));
    if (!key) return;
    keyByIndex.set(i, key);
    if (!wanted.has(key)) wanted.set(key, { address, town });
  });
  if (wanted.size === 0) return events;

  const unique = [...wanted.entries()];
  const budgeted = unique.slice(0, MAX_GEOCODES_PER_PASS);
  const overflow = unique.length - budgeted.length;
  if (overflow > 0) {
    // Counted, not silent: the next pass picks these up once the budgeted
    // set is warm in the 30-day cache (the budget frees up pass by pass).
    console.info(
      `[event-geocode] pass budget ${MAX_GEOCODES_PER_PASS} exhausted; ` +
        `${overflow} unique addresses deferred to a later pass`,
    );
  }

  const resolved = new Map<string, LngLat>();
  await Promise.all(
    budgeted.map(async ([key, { address, town }]) => {
      const coord = await geocodeAddressInCounty(address, town);
      if (coord) resolved.set(key, coord);
    }),
  );
  if (resolved.size === 0) return events;

  return events.map((e, i) => {
    const key = keyByIndex.get(i);
    const coord = key ? resolved.get(key) : undefined;
    if (!coord) return e;
    return {
      ...e,
      geom: coord,
      placement: "geocoded" as const,
      geo_confidence: "exact_address" as const,
    };
  });
}

/** Single-event form for the /events/[slug] detail resolvers, so the
 *  detail page (VenueMiniMap gate, GettingThere, photo borrow) sees the
 *  same upgraded geom its list card carries. The 30-day geocode cache is
 *  warm from the assembly pass, so this is normally a cache hit. */
export async function upgradeEventGeom(e: EventWithMeta): Promise<EventWithMeta> {
  return (await upgradeEventGeoms([e]))[0];
}
