/**
 * Native-menu query evidence.
 *
 * This deliberately does not try to guess that every food-shaped word is a
 * dish request. "Coffee and bikes" is a place-intent query; a menu row that
 * merely contains "coffee" must not hijack it. Native menu data may own an
 * Ask answer only when it covers every meaningful term and the request is
 * explicitly about a menu/item, or when a multi-word dish is an exact fit.
 */

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "around",
  "at",
  "can",
  "close",
  "closest",
  "do",
  "does",
  "for",
  "frederick",
  "find",
  "get",
  "has",
  "have",
  "i",
  "in",
  "is",
  "it",
  "me",
  "menu",
  "menus",
  "my",
  "near",
  "nearby",
  "now",
  "of",
  "on",
  "please",
  "restaurant",
  "restaurants",
  "right",
  "some",
  "serve",
  "serves",
  "that",
  "the",
  "there",
  "to",
  "today",
  "tonight",
  "want",
  "where",
  "who",
  "with",
]);

const EXPLICIT_MENU_REQUEST =
  /\b(?:menu|menus|serve|serves|served|serving|have|has|dish|dishes|plate|plates|item|items|order|offers?|find|looking for|who makes|who has|where can i (?:eat|get|find))\b/i;

function normalizedWords(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function singular(term: string): string {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && /(ches|shes|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith("s") && !/(ss|us|is)$/.test(term)) {
    return term.slice(0, -1);
  }
  return term;
}

function variants(term: string): string[] {
  return Array.from(new Set([term, singular(term)]));
}

export function nativeMenuQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizedWords(query)
        .filter((term) => term.length >= 2 && !QUERY_STOP_WORDS.has(term))
        .map(singular),
    ),
  ).slice(0, 8);
}

export type NativeMenuTextCandidate = {
  itemName: string;
  sectionName?: string | null;
  description?: string | null;
  dietaryLabels?: readonly string[] | null;
};

export type NativeMenuQueryEvidence = {
  terms: string[];
  matchedTerms: string[];
  coverage: number;
  exactItemPhrase: boolean;
  explicitMenuRequest: boolean;
};

export function nativeMenuQueryEvidence(
  query: string,
  candidate: NativeMenuTextCandidate,
): NativeMenuQueryEvidence {
  const terms = nativeMenuQueryTerms(query);
  const itemWords = normalizedWords(candidate.itemName);
  const evidenceWords = new Set(
    [
      candidate.itemName,
      candidate.sectionName ?? "",
      candidate.description ?? "",
      ...(candidate.dietaryLabels ?? []),
    ]
      .flatMap(normalizedWords)
      .flatMap(variants),
  );
  const matchedTerms = terms.filter((term) =>
    variants(term).some((variant) => evidenceWords.has(variant)),
  );
  const normalizedItem = itemWords.map(singular).join(" ");
  const normalizedQuery = terms.join(" ");

  return {
    terms,
    matchedTerms,
    coverage: terms.length > 0 ? matchedTerms.length / terms.length : 0,
    exactItemPhrase:
      terms.length > 0 &&
      (normalizedItem === normalizedQuery ||
        normalizedItem.includes(normalizedQuery)),
    explicitMenuRequest: EXPLICIT_MENU_REQUEST.test(query),
  };
}

/**
 * Strong enough to replace a generic Ask answer with a deterministic,
 * source-backed menu answer.
 */
export function shouldAnswerFromNativeMenu(
  query: string,
  candidate: NativeMenuTextCandidate,
): boolean {
  const evidence = nativeMenuQueryEvidence(query, candidate);
  if (evidence.terms.length === 0 || evidence.coverage < 1) return false;
  return (
    evidence.explicitMenuRequest ||
    (evidence.terms.length >= 2 && evidence.exactItemPhrase)
  );
}

/**
 * Useful enough to annotate a normal Search result. Search can be more
 * permissive than Ask because it does not claim the menu row is the answer.
 */
export function isUsefulNativeMenuMatch(
  query: string,
  candidate: NativeMenuTextCandidate,
): boolean {
  const evidence = nativeMenuQueryEvidence(query, candidate);
  return evidence.terms.length > 0 && evidence.coverage >= 0.5;
}
