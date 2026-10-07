import type { Park } from "@/lib/integrations/fcParks";
import { CURATED_PARK_CATALOG_NAMES } from "@/data/curated-parks";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { projectOverview } from "@/components/map/countyOverview";
import type { CountyOverviewPoint } from "@/components/map/CountyOverviewMap";

/**
 * Display helpers for /parks, kept out of the page so they are testable.
 */

/**
 * Source attributes are ALL-CAPS ("WORMAN'S MILL PARK"). Title-case for
 * display without mangling the underlying data. A word starts only at the
 * beginning, after a space, hyphen, slash, ampersand or opening parenthesis,
 * so an apostrophe never capitalizes the next letter ("Worman's", not
 * "Worman'S") and "C&O" keeps both capitals.
 */
export function titleCaseParkName(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/&])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`)
    .replace(/\bOf\b/g, "of");
}

/** Exact-name key: case, punctuation and a trailing "(Town)" disambiguator
 *  are ignored; "&" and "and" are the same word. */
function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "");
}

const SQUARE_METERS_PER_ACRE = 4046.86;

/**
 * How far a catalog place may sit from the reviewed park point and still be
 * the same park: the radius of a circle with the park's acreage, plus 500 m
 * because a catalog pin is often an entrance or visitor center at the edge.
 */
export function parkMatchRadiusMeters(acres: number | undefined): number {
  const area = Math.max(0, acres ?? 0) * SQUARE_METERS_PER_ACRE;
  return 500 + Math.sqrt(area / Math.PI);
}

export type CatalogPlace = { slug: string; name: string; geom: LngLat };

/**
 * The /places slug for a reviewed park, or null. A catalog place qualifies
 * only when its name is exactly the park's name (or its reviewed catalog
 * name in CURATED_PARK_CATALOG_NAMES) and it lies within
 * parkMatchRadiusMeters. The distance check is what keeps a same-named park
 * elsewhere in the county (the catalog's Othello Regional Park is 20 km from
 * the reviewed record) from receiving the link. The nearest qualifying place
 * wins.
 */
export function parkPlaceSlug(
  park: Pick<Park, "id" | "name" | "acres" | "lat" | "lng">,
  places: readonly CatalogPlace[],
): string | null {
  const alias = CURATED_PARK_CATALOG_NAMES[park.id];
  const keys = new Set([nameKey(park.name), ...(alias ? [nameKey(alias)] : [])]);
  const limit = parkMatchRadiusMeters(park.acres);
  const at = { lng: park.lng, lat: park.lat };
  let best: { slug: string; meters: number } | null = null;
  for (const place of places) {
    if (!keys.has(nameKey(place.name))) continue;
    const meters = haversineMeters(at, place.geom);
    if (meters <= limit && (!best || meters < best.meters)) best = { slug: place.slug, meters };
  }
  return best?.slug ?? null;
}

/** Where a park row goes: its place page when one matches, else the map. */
export function parkRowHref(park: Pick<Park, "lat" | "lng">, placeSlug: string | null): string {
  return placeSlug ? `/places/${placeSlug}` : `/map?at=${park.lat},${park.lng}`;
}

/** "5,810 ac". */
export function formatParkAcres(acres: number): string {
  return `${acres.toLocaleString("en-US")} ac`;
}

/**
 * Bar length for a park's acreage, as a percent of the largest park, or null
 * without acreage. Square-root scaled: a bar reads as the side of the park's
 * area, so a 44-acre city park is a visible stub beside an 11,000-acre
 * mountain park instead of vanishing, and order is preserved. Never below 4%
 * so the smallest parks still draw.
 */
export function parkAcreageShare(acres: number | undefined, maxAcres: number): number | null {
  if (acres == null || !(acres > 0) || !(maxAcres > 0)) return null;
  return Math.min(100, Math.max(4, Math.round(Math.sqrt(acres / maxAcres) * 100)));
}

/** Labels on the overview stay off names too long to sit on a phone map. */
const MAX_MAP_LABEL_LENGTH = 28;
/** Only the county's big public lands are labeled; the rest are points. */
const LABELED_ACRES = 1000;

/**
 * Overview points for the parks map, largest first so the big state and
 * national parks keep their labels when space runs out. Every park is a
 * point (two records that share a location draw as one); outlines wait for
 * polygon data.
 */
export function parkOverviewPoints(parks: readonly Park[]): CountyOverviewPoint[] {
  return [...parks]
    .sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0))
    .map((park) => {
      const name = titleCaseParkName(park.name);
      const labeled = (park.acres ?? 0) >= LABELED_ACRES && name.length <= MAX_MAP_LABEL_LENGTH;
      return {
        id: park.id,
        ...projectOverview(park.lng, park.lat),
        label: labeled ? name : null,
      };
    });
}
