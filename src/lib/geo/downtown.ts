import DOWNTOWN from "@/data/downtown-frederick.json";
import type { LngLat } from "@/lib/geo";

/**
 * Downtown Frederick geofence — a spatial join that lets any place or event
 * know whether it's actually downtown, from the City of Frederick's own
 * Historic District boundary (GIS snapshot, src/data/downtown-frederick.json).
 *
 * Why: "Frederick" is one label for the whole municipality, downtown and
 * Golden Mile alike (owner, 2026-07-20: "frederick seems confusing... downtown
 * only when true"). A blanket rename would mislabel west-side spots as
 * downtown; a point-in-polygon test against the real boundary labels only what
 * is genuinely downtown (Gravel & Grind → Downtown Frederick; a Route 40 store
 * → Frederick). Pure + unit-tested; snapshotted so a city GIS outage can't
 * break labels.
 */

const RINGS: number[][][] = (DOWNTOWN as { rings: number[][][] }).rings;

/** Ray-casting point-in-polygon over one ring of [lng, lat] vertices. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isDowntownFrederick(geom: LngLat | null | undefined): boolean {
  if (!geom || typeof geom.lng !== "number" || typeof geom.lat !== "number") return false;
  return RINGS.some((ring) => pointInRing(geom.lng, geom.lat, ring));
}

/**
 * The town label for a place/event: "Downtown Frederick" when a
 * Frederick-city location falls inside the downtown core, otherwise the plain
 * town name. Non-Frederick towns pass through unchanged.
 */
export function frederickAreaLabel(
  municipalitySlug: string | null | undefined,
  townName: string,
  geom: LngLat | null | undefined,
): string {
  if (municipalitySlug === "frederick" && isDowntownFrederick(geom)) {
    return "Downtown Frederick";
  }
  return townName;
}
