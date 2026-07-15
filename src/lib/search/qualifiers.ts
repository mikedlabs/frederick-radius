import { CRAVING_BY_KEY, matchesCraving } from "@/data/cravings";
import type { OpenStatus } from "@/lib/hours";
import { isOpenNow } from "@/lib/hours";
import { primaryAnswerFor, queryWantsOpenNow } from "@/lib/search/answer";

export type SearchQualifierPlace = {
  category: string;
  name: string;
  subcategories?: string[];
  municipality?: string;
  open_status: OpenStatus;
};

export type SearchQualifiers = {
  categoryKey: string | null;
  categoryLabel: string | null;
  openNow: boolean;
  nearMe: boolean;
  /** Query after removing only operational/location language. Category words
   * remain so a specific request such as "pizza" still narrows broad Food. */
  cleanedQuery: string;
  /** Precise craving buckets can surface every member even when the literal
   * word is absent from a name (Cafe Nola is a corrected coffee secondary). */
  includeAllCategoryMatches: boolean;
  constrained: boolean;
};

const NEAR_ME_RE = /\b(?:near\s+me|nearby|closest|nearest|close\s+to\s+me|around\s+me|walking\s+distance)\b/i;
const MUSIC_EVENT_RE = /\b(?:live\s+music|concerts?|karaoke|open[- ]?mic)\b/i;

export function parseSearchQualifiers(query: string): SearchQualifiers {
  const q = query.toLowerCase().trim();
  const openNow = queryWantsOpenNow(q);
  const nearMe = NEAR_ME_RE.test(q);
  const answer = primaryAnswerFor(q);

  // "Live music" is an event request, not a place-category constraint. Keep
  // it in the mixed event/venue ranking even though the quick-answer mapping
  // also knows about the Music craving surface.
  const categoryKey =
    answer && answer.key !== "open-now" && !(answer.key === "music" && MUSIC_EVENT_RE.test(q))
      ? answer.key
      : null;
  const category = categoryKey ? CRAVING_BY_KEY[categoryKey] : null;

  let cleanedQuery = q;
  if (openNow) {
    cleanedQuery = cleanedQuery
      .replace(/\b(?:what(?:'s|\s+is)|whats|anything|places?)?\s*open(?:\s+(?:right\s+)?now)?\b/gi, " ")
      .replace(/\bopen\s+late\b/gi, " ");
  }
  if (nearMe) cleanedQuery = cleanedQuery.replace(new RegExp(NEAR_ME_RE.source, "gi"), " ");
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
    categoryKey,
    categoryLabel: category?.label ?? null,
    openNow,
    nearMe,
    cleanedQuery,
    includeAllCategoryMatches,
    constrained: Boolean(category || openNow || nearMe),
  };
}

export function matchesSearchQualifiers(
  place: SearchQualifierPlace,
  qualifiers: SearchQualifiers,
  municipality?: string | null,
): boolean {
  if (municipality && place.municipality !== municipality) return false;
  if (qualifiers.categoryKey) {
    const craving = CRAVING_BY_KEY[qualifiers.categoryKey];
    if (!craving || !matchesCraving(craving, place)) return false;
    if (qualifiers.openNow && !craving.alwaysOpen && !isOpenNow(place.open_status)) return false;
  } else if (qualifiers.openNow && !isOpenNow(place.open_status)) {
    return false;
  }
  return true;
}
