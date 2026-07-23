import { FUZZY_THRESHOLD, fuzzyNameScore } from "@/lib/search/fuzzy";

export type ToolQueryDocument = {
  /** Stable registry id. Compass carries this so a recognized resident intent
   *  can choose the right tool instead of matching an unrelated shared word. */
  id?: string;
  label: string;
  description: string;
  keywords?: readonly string[];
};

// Compass is a small directory, so its matcher can stay deliberately narrow.
// These are conversational words that describe the request rather than the
// tool itself. Removing them lets "trash can near me" match the trash-can map
// without also treating the Nearby tool as the answer.
const QUERY_FILLER = new Set([
  "a",
  "an",
  "any",
  "are",
  "around",
  "could",
  "do",
  "find",
  "for",
  "get",
  "here",
  "how",
  "i",
  "im",
  "is",
  "looking",
  "me",
  "my",
  "near",
  "nearby",
  "need",
  "please",
  "show",
  "something",
  "there",
  "the",
  "to",
  "use",
  "want",
  "what",
  "whats",
  "where",
  "which",
  "with",
  "would",
  "you",
]);

// Canonicalize the small set of real-world words residents use differently
// from the registry. Both the query and the tool document pass through this
// map, so synonyms meet on neutral terms without inflating every tool's
// keyword list.
const TOKEN_ALIASES: Readonly<Record<string, string>> = {
  bathroom: "restroom",
  bathrooms: "restroom",
  buses: "transit",
  bus: "transit",
  cans: "can",
  charger: "charge",
  chargers: "charge",
  garbage: "trash",
  loo: "restroom",
  outlets: "outlet",
  plugs: "plug",
  restrooms: "restroom",
  rubbish: "trash",
  socket: "outlet",
  sockets: "outlet",
  toilets: "toilet",
  washroom: "restroom",
  washrooms: "restroom",
};

function normalizeToken(token: string): string {
  return TOKEN_ALIASES[token] ?? token;
}

function tokens(
  value: string,
  dropFiller: boolean,
  preserveOriginal = false,
): string[] {
  const words = value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g) ?? [];

  return [...new Set(words.flatMap((word, index) => {
    if (word.length < 2 || (dropFiller && QUERY_FILLER.has(word))) return [];
    // "Can" is filler in "can I find a bus," but it is the object in
    // "trash can near me." Keep the noun and drop only the question form.
    if (
      dropFiller &&
      word === "can" &&
      ["i", "someone", "we", "you"].includes(words[index + 1] ?? "")
    ) return [];

    const normalized = normalizeToken(word);
    return preserveOriginal && normalized !== word
      ? [word, normalized]
      : [normalized];
  }))];
}

export function toolQueryTerms(query: string): string[] {
  return tokens(query, true);
}

type QueryIntent = {
  id: string;
  score: (terms: ReadonlySet<string>) => number;
};

function hasAny(terms: ReadonlySet<string>, choices: readonly string[]): boolean {
  return choices.some((choice) => terms.has(choice));
}

/**
 * Small, high-confidence resident intents. These are deliberately about the
 * object being acted on, not exact sentences: an iPhone/laptop being charged
 * means a public outlet, while a car being charged means the EV layer. The
 * score leaves room for a request to name two tools ("bus and parking") while
 * preventing a weak shared word from winning ("mail a letter" is Shipping,
 * not the Dear Frederick letter archive).
 */
const QUERY_INTENTS: readonly QueryIntent[] = [
  {
    id: "search",
    score: (terms) => {
      const placeOrMeal = hasAny(terms, [
        "breakfast", "coffee", "dinner", "grocery", "lunch", "pharmacy",
        "restaurant", "shop", "store",
      ]);
      const dateNight = terms.has("date") && terms.has("night");
      const familyIdea = hasAny(terms, ["family", "kid", "kids"]) && hasAny(terms, ["friendly", "idea", "outing"]);
      const market = terms.has("market") && hasAny(terms, ["farmer", "farmers"]);
      return placeOrMeal || dateNight || familyIdea || market ? 90 : 0;
    },
  },
  {
    id: "county-pulse",
    score: (terms) => {
      const airQuality =
        hasAny(terms, ["aqi", "smoke"])
        || (terms.has("air") && terms.has("quality"));
      const roadStatus =
        hasAny(terms, ["road", "roads"])
        && hasAny(terms, ["closure", "closures", "condition", "conditions"]);
      const direct = hasAny(terms, [
        "alert", "alerts", "outage", "outages", "weather",
      ]);
      return airQuality || roadStatus || direct ? 100 : 0;
    },
  },
  {
    id: "power-outlets",
    score: (terms) => {
      const personalDevice = hasAny(terms, [
        "battery", "computer", "device", "ipad", "iphone", "laptop", "phone", "tablet",
      ]);
      const powerAction = hasAny(terms, ["charge", "outlet", "plug", "power"]);
      const explicitEv = hasAny(terms, ["ev", "electric", "vehicle"]);
      return personalDevice && powerAction && !explicitEv ? 100 : 0;
    },
  },
  {
    id: "ev-charging",
    score: (terms) => {
      const charging = hasAny(terms, ["charge", "charging"]);
      const personalDevice = hasAny(terms, ["ipad", "iphone", "laptop", "phone", "tablet"]);
      const explicitEv = hasAny(terms, ["ev", "electric", "vehicle"]);
      const car = terms.has("car") && !personalDevice;
      return charging && (explicitEv || car) ? 100 : 0;
    },
  },
  {
    id: "water",
    score: (terms) => {
      const vessel = hasAny(terms, ["bottle", "cup", "canteen"]);
      const refill = hasAny(terms, ["drink", "drinking", "fountain", "refill"]);
      return refill && (terms.has("water") || vessel) ? 90 : 0;
    },
  },
  {
    id: "parking",
    score: (terms) => {
      if (hasAny(terms, ["garage", "parking", "parkmobile"])) return 90;
      return terms.has("park") && hasAny(terms, ["car", "downtown", "street", "vehicle"])
        ? 90
        : 0;
    },
  },
  {
    id: "public-wifi",
    score: (terms) => {
      const wifi = terms.has("wifi") || terms.has("wireless") || (terms.has("wi") && terms.has("fi"));
      return wifi ? 90 : 0;
    },
  },
  {
    id: "transit",
    score: (terms) => hasAny(terms, ["bus", "marc", "transit"])
      || (terms.has("train") && hasAny(terms, ["commute", "public", "route", "schedule"]))
      ? 90
      : 0,
  },
  {
    id: "shipping",
    score: (terms) => {
      const direct = hasAny(terms, [
        "fedex", "mail", "package", "parcel", "postal", "shipping", "usps",
      ]);
      const sendSomething = hasAny(terms, ["post", "send", "ship"])
        && hasAny(terms, ["letter", "package", "parcel"]);
      return direct || sendSomething ? 100 : 0;
    },
  },
];

function queryIntentTargets(query: string): Set<string> {
  // Preserve both aliases and original tokens. "bus" becomes "transit" for
  // ordinary matching, while retaining the resident's word helps the intent
  // layer stay legible and independently testable.
  const terms = new Set(tokens(query, false, true));
  const scores = QUERY_INTENTS
    .map((intent) => ({ id: intent.id, score: intent.score(terms) }))
    .filter((intent) => intent.score > 0);
  if (scores.length === 0) return new Set();

  // Keep every strong intent, rather than only one winner, so "I need parking
  // and a bus" can return both working tools.
  return new Set(scores.map((intent) => intent.id));
}

function termMatches(queryTerm: string, documentTerms: readonly string[]): boolean {
  if (documentTerms.includes(queryTerm)) return true;
  if (queryTerm.length < 4) return false;

  // Use the same typo net as app-wide search, but keep Compass stricter than
  // the broad place-name fallback. A tool must answer every meaningful query
  // term, so an accidental fuzzy neighbor cannot surface on its own.
  const threshold = Math.max(FUZZY_THRESHOLD, 0.45);
  return documentTerms.some(
    (documentTerm) =>
      documentTerm.length >= 4 && fuzzyNameScore(queryTerm, documentTerm) >= threshold,
  );
}

/**
 * Match a natural-language request against one Compass destination.
 * Every meaningful query term must be supported by the tool. This keeps a
 * request such as "charge my phone" on Power outlets instead of also showing
 * EV charging merely because both contain a form of "charge."
 */
export function toolMatchesQuery(
  item: ToolQueryDocument,
  query: string,
): boolean {
  const queryTerms = toolQueryTerms(query);
  if (queryTerms.length === 0) return true;

  const intentTargets = queryIntentTargets(query);
  if (intentTargets.size > 0 && item.id) {
    return intentTargets.has(item.id);
  }

  const documentTerms = tokens(
    `${item.label} ${item.description} ${(item.keywords ?? []).join(" ")}`,
    false,
    true,
  );

  return queryTerms.every((term) => termMatches(term, documentTerms));
}
