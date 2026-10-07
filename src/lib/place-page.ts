import { haversineMeters, isInFrederickCountyArea, type LngLat } from "@/lib/geo";

/**
 * Place-page facts derived from the catalog record, kept pure so the server
 * page and its specs read the same rules: the street a place is on, the
 * landmark a local would locate it by, whether its block can honestly be
 * drawn as the hero, and when a Google rating is worth printing.
 */

const HOUSE_NUMBER = String.raw`\d+[A-Za-z]?(?:-[A-Za-z0-9]+)?`;
const DIRECTION = String.raw`(?:N|S|E|W|North|South|East|West)\.?`;
// A name word starts with a letter ("Market", "U.S.") or is an ordinal
// ("2nd"), so a second house number can never be read as part of a name.
const NAME_WORD = String.raw`(?:[A-Za-z][A-Za-z0-9'.]*|\d+(?:st|nd|rd|th))`;
// Highways are left out on purpose: "U.S. Hwy 15" without its number is not a
// street anyone would recognize.
const STREET_TYPE = String.raw`(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Pike|Pkwy|Parkway|Way|Ct|Court|Pl|Place|Cir|Circle|Ter|Terrace|Trl|Trail|Sq|Square|Aly|Alley|Turn|Space|Row|Run)`;
// Anchored at the start of one comma-separated address segment: an optional
// house number ("118", "10-B", "16-20"), then at most four words ending in a
// street type. Anything after the type (a suite, "# A1", a stray city) is
// ignored. Plus codes, bare town names, venue names and "Carroll Creek
// between East St and Bentz St" never match, so they never become a street.
const STREET_RE = new RegExp(
  `^(?:${HOUSE_NUMBER}\\s+)?((?:${DIRECTION}\\s+)?(?:${NAME_WORD}\\s+){1,3}?${STREET_TYPE})\\.?(?=$|[\\s#,(])`,
  "i",
);

const DIRECTION_WORD: Readonly<Record<string, string>> = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
};

function tidyStreet(raw: string): string {
  const words = raw.trim().split(/\s+/);
  // A one-letter lead is a direction only when a name follows it: "S Market
  // St" is South Market St, but "E St" is a street named E.
  if (words.length >= 3) {
    const lead = words[0].replace(/\.$/, "").toLowerCase();
    if (DIRECTION_WORD[lead]) words[0] = DIRECTION_WORD[lead];
  }
  return words
    .map((word) => (/^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * The street a place is on, without its house number or suite:
 * "118 S Market St" becomes "South Market St". Null when the address names no
 * street (a town, a plus code, a venue or a cross-street description).
 */
export function streetFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  for (const segment of address.split(",")) {
    const match = segment.trim().match(STREET_RE);
    if (match?.[1]) return tidyStreet(match[1]);
  }
  return null;
}

// The locators a local actually uses (the same five points Browse rows use
// for "Near" in src/lib/place-reasons.ts). Downtown coordinates are the real
// place geoms; Hood and Monocacy are well-known points.
const LANDMARKS: ReadonlyArray<{ name: string } & LngLat> = [
  { name: "Carroll Creek", lng: -77.4109, lat: 39.4137 },
  { name: "Baker Park", lng: -77.4198, lat: 39.417 },
  { name: "the Weinberg", lng: -77.4124, lat: 39.4145 },
  { name: "Hood College", lng: -77.3985, lat: 39.4235 },
  { name: "Monocacy Battlefield", lng: -77.3905, lat: 39.373 },
];

/** Close enough that "near" is plainly true on foot (about a 5-minute walk). */
export const NEAR_LANDMARK_METERS = 400;

/**
 * The nearest curated landmark within NEAR_LANDMARK_METERS, never the
 * landmark the page is about ("Baker Park" is not near Baker Park). Only
 * "near" is claimed: Carroll Creek and the larger parks are lines and areas,
 * so a compass direction from one point would not be a true statement.
 */
export function nearbyLandmark(geom: LngLat, placeName = ""): string | null {
  const name = placeName.toLowerCase();
  let best: string | null = null;
  let bestDistance = NEAR_LANDMARK_METERS;
  for (const landmark of LANDMARKS) {
    if (name.includes(landmark.name.replace(/^the /, "").toLowerCase())) continue;
    const distance = haversineMeters(geom, landmark);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = landmark.name;
    }
  }
  return best;
}

export type PlaceHeroMap = {
  lng: number;
  lat: number;
  /** "South Market St, near Carroll Creek", or the street alone. */
  caption: string;
};

/**
 * The place's own block as the photoless hero. It is drawn only when the
 * address names a street, which is the evidence that the pin is an address
 * geocode and not a town-center fallback (Mount St. Mary's, listed as
 * "Emmitsburg, MD", sits 37 m from the town centroid it was filed under).
 * Null means the identity block leads the page instead of an empty band.
 */
export function placeHeroMap(place: {
  name: string;
  address?: string | null;
  geom: LngLat;
}): PlaceHeroMap | null {
  const { lng, lat } = place.geom;
  if (!isInFrederickCountyArea(lng, lat)) return null;
  const street = streetFromAddress(place.address);
  if (!street) return null;
  const landmark = nearbyLandmark(place.geom, place.name);
  return { lng, lat, caption: landmark ? `${street}, near ${landmark}` : street };
}

/**
 * The address as two display lines and one copyable string. Many catalog
 * addresses already carry the town, state and ZIP ("30 W Potomac St Suite
 * 103, Brunswick, MD 21716"); those are not given a second locality line that
 * repeats them.
 */
export function placeAddress(place: {
  address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): { street: string; locality: string | null; full: string } {
  const street = place.address.trim();
  const locality = [place.city?.trim(), [place.state, place.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const alreadyLocal = /,\s*MD\b/.test(street) || (place.postal_code ? street.includes(place.postal_code) : false);
  if (alreadyLocal || !locality) return { street, locality: null, full: street };
  return { street, locality, full: `${street}, ${locality}` };
}

/** Below this many reviews a star average says more about chance than the place. */
export const GOOGLE_RATING_MIN_COUNT = 20;

/** "4.6" and "1,728" for the identity line, or null when it should not show. */
export function googleRatingSummary(
  rating: number | null | undefined,
  count: number | null | undefined,
): { rating: string; count: string } | null {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return null;
  if (typeof count !== "number" || !Number.isFinite(count) || count < GOOGLE_RATING_MIN_COUNT) {
    return null;
  }
  return { rating: rating.toFixed(1), count: Math.round(count).toLocaleString("en-US") };
}

/** The bare host of a source URL ("visitfrederick.org"), or null. */
export function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Only an https Google Maps link may carry the rating's attribution. */
export function googleMapsHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(^|\.)google\.com$/.test(parsed.hostname)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
