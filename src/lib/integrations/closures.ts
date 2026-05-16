/**
 * Known-closed places.
 *
 * We can't trust OSM not to keep closed businesses tagged — and we don't have
 * Google Places API wired yet. So we maintain a manual denylist of places
 * we know are closed (community feedback, news, personal knowledge). These
 * are filtered out of OSM data EVEN when the user opts into seeing unverified
 * businesses on the map.
 *
 * Once GOOGLE_PLACES_API_KEY is configured, this list becomes redundant for
 * any place Google has cataloged — but we keep it as the override of last
 * resort for places Google hasn't caught up on.
 *
 * Add an entry when:
 *   - A reader reports it
 *   - We see a news article confirming closure
 *   - The business itself announces closure on socials
 *
 * Naming: include common variants (with/without "& Co", "Brewing", etc.)
 * since OSM can have any of them.
 */

const NAMES: string[] = [
  // Restaurants
  "VOLT",
  "Volt",
  "VOLT Restaurant",
  "Voltaggio Volt",

  // Breweries
  "Idiom Brewing",
  "Idiom Brewing Co.",
  "Idiom Brewing Co",
  "Idiom Brewing Company",
  "Idiom",

  // Restaurants (cont.)
  "Ayse Meze Lounge",
  "Ayse Meze",
  "Ayşe Meze Lounge",
  "Firestone's Culinary Tavern",
  "Firestone's",

  // Add more as we learn about closures (see comment above).
];

const NORMALIZED = new Set(NAMES.map((n) => normalize(n)));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[&]/g, "and")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isKnownClosed(name: string | undefined | null): boolean {
  if (!name) return false;
  return NORMALIZED.has(normalize(name));
}

export const KNOWN_CLOSED_COUNT = NAMES.length;

/**
 * The de-duplicated canonical denylist, with provenance, used to
 * generate the closures audit log (src/data/closures.json). NAMES above
 * keeps the spelling variants for matching; this is one row per real
 * business. place_id is null because the denylist is name-based; the
 * Google business_status refresh fills place_id for catalogued places.
 */
export const KNOWN_CLOSED_CANONICAL: ReadonlyArray<{
  name: string;
  place_id: string | null;
  closed_since: string | null;
  source: "manual_denylist";
}> = [
  { name: "VOLT", place_id: null, closed_since: "2020", source: "manual_denylist" },
  { name: "Idiom Brewing Co.", place_id: null, closed_since: null, source: "manual_denylist" },
  { name: "Ayse Meze Lounge", place_id: null, closed_since: null, source: "manual_denylist" },
  { name: "Firestone's Culinary Tavern", place_id: null, closed_since: null, source: "manual_denylist" },
];
