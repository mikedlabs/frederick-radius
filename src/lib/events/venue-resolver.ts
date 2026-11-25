import { haversineMeters, isValidCoord, type LngLat } from "@/lib/geo";
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { isGenericEventVenueName, normalizeEventVenueIdentity } from "./venue-name";
export { isGenericEventVenueName, normalizeEventVenueIdentity } from "./venue-name";

export type EventVenueInput = {
  venue_place_slug?: string | null;
  venue_name?: string | null;
  address?: string | null;
  geom?: LngLat | null;
  geo_confidence?: string | null;
  placement?: string | null;
  attendance_mode?: "physical" | "online" | "mixed" | null;
};

export type EventVenueMatch = {
  place: PlaceCardData;
  kind: "canonical_slug" | "reviewed_alias" | "exact_identity";
};

type EventVenueIndex = {
  bySlug: ReadonlyMap<string, PlaceCardData>;
  byIdentity: ReadonlyMap<string, readonly PlaceCardData[]>;
};

let defaultVenueIndex: EventVenueIndex | null = null;

function buildVenueIndex(places: readonly PlaceCardData[]): EventVenueIndex {
  const bySlug = new Map<string, PlaceCardData>();
  const byIdentity = new Map<string, PlaceCardData[]>();
  for (const place of places) {
    bySlug.set(place.slug, place);
    const identity = normalizeEventVenueIdentity(place.name);
    if (!identity) continue;
    const bucket = byIdentity.get(identity);
    if (bucket) bucket.push(place);
    else byIdentity.set(identity, [place]);
  }
  return { bySlug, byIdentity };
}

function venueIndex(places?: readonly PlaceCardData[]): EventVenueIndex {
  if (places) return buildVenueIndex(places);
  if (!defaultVenueIndex) defaultVenueIndex = buildVenueIndex(clientPlaces());
  return defaultVenueIndex;
}

/**
 * Reviewed publisher shorthand -> canonical Radius place slug.
 *
 * These aliases may move a pin, so additions require a human-confirmed
 * one-to-one identity. Fuzzy containment belongs in the thumbnail layer only.
 */
export const REVIEWED_EVENT_VENUE_ALIASES: Readonly<Record<string, string>> = {
  frederickfairgrounds:
    "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick",
};

const STREET_SUFFIX =
  /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ln|lane|pike|ct|court|pl|place|hwy|highway|pkwy|parkway|sq|square|ter|terrace|cir|circle|aly|alley|tpke|turnpike)\b/i;

function streetIdentity(value: string | null | undefined): string | null {
  const chunks = (value ?? "")
    .toLowerCase()
    .split(/\r?\n|\s+-\s+|,/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const raw =
    chunks.find((chunk) => /^\d/.test(chunk)) ??
    chunks.find((chunk) => STREET_SUFFIX.test(chunk)) ??
    "";
  if (!raw || (!/^\d/.test(raw) && !STREET_SUFFIX.test(raw))) return null;
  const tokenAliases: Record<string, string> = {
    north: "n",
    south: "s",
    east: "e",
    west: "w",
    street: "st",
    avenue: "ave",
    road: "rd",
    boulevard: "blvd",
    drive: "dr",
    lane: "ln",
    court: "ct",
    place: "pl",
    highway: "hwy",
    parkway: "pkwy",
    square: "sq",
    terrace: "ter",
    circle: "cir",
    alley: "aly",
    turnpike: "tpke",
  };
  return raw
    .replace(/\b(?:suite|ste|unit|room|rm)\b.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => tokenAliases[token] ?? token)
    .join(" ");
}

type ReviewedAddressVenue = {
  /** The venue name the publisher's own event page prints for this address. */
  name: string;
  /** Town the publisher prints with the address. */
  town: string;
  /** Feeds whose pages were read. Another publisher's row keeps its address. */
  sources: readonly string[];
};

/**
 * Reviewed street address -> venue name, keyed by streetIdentity().
 *
 * The county and Mount Airy calendar feeds put the street address where the
 * venue name belongs ("1440 Taney Avenue"), while the same publishers' event
 * pages name the venue. Each entry was read on the publisher's own event page
 * on 2026-11-25; the URL beside it is that page. Entries are scoped to the
 * feed that was read because several of these buildings hold more than one
 * venue (9020 Amelung Street is also the Urbana Regional Library), and the
 * name is the building, not a room inside it.
 *
 * Add an entry only after reading the publisher's page. A join to the place
 * catalog by address is not a substitute: five places share 121 N Bentz St.
 * Left out until a name is confirmed: 121 N Bentz St and 705 Ridge Ave (the
 * publishers' pages print only "Event Location") and the Downtown Frederick
 * Partnership addresses.
 */
export const REVIEWED_EVENT_ADDRESS_VENUES: Readonly<Record<string, ReviewedAddressVenue>> = {
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=18068
  "1440 taney ave": { name: "Frederick 50+ Community Center", town: "Frederick", sources: ["county"] },
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=17680
  "9020 amelung st": { name: "Urbana 50+ Community Center", town: "Urbana", sources: ["county"] },
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=18691
  "101 prospect st": { name: "Middletown 50+ Community Center", town: "Middletown", sources: ["county"] },
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=18885
  "12 e a st": { name: "Brunswick 50+ Community Center", town: "Brunswick", sources: ["county"] },
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=18147
  "300 s seton ave": { name: "Emmitsburg 50+ Community Center", town: "Emmitsburg", sources: ["county"] },
  // https://www.frederickcountymd.gov/Calendar.aspx?EID=9955 (the page adds
  // "Third Floor Meeting Room"; other meetings use other rooms).
  "12 e church st": { name: "Winchester Hall", town: "Frederick", sources: ["county"] },
  // https://www.mountairymd.gov/Calendar.aspx?EID=9558
  "615 center st": { name: "Watkins Park", town: "Mount Airy", sources: ["mount-airy"] },
};

function wordsOf(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

/**
 * True when the street is the reviewed key, optionally followed only by the
 * reviewed town, the state, a ZIP code or the reviewed name's own words. The
 * county feed appends its second address line to the street, so
 * "12 East Church Street Winchester Hall" still matches. Any other trailing
 * word names a different tenant of the building ("9020 Amelung Street Urbana
 * Regional Library") and the row keeps its own venue.
 */
function matchesReviewedStreet(street: string, key: string, reviewed: ReviewedAddressVenue): boolean {
  if (street === key) return true;
  if (!street.startsWith(`${key} `)) return false;
  const allowed = new Set([...wordsOf(reviewed.town), ...wordsOf(reviewed.name), "md", "maryland"]);
  const rest = street.slice(key.length + 1).split(" ");
  return rest.every(
    (word, index) =>
      allowed.has(word) ||
      /^\d{5}$/.test(word) ||
      (/^\d{4}$/.test(word) && index > 0 && /^\d{5}$/.test(rest[index - 1])),
  );
}

/**
 * The reviewed venue name for an event whose venue name is itself a street
 * address, or null to keep what the feed sent.
 *
 * This changes display copy only. Call it at the card boundary, after the
 * slug and the feed's dedupe key exist, and leave the address field alone.
 * A venue that already has a name, an address in another town, and a feed
 * that was not reviewed all return null.
 */
export function reviewedVenueNameForAddress(input: {
  venue_name?: string | null;
  address?: string | null;
  source?: string | null;
}): string | null {
  const venue = input.venue_name?.trim() ?? "";
  if (!/^\d/.test(venue) || !STREET_SUFFIX.test(venue)) return null;
  const street = streetIdentity(venue);
  if (!street || !input.source) return null;
  const key = Object.keys(REVIEWED_EVENT_ADDRESS_VENUES).find((candidate) =>
    matchesReviewedStreet(street, candidate, REVIEWED_EVENT_ADDRESS_VENUES[candidate]),
  );
  if (!key) return null;
  const reviewed = REVIEWED_EVENT_ADDRESS_VENUES[key];
  if (!reviewed.sources.includes(input.source)) return null;
  const address = input.address ?? "";
  const addressStreet = streetIdentity(address);
  if (addressStreet && !matchesReviewedStreet(addressStreet, key, reviewed)) return null;
  // A full address names its town. The same street number in another town is
  // a different building.
  if (address.includes(",") && !address.toLowerCase().includes(reviewed.town.toLowerCase())) {
    return null;
  }
  return reviewed.name;
}

function hasAddressConflict(eventAddress: string | null | undefined, placeAddress: string): boolean {
  const eventStreet = streetIdentity(eventAddress);
  const placeStreet = streetIdentity(placeAddress);
  return Boolean(eventStreet && placeStreet && eventStreet !== placeStreet);
}

function hasPreciseGeometryConflict(
  input: EventVenueInput,
  place: PlaceCardData,
): boolean {
  if (!input.geom || !isValidCoord(input.geom)) return false;
  const precise =
    input.geo_confidence === "exact_address" ||
    input.geo_confidence === "venue_match" ||
    input.placement === "venue" ||
    input.placement === "geocoded";
  return precise && haversineMeters(input.geom, place.geom) > 800;
}

function conflictsWithPublishedLocation(
  input: EventVenueInput,
  place: PlaceCardData,
): boolean {
  return (
    hasAddressConflict(input.address, place.address) ||
    hasPreciseGeometryConflict(input, place)
  );
}

/**
 * Resolve only identities strong enough to change event geometry.
 *
 * Accepted paths are deliberately narrow: an exact canonical slug, a reviewed
 * alias, or a unique exact normalized place name. A publisher-supplied street
 * address or precise coordinate that conflicts with the candidate wins and
 * blocks the join; that is how an offsite event avoids being pulled back to its
 * organizing venue.
 */
export function resolveReviewedEventVenue(
  input: EventVenueInput,
  places?: readonly PlaceCardData[],
): EventVenueMatch | null {
  if (input.attendance_mode === "online") return null;

  const index = venueIndex(places);
  const identity = normalizeEventVenueIdentity(input.venue_name);
  const exactIdentityCandidates = isGenericEventVenueName(input.venue_name)
    ? []
    : (index.byIdentity.get(identity) ?? []);
  const uniqueIdentity =
    exactIdentityCandidates.length === 1 ? exactIdentityCandidates[0] : null;
  const aliasSlug = identity ? REVIEWED_EVENT_VENUE_ALIASES[identity] : undefined;
  const alias = aliasSlug ? index.bySlug.get(aliasSlug) : undefined;

  const canonical = input.venue_place_slug
    ? index.bySlug.get(input.venue_place_slug)
    : undefined;
  if (canonical) {
    // A canonical slug and an equally strong exact name pointing at different
    // places is a data conflict, not permission to choose one silently.
    if (
      (uniqueIdentity && uniqueIdentity.slug !== canonical.slug) ||
      (alias && alias.slug !== canonical.slug)
    ) {
      return null;
    }
    if (conflictsWithPublishedLocation(input, canonical)) return null;
    return { place: canonical, kind: "canonical_slug" };
  }

  if (alias) {
    if (uniqueIdentity && uniqueIdentity.slug !== alias.slug) return null;
    if (conflictsWithPublishedLocation(input, alias)) return null;
    return { place: alias, kind: "reviewed_alias" };
  }

  if (!uniqueIdentity || conflictsWithPublishedLocation(input, uniqueIdentity)) {
    return null;
  }
  return { place: uniqueIdentity, kind: "exact_identity" };
}

/** Apply an exact/reviewed venue match to an event before paid geocoding. */
export function anchorEventToReviewedVenue<T extends EventVenueInput>(
  event: T,
  places?: readonly PlaceCardData[],
): T {
  const match = resolveReviewedEventVenue(event, places);
  if (!match || !isValidCoord(match.place.geom)) return event;
  return {
    ...event,
    venue_place_slug: match.place.slug,
    geom: { ...match.place.geom },
    placement: "venue",
    geo_confidence: "venue_match",
  };
}
