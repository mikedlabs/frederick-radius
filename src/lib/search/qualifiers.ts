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
import type { PlaceAccessibility } from "@/data/places";

export type SearchPlaceFeature = "wifi" | "quiet" | "restroom" | "parking" | "outlet" | "water" | "ev-charging" | "wheelchair";

const PLACE_FEATURES: ReadonlyArray<{
  key: SearchPlaceFeature;
  pattern: RegExp;
  label: string;
  amenities: readonly string[];
}> = [
  { key: "wifi", pattern: /\b(?:wi[- ]?fi|wireless internet)\b/i, label: "Wi-Fi", amenities: ["wifi", "wi-fi", "wireless-internet"] },
  // The catalog has no measured noise-level field. Never turn a category,
  // descriptive blurb, or a business called Quiet into a confirmed trait.
  { key: "quiet", pattern: /\b(?:quiet|quieter|quietest|low[- ]noise)\b/i, label: "Noise level", amenities: [] },
  { key: "restroom", pattern: /\b(?:restrooms?|bathrooms?|public toilets?|washrooms?)\b/i, label: "Restrooms", amenities: ["restroom", "restrooms", "toilet", "toilets"] },
  { key: "parking", pattern: /\bparking\b/i, label: "Parking", amenities: ["parking", "parking-lot", "free-parking"] },
  { key: "outlet", pattern: /\b(?:(?:power|electrical|public) outlets?|charge (?:my|a) (?:phone|laptop))\b/i, label: "Power outlets", amenities: ["outlet", "power-outlet", "power-outlets", "electrical-outlet"] },
  { key: "water", pattern: /\b(?:drinking water|water fountains?|bottle refill(?: stations?)?)\b/i, label: "Drinking water", amenities: ["drinking-water", "water-fountain", "bottle-refill"] },
  { key: "ev-charging", pattern: /\b(?:(?:ev|electric (?:car|vehicle)) charg(?:er|ers|ing)|charging stations?)\b/i, label: "EV charging", amenities: ["ev-charging", "ev-charger", "charging-station"] },
  { key: "wheelchair", pattern: /\b(?:wheelchair(?:[- ]accessible)?|step[- ]free)\b/i, label: "Wheelchair access", amenities: [] },
];

export type SearchQualifierPlace = {
  slug?: string;
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
  amenities?: string[];
  accessibility?: PlaceAccessibility;
  open_status: OpenStatus;
};

export type SearchQualifiers = {
  /** A catalog name leading a feature request is the destination; a name
   * mentioned after "near" remains a landmark. */
  namedPlaceSlug: string | null;
  compoundIntent: "breakfast-sandwich" | "steak-dinner" | null;
  strictPlaceKind: "pharmacy" | "gas-station" | "atm" | "park" | "library" | "restaurant" | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  openNow: boolean;
  nearMe: boolean;
  downtown: boolean;
  regions: CountyRegion[];
  /** Requested place facts remain explicit even when the catalog cannot
   * confirm them. They are not silently treated as satisfied keywords. */
  requestedFeatures: SearchPlaceFeature[];
  /** Query after separating operational/location language and requested
   * features. Category words remain so "pizza" still narrows broad Food. */
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
const NEGATED_FEATURE_PREFIX = /\b(?:without|no|not|don['’]?t|do not|doesn['’]?t|does not)\s+(?:\w+\s+){0,2}$/i;
export const BREAKFAST_FOOD_EVIDENCE_RE = /\b(breakfast|brunch|morning|eggs?|omelets?|omelettes?|bagels?)\b/i;
export const SANDWICH_EVIDENCE_RE = /\b(sandwich(?:es)?|bagels?|biscuits?|croissants?)\b/i;
export const STEAK_EVIDENCE_RE = /\b(steak|steakhouse|ribeye|filet|sirloin|prime\s+rib)\b/i;

function featureIsNegated(prefix: string): boolean {
  if (NEGATED_FEATURE_PREFIX.test(prefix)) return true;
  // A coordinated feature list inherits its clause: "without Wi-Fi and
  // parking" does not turn parking into a positive request at "and".
  if (!/\b(?:and|plus)\s*$/i.test(prefix)) return false;
  const clause = [...prefix.matchAll(/\b(?:with|without|no|not|has|have|having|offers|including|need|want)\b/gi)].at(-1)?.[0];
  return Boolean(clause && /^(?:without|no|not)$/i.test(clause));
}

export function negatedSearchFeatures(query: string): SearchPlaceFeature[] {
  return PLACE_FEATURES.filter((feature) =>
    [...query.matchAll(new RegExp(feature.pattern.source, "gi"))].some((match) =>
      featureIsNegated(query.slice(0, match.index)),
    ),
  ).map((feature) => feature.key);
}

function affirmativeFeatureRequest(query: string, feature: typeof PLACE_FEATURES[number]): boolean {
  return [...query.matchAll(new RegExp(feature.pattern.source, "gi"))].some((match) => {
    const prefix = query.slice(0, match.index);
    if (featureIsNegated(prefix)) return false;
    // A feature in a business name is not a request for that feature. Limit
    // extraction to affirmative clauses or a trait directly before a role.
    if (/\b(?:with|has|have|having|offers|including|need|want|and|plus)(?:\s+(?:free|public|reliable|a|an))?\s*$/i.test(prefix)) return true;
    return (feature.key === "quiet" || feature.key === "wheelchair") &&
      /^\s*(?:a|an)?\s*$/i.test(prefix) &&
      /^\s*(?:accessible\s+)?(?:coffee|caf[eé]|restaurants?|dinner|parks?|librar(?:y|ies)|hotels?)\b/i.test(query.slice(match.index! + match[0].length));
  });
}

export function parseSearchQualifiers(query: string, options: { literalPlaceName?: string; namedPlaceSlug?: string } = {}): SearchQualifiers {
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
  const literalPlaceToken = "__radius_literal_place__";
  const featureQuery = options.literalPlaceName
    ? searchDecisionQuery.replace(new RegExp(options.literalPlaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), literalPlaceToken)
    : searchDecisionQuery;
  const featureRequests = PLACE_FEATURES.filter((feature) => affirmativeFeatureRequest(featureQuery, feature));
  // The known name was masked first, so "in" within Beans in the Belfry
  // cannot be confused with a location clause or split the destination.
  const namedPlaceSlug = featureRequests.length > 0 || negatedSearchFeatures(featureQuery).length > 0
    ? options.namedPlaceSlug ?? null
    : null;
  const destinationClause = featureQuery.split(/\b(?:with|near|around|by|at|in|has|having|that|offers)\b/i)[0];
  const answer = namedPlaceSlug ? null : primaryAnswerFor(featureRequests.length > 0 ? destinationClause : q);
  const compoundIntent = namedPlaceSlug ? null : BREAKFAST_SANDWICH_RE.test(q)
    ? "breakfast-sandwich"
    : STEAK_DINNER_RE.test(q)
      ? "steak-dinner"
      : null;
  // Singular "park" normally collides with the parking verb. A feature
  // clause makes the destination noun explicit without changing that verb.
  const featurePlaceKind = !namedPlaceSlug && featureRequests.length > 0 && !/\b(?:where (?:can|do) i park|park (?:my|a|the) (?:car|vehicle))\b/i.test(destinationClause)
    ? /\brestaurants?\b/i.test(destinationClause) ? "restaurant"
    : !answer && /\bparks?\b/i.test(destinationClause) ? "park"
    : !answer && /\blibrar(?:y|ies)\b/i.test(destinationClause) ? "library" : null
    : null;
  const strictPlaceKind = namedPlaceSlug ? null : PHARMACY_RE.test(q)
    ? "pharmacy"
    : GAS_STATION_RE.test(q)
      ? "gas-station"
      : ATM_RE.test(q)
        ? "atm"
        : featurePlaceKind;

  // "Live music" is an event request, not a place-category constraint. Keep
  // it in the mixed event/venue ranking even though the quick-answer mapping
  // also knows about the Music craving surface.
  const categoryKey = namedPlaceSlug ? null : PLAYGROUND_RE.test(q)
    ? "playground"
    : !compoundIntent && answer && answer.key !== "open-now" && !(answer.key === "music" && MUSIC_EVENT_RE.test(q))
      ? answer.key
      : null;
  const category =
    categoryKey && categoryKey !== "playground"
      ? CRAVING_BY_KEY[categoryKey]
      : null;

  const requestedFeatures = namedPlaceSlug || categoryKey || compoundIntent || (strictPlaceKind && strictPlaceKind !== "atm")
    ? featureRequests.map((feature) => feature.key)
    : [];

  let cleanedQuery = featureQuery;
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
  for (const feature of featureRequests) {
    if (requestedFeatures.includes(feature.key)) {
      cleanedQuery = cleanedQuery.replace(new RegExp(feature.pattern.source, "gi"), " ");
    }
  }
  if (requestedFeatures.length > 0) {
    cleanedQuery = cleanedQuery.replace(/\b(?:with|and|plus|has|having|that has|accessible)\b/gi, " ");
  }
  // Our category vocabulary is singular. Preserve natural plural queries
  // while normalizing the few nouns whose plural is not a substring match in
  // the useful direction ("restaurants" must match category "restaurant").
  cleanedQuery = cleanedQuery
    .replace(/\brestaurants\b/gi, "restaurant")
    .replace(/\bbreweries\b/gi, "brewery")
    .replace(/\bwineries\b/gi, "winery")
    .replace(/\blibraries\b/gi, "library");
  if (options.literalPlaceName) cleanedQuery = cleanedQuery.replace(literalPlaceToken, options.literalPlaceName.toLowerCase());
  cleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim().replace(/^[,?!.\s]+|[,?!.\s]+$/g, "");

  // Food/Drinks/Shops are umbrellas. A literal "pizza", "bar", or
  // "bookstore" must still match its own fields rather than expanding to the
  // entire umbrella. The other mappings are specific enough to include all.
  const includeAllCategoryMatches = Boolean(
    category && !new Set(["food", "drinks", "shops"]).has(category.key),
  );

  return {
    namedPlaceSlug,
    compoundIntent,
    strictPlaceKind,
    categoryKey,
    categoryLabel: compoundIntent === "breakfast-sandwich"
      ? "a breakfast sandwich"
      : compoundIntent === "steak-dinner"
        ? "a steak dinner"
        : categoryKey === "playground"
          ? "playgrounds"
        : featurePlaceKind === "park" ? "Parks"
        : featurePlaceKind === "library" ? "Libraries"
        : category?.label ?? null,
    openNow,
    nearMe,
    downtown,
    regions,
    requestedFeatures,
    cleanedQuery,
    includeAllCategoryMatches,
    constrained: Boolean(
      namedPlaceSlug ||
      compoundIntent ||
      strictPlaceKind ||
      requestedFeatures.length > 0 ||
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
  if (qualifiers.namedPlaceSlug && place.slug !== qualifiers.namedPlaceSlug) return false;
  if (municipality && place.municipality !== municipality) return false;
  if (!municipalityMatchesRegions(place.municipality, qualifiers.regions)) return false;
  if (qualifiers.requestedFeatures.includes("wheelchair") && place.accessibility?.wheelchair === false) return false;
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
          : qualifiers.strictPlaceKind === "park" || qualifiers.strictPlaceKind === "library" || qualifiers.strictPlaceKind === "restaurant"
            ? exactFields.includes(qualifiers.strictPlaceKind)
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

/** Structured facts alone confirm a requested feature. Missing data remains
 * unknown, while known access barriers are filtered above. */
export function unconfirmedSearchFeatures(
  place: Pick<SearchQualifierPlace, "amenities" | "accessibility">,
  qualifiers: SearchQualifiers,
): SearchPlaceFeature[] {
  const amenities = new Set((place.amenities ?? []).map((value) => value.toLowerCase().replace(/[_ ]/g, "-")));
  return qualifiers.requestedFeatures.filter((key) => {
    if (key === "wheelchair") return place.accessibility?.wheelchair !== true;
    if (key === "restroom" && place.accessibility?.restroom === true) return false;
    if (key === "parking" && place.accessibility?.parking === true) return false;
    return !PLACE_FEATURES.find((feature) => feature.key === key)?.amenities.some((value) => amenities.has(value));
  });
}

export function searchFeatureCaveat(features: readonly SearchPlaceFeature[]): string {
  const labels = features.map((key) => {
    const label = PLACE_FEATURES.find((feature) => feature.key === key)!.label;
    return key === "wifi" || key === "ev-charging" ? label : label.toLowerCase();
  });
  const subject = labels.length < 3
    ? labels.join(" and ")
    : `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
  // Secondary Find rows may truncate. State uncertainty before the facts so
  // a narrow screen cannot hide it and make a partial match look confirmed.
  return subject ? `Not confirmed: ${subject}.` : "";
}
