import {
  CRAVING_BY_KEY,
  isPlaygroundPlace,
  matchesCraving,
} from "@/data/cravings";
import { countyDecisionClause, municipalityMatchesRegions, parseCountyRegions, type CountyRegion } from "@/data/county-regions";
import type { OpenStatus } from "@/lib/hours";
import { isOpenNow } from "@/lib/hours";
import { primaryAnswerFor, queryWantsOpenNow } from "@/lib/search/answer";
import { cleanReservationSearchQuery, parseReservationRequest } from "@/lib/ask/reservations";

export type SearchQualifierPlace = {
  category: string;
  name: string;
  subcategories?: string[];
  tags?: string[];
  primary_type?: string;
  short_blurb?: string;
  description?: string;
  search_aliases?: string[];
  known_for?: string[];
  field_note_tip?: string;
  municipality?: string;
  open_status: OpenStatus;
};

export type SearchQualifiers = {
  compoundIntent: "breakfast-sandwich" | "steak-dinner" | null;
  strictPlaceKind: "pharmacy" | "gas-station" | "atm" | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  openNow: boolean;
  nearMe: boolean;
  downtown: boolean;
  regions: CountyRegion[];
  /** Query after removing only operational/location language. Category words
   * remain so a specific request such as "pizza" still narrows broad Food. */
  cleanedQuery: string;
  /** Precise craving buckets can surface every member even when the literal
   * word is absent from a name (Cafe Nola is a corrected coffee secondary). */
  includeAllCategoryMatches: boolean;
  constrained: boolean;
};

const NEAR_ME_RE = /\b(?:near\s+me|nearby|closest|nearest|close\s+to\s+me|around\s+me|walking\s+distance)\b/i;
const DOWNTOWN_RE = /\b(?:near\s+|around\s+|in\s+)?downtown(?:\s+frederick)?\b/i;
const MUSIC_EVENT_RE = /\b(?:live\s+music|concerts?|karaoke|open[- ]?mic)\b/i;
const BREAKFAST_SANDWICH_RE = /\b(?:(?:breakfast|egg|bagel)\s+sandwich(?:es)?|sandwich(?:es)?\s+for\s+breakfast)\b/i;
const STEAK_DINNER_RE = /\b(?:steak|steakhouse)\b/i;
const PLAYGROUND_RE = /\bplaygrounds?\b/i;
const PHARMACY_RE = /\b(?:pharmacy|pharmacies|drugstore|drug store)\b/i;
const GAS_STATION_RE = /\b(?:gas stations?|fuel stations?)\b/i;
const ATM_RE = /\b(?:atms?|cash machines?)\b/i;
export const BREAKFAST_FOOD_EVIDENCE_RE = /\b(breakfast|brunch|morning|eggs?|omelets?|omelettes?|bagels?)\b/i;
export const SANDWICH_EVIDENCE_RE = /\b(sandwich(?:es)?|bagels?|biscuits?|croissants?)\b/i;
export const STEAK_EVIDENCE_RE = /\b(steak|steakhouse|ribeye|filet|sirloin|prime\s+rib)\b/i;

export function parseSearchQualifiers(query: string): SearchQualifiers {
  const q = query.toLowerCase().trim();
  const regions = parseCountyRegions(q);
  const decisionQuery = regions.length > 0 ? countyDecisionClause(q) : q;
  const reservationRequest = parseReservationRequest(q);
  const searchDecisionQuery = reservationRequest.requested
    ? cleanReservationSearchQuery(decisionQuery)
    : decisionQuery;
  // "OpenTable" is a booking service, not an open-now request. Strip the
  // booking clause before evaluating hours language.
  const openNow = queryWantsOpenNow(searchDecisionQuery);
  const nearMe = NEAR_ME_RE.test(decisionQuery);
  const downtown = regions.length === 0 && DOWNTOWN_RE.test(decisionQuery);
  const answer = primaryAnswerFor(q);
  const compoundIntent = BREAKFAST_SANDWICH_RE.test(q)
    ? "breakfast-sandwich"
    : STEAK_DINNER_RE.test(q)
      ? "steak-dinner"
      : null;
  const strictPlaceKind = PHARMACY_RE.test(q)
    ? "pharmacy"
    : GAS_STATION_RE.test(q)
      ? "gas-station"
      : ATM_RE.test(q)
        ? "atm"
        : null;

  // "Live music" is an event request, not a place-category constraint. Keep
  // it in the mixed event/venue ranking even though the quick-answer mapping
  // also knows about the Music craving surface.
  const categoryKey = PLAYGROUND_RE.test(q)
    ? "playground"
    : !compoundIntent && answer && answer.key !== "open-now" && !(answer.key === "music" && MUSIC_EVENT_RE.test(q))
      ? answer.key
      : null;
  const category =
    categoryKey && categoryKey !== "playground"
      ? CRAVING_BY_KEY[categoryKey]
      : null;

  let cleanedQuery = searchDecisionQuery;
  if (openNow) {
    cleanedQuery = cleanedQuery
      .replace(/\b(?:what(?:'s|\s+is)|whats|anything|places?)?\s*open(?:\s+(?:right\s+)?now)?\b/gi, " ")
      .replace(/\bopen\s+late\b/gi, " ");
  }
  if (nearMe) cleanedQuery = cleanedQuery.replace(new RegExp(NEAR_ME_RE.source, "gi"), " ");
  if (downtown) cleanedQuery = cleanedQuery.replace(new RegExp(DOWNTOWN_RE.source, "gi"), " ");
  if (regions.length > 0) {
    cleanedQuery = cleanedQuery
      .replace(/\b(?:north|northern|west|western|east|eastern|south|southern|central)\b/gi, " ")
      .replace(/\b(?:part|parts|portion|portions|side|sides|area|areas)\s+of\b/gi, " ")
      .replace(/\b(?:frederick\s+)?county\b/gi, " ");
  }
  // Our category vocabulary is singular. Preserve natural plural queries
  // while normalizing the few nouns whose plural is not a substring match in
  // the useful direction ("restaurants" must match category "restaurant").
  cleanedQuery = cleanedQuery
    .replace(/\brestaurants\b/gi, "restaurant")
    .replace(/\bbreweries\b/gi, "brewery")
    .replace(/\bwineries\b/gi, "winery")
    .replace(/\blibraries\b/gi, "library");
  cleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim().replace(/^[,?!.\s]+|[,?!.\s]+$/g, "");

  // Food/Drinks/Shops are umbrellas. A literal "pizza", "bar", or
  // "bookstore" must still match its own fields rather than expanding to the
  // entire umbrella. The other mappings are specific enough to include all.
  const includeAllCategoryMatches = Boolean(
    category && !new Set(["food", "drinks", "shops"]).has(category.key),
  );

  return {
    compoundIntent,
    strictPlaceKind,
    categoryKey,
    categoryLabel: compoundIntent === "breakfast-sandwich"
      ? "a breakfast sandwich"
      : compoundIntent === "steak-dinner"
        ? "a steak dinner"
        : categoryKey === "playground"
          ? "playgrounds"
        : category?.label ?? null,
    openNow,
    nearMe,
    downtown,
    regions,
    cleanedQuery,
    includeAllCategoryMatches,
    constrained: Boolean(
      compoundIntent ||
      strictPlaceKind ||
      category ||
      openNow ||
      nearMe ||
      downtown ||
      regions.length > 0
    ),
  };
}

export function matchesSearchQualifiers(
  place: SearchQualifierPlace,
  qualifiers: SearchQualifiers,
  municipality?: string | null,
): boolean {
  if (municipality && place.municipality !== municipality) return false;
  if (!municipalityMatchesRegions(place.municipality, qualifiers.regions)) return false;
  if (qualifiers.strictPlaceKind) {
    const exactFields = [
      place.category,
      place.primary_type,
      ...(place.subcategories ?? []),
      ...(place.tags ?? []),
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase().replace(/_/g, "-"));
    const matches =
      qualifiers.strictPlaceKind === "pharmacy"
        ? exactFields.includes("pharmacy") || exactFields.includes("drugstore")
        : qualifiers.strictPlaceKind === "gas-station"
          ? exactFields.includes("gas-station") || exactFields.includes("fuel")
          : exactFields.includes("atm") ||
            /\b(?:atms?|cash machines?)\b/i.test([
              place.name,
              ...(place.search_aliases ?? []),
            ].join(" "));
    if (!matches) return false;
    if (qualifiers.openNow && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.categoryKey === "playground") {
    if (!isPlaygroundPlace(place)) return false;
    if (qualifiers.openNow && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.compoundIntent === "breakfast-sandwich") {
    // Breakfast sandwiches commonly live under coffee, bakery, cafe, or
    // restaurant records. The broad Food craving excludes coffee shops and
    // was the reason Beans & Bagels disappeared from this exact request.
    if (!["coffee", "bakery", "cafe", "restaurant"].includes(place.category)) return false;
    const evidence = [
      place.name,
      place.short_blurb ?? "",
      place.description ?? "",
      place.primary_type ?? "",
      ...(place.subcategories ?? []),
      ...(place.tags ?? []),
    ].join(" ");
    // A menu-specific question needs evidence for BOTH halves. Returning one
    // supported match is more useful than padding the answer with nearby
    // restaurants that merely mention brunch or sandwiches independently.
    if (!BREAKFAST_FOOD_EVIDENCE_RE.test(evidence) || !SANDWICH_EVIDENCE_RE.test(evidence)) return false;
    if (qualifiers.openNow && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.compoundIntent === "steak-dinner") {
    if (place.category !== "restaurant") return false;
    const evidence = [
      place.name,
      place.short_blurb ?? "",
      place.description ?? "",
      place.primary_type ?? "",
      place.field_note_tip ?? "",
      ...(place.known_for ?? []),
      ...(place.subcategories ?? []),
      ...(place.tags ?? []),
    ].join(" ");
    // A menu-specific request needs actual menu/category evidence. Proximity
    // alone is never enough to label a restaurant a steak destination.
    if (!STEAK_EVIDENCE_RE.test(evidence)) return false;
    if (qualifiers.openNow && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.categoryKey) {
    const craving = CRAVING_BY_KEY[qualifiers.categoryKey];
    if (!craving || !matchesCraving(craving, place)) return false;
    if (qualifiers.openNow && !craving.alwaysOpen && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.openNow && !isOpenNow(place.open_status)) {
    return false;
  }
  return true;
}
