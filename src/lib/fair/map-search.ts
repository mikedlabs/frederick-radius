const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "can",
  "do",
  "find",
  "for",
  "i",
  "in",
  "is",
  "it",
  "me",
  "near",
  "of",
  "please",
  "show",
  "the",
  "to",
  "what",
  "where",
  "with",
  "you",
]);

const SEARCH_TERM_ALIASES: Record<string, string> = {
  bathroom: "restroom",
  bathrooms: "restroom",
  buses: "bus",
  loo: "restroom",
  toilet: "restroom",
  toilets: "restroom",
  entrances: "entrance",
  gates: "gate",
  lots: "lot",
  restroom: "restroom",
  restrooms: "restroom",
  wheelchairs: "wheelchair",
};

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singularSearchTerm(value: string): string {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

/**
 * Pulls the useful words out of a visitor's natural-language request. This is
 * intentionally small and deterministic: it helps find reviewed places, but
 * never turns a fuzzy match into an unreviewed vendor location.
 */
export function fairMapSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizedSearchText(query)
        .split(" ")
        .filter((term) => term.length > 0 && !SEARCH_STOP_WORDS.has(term))
        .map((term) => SEARCH_TERM_ALIASES[term] ?? singularSearchTerm(term))
        .filter((term) => term.length > 0),
    ),
  );
}

/**
 * Scores a reviewed map record for a visitor query. Exact phrases always win;
 * otherwise every useful query term must occur somewhere in the record. That
 * lets “wheelchair rental” find a record whose keywords are not adjacent,
 * without widening the search to guesses.
 */
export function fairMapSearchScore(
  query: string,
  searchableValues: readonly string[],
): number {
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) return 0;

  const searchableText = normalizedSearchText(searchableValues.join(" "));
  if (!searchableText) return 0;

  if (searchableText.includes(normalizedQuery)) {
    return 1_000 + normalizedQuery.length;
  }

  const terms = fairMapSearchTerms(query);
  if (
    terms.length === 0 ||
    !terms.every((term) => searchableText.includes(term))
  ) {
    return 0;
  }

  return terms.reduce((score, term) => score + term.length, 0);
}
