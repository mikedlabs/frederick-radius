/**
 * Enrichment-binding sanity — is this Google listing plausibly the SAME
 * business as the curated record it's attached to?
 *
 * The 2026-07-07 UX audit's P0: ~59 place records were enriched with a
 * DIFFERENT business's Google listing (a restaurant carrying a law office's
 * hours/phone/photos under a "Confirmed" badge). The heuristic here is the
 * one that found them: after normalizing possessives and stripping noise, a
 * curated name and a Google display_name that share NO token (allowing
 * prefix matches so "Firestone" ~ "Firestone's" and "visit" ~ "visitor")
 * and don't contain each other squashed is a suspect binding.
 *
 * Used by the data-health spec (every suspect must be quarantined via
 * clearEnrichment or dead via fold/remove) so a future enrichment run
 * cannot silently rebind a place to the wrong business again.
 */

import { isGooglePlaceId } from "@/lib/provenance";

const STOP = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on",
  "llc", "inc", "co", "company", "frederick", "md", "maryland",
]);

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[’']s\b/g, "s");
}
function clean(s: string): string {
  return norm(s).replace(/[^a-z0-9 ]/g, " ");
}
function squash(s: string): string {
  return norm(s).replace(/[^a-z0-9]/g, "");
}
function toks(s: string): string[] {
  return clean(s)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}
function tokensMatch(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.length >= 5 && (y.startsWith(x) || x.startsWith(y))) return true;
      if (y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
    }
  }
  return false;
}

/**
 * True when the (curatedName, googleDisplayName) pair looks like two
 * DIFFERENT businesses. Conservative on purpose:
 *  - an address-style display name (Google returns these for parks) is
 *    never suspect;
 *  - squashed containment ("Crystallume" in "Crystal Lume Medical Spa")
 *    is never suspect;
 *  - any shared/prefix-matching name token clears the pair.
 */
export function isSuspectBinding(curatedName: string, displayName: string): boolean {
  if (!displayName || /^\d/.test(displayName.trim())) return false;
  const sqA = squash(curatedName);
  const sqB = squash(displayName);
  if (!sqA || !sqB) return false;
  if (sqA.includes(sqB) || sqB.includes(sqA)) return false;
  const a = toks(curatedName);
  const b = toks(displayName);
  if (a.length === 0 || b.length === 0) return false;
  return !tokensMatch(a, b);
}

const PROMOTION_STOP = new Set([
  ...STOP,
  "business",
  "cafe",
  "center",
  "centre",
  "city",
  "clinic",
  "county",
  "department",
  "elementary",
  "group",
  "health",
  "healthcare",
  "hospital",
  "market",
  "office",
  "park",
  "public",
  "restaurant",
  "school",
  "service",
  "services",
  "shop",
  "store",
]);

function canonicalIdentityToken(token: string): string {
  return token.length > 4 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
    ? token.slice(0, -1)
    : token;
}

function identityTokens(value: string): string[] {
  return clean(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !PROMOTION_STOP.has(token))
    .map(canonicalIdentityToken)
    .filter((token) => !PROMOTION_STOP.has(token));
}

function identityTokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  return (
    left.length >= 5 &&
    right.length >= 5 &&
    (left.startsWith(right) || right.startsWith(left))
  );
}

// These words distinguish a parent destination from a separately mapped
// subfacility. Shared coordinates and a mostly identical name are not enough:
// "Urbana Community Park" must not inherit the identity or photo for "Urbana
// Community Skate Park." Keep this to concrete facility nouns rather than
// broad business types that Google commonly adds or removes from one listing.
const IDENTITY_SUBFACILITY_QUALIFIERS = new Set([
  "amphitheater",
  "arena",
  "bandshell",
  "branch",
  "campus",
  "deck",
  "department",
  "dog",
  "emergency",
  "field",
  "garage",
  "marina",
  "pavilion",
  "playground",
  "pool",
  "skate",
  "splash",
  "stadium",
  "station",
  "terminal",
  "trailhead",
]);

export function hasIdentitySubfacilityConflict(
  curatedName: string,
  displayName: string | undefined,
): boolean {
  if (!displayName) return false;
  const curated = new Set(clean(curatedName).split(/\s+/).filter(Boolean));
  const enriched = new Set(clean(displayName).split(/\s+/).filter(Boolean));
  return [...IDENTITY_SUBFACILITY_QUALIFIERS].some(
    (qualifier) => curated.has(qualifier) !== enriched.has(qualifier),
  );
}

/**
 * Promotion is intentionally stricter than the broad quarantine heuristic.
 * A shared generic word such as "school" or "health" is not proof that two
 * records describe the same place. Missing an ID is safer than publishing
 * another business's provider identity.
 */
export function isSafeEnrichmentIdentityMatch(
  curatedName: string,
  displayName: string | undefined,
): boolean {
  if (!displayName) return false;
  if (hasIdentitySubfacilityConflict(curatedName, displayName)) return false;
  const curated = identityTokens(curatedName);
  const enriched = identityTokens(displayName);
  if (curated.length === 0 || enriched.length === 0) return false;

  const curatedKey = [...curated].sort().join("");
  const enrichedKey = [...enriched].sort().join("");
  if (curatedKey === enrichedKey) return true;

  const curatedMatches = curated.filter((token) =>
    enriched.some((candidate) => identityTokenMatches(token, candidate)),
  ).length;
  const enrichedMatches = enriched.filter((token) =>
    curated.some((candidate) => identityTokenMatches(token, candidate)),
  ).length;
  return (
    (curatedMatches === curated.length &&
      enrichedMatches / enriched.length >= 0.5) ||
    (enrichedMatches === enriched.length &&
      curatedMatches / curated.length >= 0.5)
  );
}

export function chooseCanonicalGooglePlaceId({
  existingId,
  enrichmentId,
  curatedName,
  enrichmentDisplayName,
  enrichmentOwnerCount,
  claimedByAnotherCanonicalPlace,
  independentlyVerified = false,
}: {
  existingId?: string;
  enrichmentId?: string;
  curatedName: string;
  enrichmentDisplayName?: string;
  enrichmentOwnerCount: number;
  claimedByAnotherCanonicalPlace: boolean;
  /** Set only after a bounded name + coordinate resolver has independently
   * verified this identity against the canonical Radius listing. */
  independentlyVerified?: boolean;
}): string | undefined {
  // A valid canonical identity is authoritative. Enrichment may refresh its
  // facts, but it may not silently switch the record to a different profile.
  if (isGooglePlaceId(existingId)) return existingId;
  const safeNameMatch = isSafeEnrichmentIdentityMatch(
    curatedName,
    enrichmentDisplayName,
  );
  // The bounded resolver also checked distance, so it may accept harmless
  // listing-name variants that the promotion matcher cannot prove by tokens
  // alone. It may never override a parent/subfacility conflict.
  const safeIndependentMatch =
    independentlyVerified &&
    Boolean(enrichmentDisplayName) &&
    !hasIdentitySubfacilityConflict(curatedName, enrichmentDisplayName) &&
    !isSuspectBinding(curatedName, enrichmentDisplayName!);
  if (
    !isGooglePlaceId(enrichmentId) ||
    enrichmentOwnerCount !== 1 ||
    claimedByAnotherCanonicalPlace ||
    (!safeNameMatch && !safeIndependentMatch)
  ) {
    return undefined;
  }
  return enrichmentId;
}

export type GooglePlaceIdCollision = {
  googlePlaceId: string;
  slugs: string[];
};

/** The generated client catalog must have one canonical slug per provider ID. */
export function findGooglePlaceIdCollisions(
  places: ReadonlyArray<{ slug: string; google_place_id?: string | null }>,
): GooglePlaceIdCollision[] {
  const owners = new Map<string, string[]>();
  for (const place of places) {
    if (!isGooglePlaceId(place.google_place_id)) continue;
    owners.set(place.google_place_id, [
      ...(owners.get(place.google_place_id) ?? []),
      place.slug,
    ]);
  }
  return [...owners.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([googlePlaceId, slugs]) => ({
      googlePlaceId,
      slugs: [...slugs].sort(),
    }))
    .sort((left, right) =>
      left.googlePlaceId.localeCompare(right.googlePlaceId),
    );
}
