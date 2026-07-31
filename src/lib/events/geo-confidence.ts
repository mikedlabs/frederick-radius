import { haversineMeters, type LngLat } from "@/lib/geo";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * Event geo confidence — the "never claim a precise distance from an
 * approximate coordinate" rule (audit #2 P1). Counterpart to the event
 * eligibility lanes: there we ask "should this be promoted?", here we
 * ask "do we actually know where it is?".
 *
 * The trap: live county/municipal feeds carry no per-event geocode, so
 * every row falls back to its feed's default coordinate — the downtown
 * Frederick / county centroid (see ical-live `default_geom`). That coord
 * is a real, in-bbox point, so placement validation tags it "geocoded"
 * and it looks exactly like a precisely-located event. A user standing
 * downtown then sees a county-wide event rendered as "113 ft away."
 *
 * A distance is a promise. We only make it when the coordinate is
 * addressable:
 *   - venue_match   — inherited from a resolved venue (placement "venue")
 *   - exact_address — a distinct per-event geocode, not an area centroid
 *   - area          — sitting on a known town/feed centroid → list it,
 *                     never claim a distance
 *   - unknown       — no placement + non-centroid coord we can't vouch for
 */
export type GeoConfidence = "venue_match" | "exact_address" | "area" | "unknown";

// Coordinates that mean "somewhere in this town/county", not a real
// location. Two sources, both area-level by construction:
//   1. ical-live `default_geom` fallbacks (mirrored here so this module
//      stays client-safe and free of the server feed integration).
//   2. every municipality centroid.
// A live-feed event lands EXACTLY on a default (0 m away); a real venue
// would have to sit within AREA_EPSILON_M of a centroid constant to be
// misread — vanishingly unlikely, and a conservative miss (we'd omit a
// distance, never invent one).
const FEED_DEFAULT_GEOMS: LngLat[] = [
  { lng: -77.4109, lat: 39.4137 }, // dfp / celebrate — downtown Frederick
  { lng: -77.4109, lat: 39.4143 }, // county RSS — county centroid
  { lng: -77.3997, lat: 39.4246 }, // hood — campus default
];

const AREA_ANCHORS: LngLat[] = [
  ...FEED_DEFAULT_GEOMS,
  ...MUNICIPALITIES.map((m) => m.centroid),
];

const AREA_EPSILON_M = 40;

export function isAreaCentroid(geom: LngLat): boolean {
  return AREA_ANCHORS.some((a) => haversineMeters(a, geom) <= AREA_EPSILON_M);
}

/**
 * Classify how well we know an event's position. `placement` "venue" is
 * checked first and wins unconditionally — those coords were overwritten
 * with a resolved venue's exact geom, so they're precise even if a venue
 * happens to sit near a centroid.
 */
export function eventGeoConfidence(
  e: { placement?: string; geom: LngLat },
): GeoConfidence {
  if (e.placement === "venue") return "venue_match";
  if (isAreaCentroid(e.geom)) return "area";
  if (e.placement === "geocoded") return "exact_address";
  return "unknown";
}

/**
 * True only when the coordinate is precise enough to claim a distance or
 * to qualify for a proximity module ("within reach", "nearby"). Area and
 * unknown stay listed elsewhere, but never with a distance.
 */
export function isGeoPrecise(e: { placement?: string; geom: LngLat }): boolean {
  const c = eventGeoConfidence(e);
  return c === "venue_match" || c === "exact_address";
}

/**
 * Event pages can also resolve a real place record for the venue. That
 * authoritative match wins even when the venue happens to sit close to one
 * of the area anchors. Older curated events do not all carry a placement
 * stamp, so a non-centroid coordinate remains eligible unless an explicit
 * area confidence says otherwise.
 */
export function eventHasPreciseLocation(
  e: {
    placement?: string;
    geom: LngLat;
    geo_confidence?: GeoConfidence;
  },
  hasResolvedVenue = false,
): boolean {
  if (hasResolvedVenue) return true;
  if (
    e.geo_confidence === "area" ||
    e.geo_confidence === "unknown"
  ) {
    return false;
  }
  if (
    e.geo_confidence === "venue_match" ||
    e.geo_confidence === "exact_address"
  ) {
    return true;
  }
  return isGeoPrecise(e) || !isAreaCentroid(e.geom);
}
