import { haversineMeters, isValidCoord, type LngLat } from "@/lib/geo";
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { MUNICIPALITIES } from "@/data/municipalities";

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

export function normalizeEventVenueIdentity(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const GENERIC_EVENT_VENUE_IDENTITIES = new Set([
  ...MUNICIPALITIES.flatMap((municipality) => [
    normalizeEventVenueIdentity(municipality.name),
    normalizeEventVenueIdentity(municipality.slug),
  ]),
  "frederick",
  "frederickcounty",
  "frederickmd",
  "frederickmaryland",
  "maryland",
  "md",
  "downtown",
  "downtownfrederick",
  "county",
  "online",
  "virtual",
  "tbd",
]);

export function isGenericEventVenueName(value: string | null | undefined): boolean {
  const identity = normalizeEventVenueIdentity(value);
  return !identity || GENERIC_EVENT_VENUE_IDENTITIES.has(identity);
}

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
