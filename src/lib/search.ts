// Slim, client-safe set (same canonical public places, pre-decorated
// at build) so this shared search core never drags the ~12MB
// places-enrichment.json into the SearchOverlay client bundle.
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { fuzzyNameScore, fuzzyThresholdForQuery } from "@/lib/search/fuzzy";
import { EVENTS, type Event } from "@/data/events";
import { MUNICIPALITIES, type Municipality } from "@/data/municipalities";
import { CATEGORIES, type Category } from "@/data/categories";
import { countyRegionSummary, municipalityMatchesRegions, regionForMunicipality, type CountyRegion } from "@/data/county-regions";
import { APP_PAGES, type AppPage } from "@/data/app-pages";
import { isUpcomingEvent } from "@/lib/events/visible";
import { FREDERICK_CENTER, haversineMeters, type LngLat } from "@/lib/geo";
import {
  coffeeIntentTier,
  coffeeIntentScore,
  isChainName,
} from "@/lib/category-ranking";
import {
  matchesSearchQualifiers,
  parseSearchQualifiers,
  BREAKFAST_FOOD_EVIDENCE_RE,
  SANDWICH_EVIDENCE_RE,
  type SearchQualifiers,
} from "@/lib/search/qualifiers";
import { isTimedActivityRequest } from "@/lib/ask/intent";
import { expandQuery, type QueryExpansion } from "@/lib/search/synonyms";
import { searchEventWindow, type SearchEventWindow } from "@/lib/search/eventWindow";

export type SearchHit =
  | {
      type: "place";
      place: PlaceCardData;
      score: number;
      conceptCoverage?: { matched: number; total: number };
    }
  | { type: "event"; event: Event & { distance_m?: number }; score: number }
  | { type: "municipality"; municipality: Municipality; score: number }
  | { type: "category"; category: Category; score: number }
  | { type: "page"; page: AppPage; score: number };

// Stop words: articles/prepositions PLUS the conversational filler that
// natural-language Ask queries carry ("i need a hotel", "looking for coffee").
// Two reasons this list grew (owner catch, Jul 2026 — "i need a hotel" surfaced
// Ibiza Cafe, In Fit, Inbloom, Iglesia...):
//   1. a lone "i" gave every place starting with "I" a prefix-match boost;
//   2. many fillers are themselves prefixes of real names ("can"→Canal,
//      "do"→Dollar, "get"→Gettysburg, "how"→Howard, "some"→Somerset), so
//      dropping them removes noise rather than adding it.
// Single-character tokens are dropped outright below (see the length guard).
const STOP = new Set([
  "the", "a", "an", "in", "of", "and", "or", "to", "at", "for", "with", "on", "is", "are", "be",
  "me", "my", "we", "you", "your", "i'm", "im",
  "need", "want", "wanna", "looking", "look", "find", "show", "get", "give", "browse", "browsing",
  "some", "any", "please", "near", "nearby", "around", "where", "what", "how", "can", "do",
  // These words describe the shape or feel of a request, not the destination.
  // Keeping `place` made "quiet place to read" prefer businesses with Place
  // in their name over public libraries. The intent profile below carries the
  // useful meaning while these generic words stay out of literal scoring.
  "place", "places", "somewhere", "quiet", "quieter",
  // Generic conversational fragments are not discovery evidence. Keeping
  // these terms made a nonsense sentence such as "no such thing" rank a
  // business whose blurb happened to say "such as" and a name ending in
  // "No." Real multi-word names still match on their distinguishing words.
  "no", "such", "thing", "things",
  // Time and preference language constrains the decision but is not evidence
  // that a place satisfies the requested thing. Keeping "tonight" as a
  // search term, for example, makes a beer-and-food place look like it only
  // answered two thirds of "beer and food tonight".
  "now", "today", "tonight", "tomorrow", "weekend", "morning", "afternoon", "evening",
  "good", "great", "best", "current", "right",
]);

// Frederick-area words usually describe where to look, not what the visitor
// needs. Keep them for a bare place-name search, but remove them when a query
// also contains a more specific term. Otherwise nonsense such as "zxqv quux
// near Frederick" can rank every business with Frederick in its name.
const LOCAL_CONTEXT = new Set(["frederick", "maryland", "county", "md"]);

function normalize(s: string): string[] {
  const terms = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    // Drop stop words and single-character tokens: a lone "i"/"a" prefix- or
    // substring-matches almost every place name and drowns the real keyword.
    .filter((t) => t.length >= 2 && !STOP.has(t));
  const specificTerms = terms.filter((term) => !LOCAL_CONTEXT.has(term));
  return specificTerms.length > 0 ? specificTerms : terms;
}

type RecognizedShortIntent = "atm" | "dmv" | "er" | "ev" | "wifi" | "ups";

/**
 * Short utility nouns need a closed meaning. Treating `er` or `ev` like an
 * ordinary prefix makes Erica and Evangelical look relevant; treating ATM as
 * the entire `services` bucket pads the right banks with salons and repair
 * shops. These exact aliases are decisions, not typo fragments.
 */
function recognizedShortIntent(query: string): RecognizedShortIntent | null {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized === "atm" || normalized === "atms") return "atm";
  if (normalized === "dmv" || normalized === "mva") return "dmv";
  if (normalized === "er" || normalized === "emergency room") return "er";
  if (
    normalized === "ev" ||
    normalized === "ev charger" ||
    normalized === "ev chargers" ||
    normalized === "ev charging"
  ) return "ev";
  if (normalized === "wifi" || normalized === "wi fi") return "wifi";
  if (normalized === "ups") return "ups";
  return null;
}

function matchesRecognizedShortIntent(
  place: PlaceCardData,
  intent: RecognizedShortIntent,
): boolean {
  const exactFields = [
    place.category,
    place.primary_type ?? "",
    ...(place.subcategories ?? []),
    ...(place.tags ?? []),
  ]
    .map((value) => value.toLowerCase().replace(/_/g, "-"));
  const evidence = [
    place.name,
    place.short_blurb,
    place.description ?? "",
    place.primary_type ?? "",
    ...(place.subcategories ?? []),
    ...(place.tags ?? []),
    ...(place.search_aliases ?? []),
  ].join(" ");
  if (intent === "atm") {
    // A bank is not proof that a publicly accessible ATM exists at this
    // location. Only publish a catalog result when the record explicitly
    // identifies an ATM; the search UI otherwise leads with live map search.
    return (
      exactFields.includes("atm") ||
      /\b(?:atms?|cash machines?)\b/i.test([
        place.name,
        ...(place.search_aliases ?? []),
      ].join(" "))
    );
  }
  if (intent === "er") {
    return (
      /\b(?:emergency room|emergency department|hospital)\b/i.test(evidence) &&
      !/\b(?:shelter|thrift|coalition)\b/i.test(place.name)
    );
  }
  if (intent === "ev") {
    return /\b(?:ev|electric vehicle)\b.{0,24}\bcharg(?:e|er|ers|ing)\b/i.test(evidence);
  }
  if (intent === "wifi") {
    return exactFields.some((field) => field === "wifi" || field === "wi-fi");
  }
  if (intent === "ups") {
    return /\bups\b|\bthe ups store\b/i.test(evidence);
  }
  // DMV is answered by the verified state contact, not a guessed place row.
  return false;
}

function isGenericCoffeeIntent(query: string): boolean {
  return (
    /\b(?:coffee|cafe|café|espresso|latte|cappuccino|roaster)\b/i.test(query) &&
    !/\b(?:boba|bubble tea|tea room|tearoom)\b/i.test(query)
  );
}

function hasExplicitQueryEvidence(
  place: PlaceCardData,
  query: string,
): boolean {
  const terms = normalize(query);
  if (terms.length === 0) return true;
  const evidence = [
    place.name,
    place.short_blurb,
    place.description ?? "",
    place.category,
    place.primary_type ?? "",
    ...(place.subcategories ?? []),
    ...(place.tags ?? []),
    ...(place.search_aliases ?? []),
  ].join(" ");
  // This is the strict guard used when a request narrows a broad umbrella
  // (for example, "antique shopping" inside Shops). Singularize the evidence
  // words as well as the query words. `fieldScore` deliberately normalizes
  // only the query side, which meant singular "antique" could not prove a
  // record filed under the canonical category `antiques`; all 15 real antique
  // destinations were filtered out and only a generic door survived.
  const evidenceWords = new Set(
    evidence
      .toLowerCase()
      .split(/[^\p{L}\p{N}'-]+/gu)
      .filter(Boolean)
      .flatMap((word) => [word, singularTerm(word)]),
  );
  return terms.every((term) =>
    termVariants(term).some((variant) => evidenceWords.has(variant)) ||
    fieldScore(evidence, [term]) > 0,
  );
}

/**
 * Score a place against the query's everyday-word expansion.
 *
 * Deliberately asymmetric. A category hit is worth a solid lift but not
 * more than a real name match, so "prescription" surfaces the pharmacies
 * without letting a synonym outrank someone typing an actual place name.
 * A topic term only counts when the place carries the evidence, which is
 * what keeps "barbecue" from promoting all 165 restaurants.
 */
function expansionScore(
  category: string,
  evidenceText: string,
  expansion: QueryExpansion,
): number {
  if (expansion.cats.length === 0 && expansion.terms.length === 0) return 0;
  let v = 0;
  if (expansion.cats.includes(category)) v += 5;
  const lower = evidenceText.toLowerCase();
  let matched = 0;
  for (const t of expansion.terms) {
    if (lower.includes(t)) matched++;
  }
  // Cap the topic contribution: three pieces of evidence is already a
  // confident match, and uncapped it would drown the name-match signal.
  v += Math.min(matched, 3) * 3;
  return v;
}

/** Small, deliberately conservative inflection normalizer. Search data uses
 * singular curated tags ("bike") while people naturally ask with plurals
 * ("bikes"). This is not meant to be a general stemmer: it only collapses
 * ordinary English noun plurals without rewriting words such as "glass" or
 * "business" into unrelated fragments. */
function singularTerm(term: string): string {
  if (term.length > 4 && /(ches|shes|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (
    term.length > 3 &&
    term.endsWith("s") &&
    !/(ss|us|is|ous)$/.test(term)
  ) return term.slice(0, -1);
  return term;
}

function termVariants(term: string): string[] {
  const variants = new Set([term, singularTerm(term)]);
  // "movies" -> "movie" while "activities" -> "activity". Keeping both
  // conservative candidates is safer than pretending one suffix rule can
  // fully stem English.
  if (term.length > 4 && term.endsWith("ies")) {
    variants.add(term.slice(0, -1));
    variants.add(`${term.slice(0, -3)}y`);
  }
  return [...variants];
}

function fieldScore(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  const words = lower
    .split(/[^\p{L}\p{N}'-]+/gu)
    .filter(Boolean);
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    // Score the best inflection once. "bikes" matching the curated "bike"
    // tag must not count twice merely because both variants are considered.
    let best = 0;
    for (const variant of termVariants(t)) {
      if (lower === variant) best = Math.max(best, 3);
      // Two-letter fragments are not enough evidence for a prefix match.
      // Without this floor, conversational noise such as "no" made Noah,
      // North, and Noma look relevant to "no such thing". Exact two-letter
      // words still match through `words.includes`, so real names such as
      // "No Thyme to Cook" remain searchable without manufacturing nearby
      // results from an unrelated fragment.
      else if (variant.length >= 3 && lower.startsWith(variant)) {
        best = Math.max(best, 2);
      } else if (words.includes(variant)) best = Math.max(best, 1);
    }
    score += best;
  }
  return score;
}

/** Match editorial aliases as complete phrases, not loose bags of words.
 *
 * "Wash Lube Repair" is a real brand alias. Treating its three words as
 * independent evidence would make a Lube Center answer the generic query
 * "repair." Complete-phrase matching preserves the brand doorway while the
 * place's category, tags, and service-specific aliases decide ordinary jobs.
 */
function aliasPhraseScore(query: string, aliases: readonly string[] | undefined): number {
  if (!aliases?.length) return 0;
  const normalizedQuery = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalizedQuery) return 0;

  let best = 0;
  for (const alias of aliases) {
    const normalizedAlias = alias
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (!normalizedAlias) continue;
    const wrappedQuery = ` ${normalizedQuery} `;
    const wrappedAlias = ` ${normalizedAlias} `;
    if (wrappedQuery.includes(wrappedAlias)) {
      best = Math.max(best, normalizedQuery === normalizedAlias ? 16 : 12);
    }
  }
  return best;
}

/**
 * Reward a record that answers EVERY word of a multi-word request.
 *
 * `fieldScore` pays a prefix match (2) more than an exact whole-word hit (1),
 * so a place merely starting with one query word outscored a place containing
 * all of them: "urgent care" ranked Care of Self Center and Carefree Kitchens
 * above Frederick Health Urgent Care. `compoundCoverage` already tiers by
 * coverage but only for connector phrasings ("coffee and bikes"), which a
 * plain noun like "urgent care" never triggers.
 *
 * This is additive on purpose — the established weights keep their meaning,
 * and naming the whole request becomes a tier above naming part of it.
 *
 * Deliberately the NAME only. A weaker tier for full coverage anywhere in the
 * evidence text was tried and removed: nearly every grocer's blurb contains
 * both "grocery" and "store", so it outranked distance and answered "what
 * grocery store is closest to me" with Common Market instead of the Costco
 * actually nearest. Evidence-wide coverage is too cheap to rank on; a name
 * that says the whole thing is not.
 */
function termCoverageScore(name: string, terms: string[]): number {
  if (terms.length < 2) return 0;
  const words = new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}\p{N}'-]+/gu)
      .filter(Boolean)
      .flatMap(termVariants),
  );
  return terms.every((t) => termVariants(t).some((v) => words.has(v))) ? 8 : 0;
}

function compoundCoverage(
  query: string,
  evidenceText: string,
  terms: string[],
): { score: number; matched: number; total: number } | null {
  // A connector signals one combined job, not two unrelated alternatives.
  // "coffee and bikes" should prefer the one coffee bar/bike shop over a
  // generic coffee chain that happens to have a higher curation score.
  if (!/\b(?:and|with|plus|both|combined?)\b/i.test(query)) return null;
  const concepts = Array.from(new Set(terms)).slice(0, 5);
  if (concepts.length < 2) return null;

  const evidence = new Set(
    evidenceText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}'-]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(termVariants),
  );
  const matched = concepts.filter((concept) =>
    termVariants(concept).some((variant) => evidence.has(variant)),
  ).length;
  const missing = concepts.length - matched;
  // Full concept coverage is a ranking tier. Partial matches remain eligible,
  // but they cannot coast on feature score when one place answers the whole
  // request. The modest per-term component still distinguishes 2/3 from 1/3.
  return {
    score: matched === concepts.length
      ? 10 + matched * 2
      : matched * 2 - missing * 3,
    matched,
    total: concepts.length,
  };
}

/**
 * Intent profiles — "kid friendly" / "rainy day" / "date night" are
 * INTENTS, not keywords. When the query expresses one, boost the
 * categories/tags that answer it and downrank the ones that don't (bars
 * for kids, outdoor for rain). This surfaces the right places even when
 * the literal words don't appear in their fields, and sinks mismatches
 * that only matched a stray token.
 */
type Intent = {
  triggers: string[]; // any of these in the query activates the profile
  boostCats: Set<string>;
  boostTags: Set<string>;
  downCats: Set<string>;
  downTags: Set<string>;
  downName?: RegExp;
  /** This job is looking for a destination, not an event with coincidental words. */
  placesOnly?: boolean;
  /** Multi-part evidence required by a compound request. A breakfast
   * sandwich needs BOTH morning-food evidence and sandwich/bagel evidence;
   * matching only one half must not beat a place that answers the full job. */
  evidenceGroups?: RegExp[];
  /** Soft-demote national chains when equally relevant local answers exist. */
  chainPenalty?: number;
};

const INTENTS: Intent[] = [
  {
    triggers: ["oil change", "quick lube", "lube center"],
    boostCats: new Set(["auto-care"]),
    boostTags: new Set(["oil-change", "preventive-maintenance"]),
    downCats: new Set<string>(),
    downTags: new Set<string>(),
  },
  {
    triggers: ["car wash", "auto wash"],
    boostCats: new Set(["auto-care"]),
    boostTags: new Set(["car-wash", "express-car-wash", "full-service-car-wash"]),
    downCats: new Set<string>(),
    downTags: new Set<string>(),
  },
  {
    triggers: ["auto repair", "car repair", "vehicle repair", "auto mechanic"],
    boostCats: new Set(["auto-care"]),
    boostTags: new Set(["auto-repair", "vehicle-repair", "state-inspection"]),
    downCats: new Set<string>(),
    downTags: new Set<string>(),
  },
  {
    triggers: ["breakfast sandwich", "breakfast sandwiches", "egg sandwich", "egg sandwiches", "bagel sandwich", "bagel sandwiches"],
    boostCats: new Set(["coffee", "bakery", "restaurant", "cafe"]),
    boostTags: new Set(["breakfast", "brunch", "coffee", "cafe"]),
    downCats: new Set(["pizza", "bar", "brewery", "lodging", "shopping", "services"]),
    downTags: new Set(["nightlife", "dinner"]),
    evidenceGroups: [
      BREAKFAST_FOOD_EVIDENCE_RE,
      SANDWICH_EVIDENCE_RE,
    ],
    chainPenalty: 3,
  },
  {
    // Radius has no measured noise-level field, so this intent must not label
    // a cafe or park "quiet" by inference. Public libraries are the one
    // catalog role that directly and defensibly answers a place-to-read job.
    triggers: ["place to read", "somewhere to read", "quiet place to read", "read a book", "reading spot"],
    boostCats: new Set(["library"]),
    boostTags: new Set<string>(),
    downCats: new Set(["antiques", "shopping", "services", "auto-care", "bar", "brewery", "distillery", "winery"]),
    downTags: new Set(["nightlife"]),
    placesOnly: true,
  },
  {
    triggers: ["kid", "kids", "family", "children", "child", "kid-friendly", "toddler"],
    boostCats: new Set(["park", "playground", "trail", "museum", "library", "market"]),
    boostTags: new Set(["family", "kids-0-5", "kids-6-12", "kid-friendly", "playground"]),
    downCats: new Set(["bar", "brewery", "distillery", "winery"]),
    downTags: new Set(["21+", "nightlife", "date-night"]),
    downName: /\b(brew|distiller|winer|taproom|tap\s?house|tavern|\bbar\b|pub|lounge|cocktail|dispensar)/i,
  },
  {
    triggers: ["rainy", "rain", "indoor", "indoors"],
    boostCats: new Set(["museum", "library", "gallery", "theater", "coffee", "book-store", "market", "arts"]),
    boostTags: new Set(["indoor"]),
    downCats: new Set(["park", "trail", "playground"]),
    downTags: new Set(["outdoor"]),
  },
  {
    triggers: ["date", "romantic", "date-night"],
    boostCats: new Set(["restaurant", "bar", "brewery", "gallery", "theater", "coffee"]),
    boostTags: new Set(["date-night"]),
    downCats: new Set(["civic", "playground", "park"]),
    downTags: new Set(["kids-0-5", "kids-6-12"]),
  },
  // Lodging — "i need a hotel" / "cheap motels" / "somewhere overnight" is an
  // INTENT for the lodging category, not a name keyword. Boost every lodging
  // place (so all hotels/B&Bs surface, not just the one with "hotel" in its
  // name), and sink the categories that only caught a stray token, so the Ask
  // source cards read as lodging instead of a mixed bag.
  {
    triggers: ["hotel", "hotels", "motel", "motels", "lodging", "overnight", "accommodation", "accommodations", "where to stay", "place to stay", "somewhere to stay"],
    boostCats: new Set(["lodging"]),
    boostTags: new Set(["lodging", "hotel", "bnb", "bed-and-breakfast"]),
    downCats: new Set(["restaurant", "cafe", "coffee", "bar", "gym", "salon", "retail", "civic", "faith", "jewelry"]),
    downTags: new Set<string>(),
  },
];

/**
 * Match a trigger on WORD boundaries, never as a bare substring.
 *
 * The old test was `q.includes(\` ${t} \`) || query.includes(t)`. The second
 * half was there so a trigger still fired next to punctuation ("a date." or
 * "kid-friendly"), and it did that by matching anywhere at all. So every
 * trigger also fired inside longer words:
 *
 *   "validate parking"   -> "date"   -> date-night restaurants
 *   "update my address"  -> "date"   -> date-night restaurants
 *   "candidate forum"    -> "date"   -> date-night restaurants
 *   "childcare"          -> "child"  -> parks and playgrounds
 *   "drainage"           -> "rain"   -> rainy-day indoor venues
 *   "training gym"       -> "rain"   -> rainy-day indoor venues
 *   "family law attorney"-> "family" -> escape games
 *
 * Every one of those is a real query someone could type into a county app
 * that has a parking section and a permits section. This is the same
 * same-letters coincidence that synonyms.ts was built to end after the
 * persona audit found "barbecue" returning barber shops.
 *
 * The boundary is alphanumeric-only, so a hyphen still reads as a break and
 * "kid-friendly" and "date-night" keep working, as does a trailing period.
 */
const TRIGGER_PATTERNS = new WeakMap<Intent, RegExp[]>();

function triggerPatterns(intent: Intent): RegExp[] {
  let compiled = TRIGGER_PATTERNS.get(intent);
  if (!compiled) {
    compiled = intent.triggers.map(
      (t) =>
        new RegExp(
          `(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`,
          "i",
        ),
    );
    TRIGGER_PATTERNS.set(intent, compiled);
  }
  return compiled;
}

function detectIntent(query: string): Intent | null {
  const q = query.toLowerCase();
  for (const intent of INTENTS) {
    if (triggerPatterns(intent).some((rx) => rx.test(q))) return intent;
  }
  return null;
}

/** Signed intent adjustment for a place. Positive surfaces it; negative sinks it. */
function intentScore(
  cat: string,
  tags: readonly string[],
  name: string,
  evidenceText: string,
  intent: Intent,
): number {
  let v = 0;
  if (intent.boostCats.has(cat)) v += 6;
  if (intent.downCats.has(cat)) v -= 8;
  if (intent.downName?.test(name)) v -= 10;
  for (const tag of tags) {
    if (intent.boostTags.has(tag)) v += 3;
    if (intent.downTags.has(tag)) v -= 4;
  }
  if (intent.evidenceGroups?.length) {
    const matched = intent.evidenceGroups.filter((rx) => rx.test(evidenceText)).length;
    // Each supported half earns a small lift; satisfying the complete
    // compound request earns the decisive bonus. Missing every half is a
    // strong relevance failure even if the broad category happens to match.
    v += matched * 4;
    if (matched === intent.evidenceGroups.length) v += 6;
    else v -= (intent.evidenceGroups.length - matched) * 4;
  }
  if (intent.chainPenalty && isChainName(name)) v -= intent.chainPenalty;
  return v;
}

/**
 * Event intents — some queries are asking for something to DO, not a
 * place to be. "live music" is the canonical case the audit caught:
 * the literal token "live" matched a candle shop ("Liveyoung") and it
 * outranked every actual Alive @ Five show. When a query is an event
 * intent, upcoming matching events should lead, soonest first; real
 * venues stay in play; and incidental name-token places step aside.
 */
type EventIntent = {
  triggers: string[];
  /** Generic discovery language ("events near me") accepts any upcoming event. */
  allUpcoming?: boolean;
  /** event.category values that strongly answer this intent. */
  eventCats: Set<string>;
  /** an event qualifies for the boost if its text reads on-topic. */
  topicalRx: RegExp;
  /** place categories that are genuine venues for this intent. */
  venueCats: Set<string>;
};

const EVENT_INTENTS: EventIntent[] = [
  {
    triggers: [
      "events", "event", "things to do", "what's on", "whats on",
      "what is on", "what's happening", "whats happening", "happening tonight",
    ],
    allUpcoming: true,
    eventCats: new Set(),
    topicalRx: /\b(event|festival|show|performance|workshop|class|meetup|happening)\b/i,
    venueCats: new Set(),
  },
  {
    triggers: ["live music", "music", "concert", "concerts", "karaoke", "open mic", "open-mic"],
    eventCats: new Set(["music"]),
    topicalRx: /\b(music|concert|band|live|dj|karaoke|jazz|acoustic|open[- ]mic|singer|songwriter|orchestra|symphony|blues|bluegrass)\b/i,
    venueCats: new Set(["bar", "brewery", "theater", "music", "arts"]),
  },
];

function detectEventIntent(query: string): EventIntent | null {
  if (isTimedActivityRequest(query)) return EVENT_INTENTS[0];
  for (const intent of EVENT_INTENTS) {
    if (intent.triggers.some((term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(query)
    )) return intent;
  }
  return null;
}

/** Public parser used by server concierge paths to decide when loading the
 * larger live-event pool is worth the latency. */
export function isEventSearchIntent(query: string): boolean {
  return detectEventIntent(query) !== null;
}

/** Does this event read as on-topic for the event intent? */
function eventMatchesIntent(e: Event, intent: EventIntent): boolean {
  return (
    intent.allUpcoming === true ||
    intent.eventCats.has(e.category) ||
    intent.topicalRx.test(e.title) ||
    intent.topicalRx.test(e.description ?? "")
  );
}

/**
 * Signed event-intent adjustment for an event. Upcoming on-topic events
 * get a strong, recency-weighted lift (today > weekend > later); past
 * ones are sunk so they never lead over something you can actually go to.
 */
function eventIntentScore(e: Event, intent: EventIntent, now: Date): number {
  if (!eventMatchesIntent(e, intent)) return 0;
  if (!isUpcomingEvent(e, now)) return -30; // past show → never above upcoming
  let v = 14;
  const days = (Date.parse(e.starts_at) - now.getTime()) / 86_400_000;
  v += days <= 1 ? 6 : days <= 3 ? 4 : days <= 7 ? 2 : 0;
  return v;
}

/**
 * `eventPool` — the events to rank. Defaults to the curated seeds so
 * client-safe callers stay bundle-light, but the SERVER search route
 * passes the full unified live set (assembleUnifiedEvents): the seeds
 * are ~30 rows while the live wire carries hundreds, and searching only
 * the seeds made "pride" miss an event sitting at the top of /events
 * (fresh-eyes audit, Jul 2026). EventWithMeta extends Event, so unified
 * rows pass through unchanged.
 */
export type SearchResultKind = "all" | "place" | "event" | "page";

export type SearchOptions = {
  /** Apply an explicit result tab before limiting candidates. */
  resultKind?: SearchResultKind;
  placeFilter?: (place: PlaceCardData) => boolean;
  onlyPlaces?: boolean;
  /**
   * Keep the app's own doors (town + category pages) even when `onlyPlaces`
   * is excluding events.
   *
   * `onlyPlaces` is set for near-me requests to stop the list filling with
   * events, but it also silenced the town and category doors — so "hardware
   * store near me" lost `/category/hardware`, its only real answer, and
   * returned nothing at all, while the bare "hardware store" answered fine.
   * A door is a curated answer, not proximity padding, so the near-me path
   * that filters places down to explicit evidence keeps them.
   */
  includeDoors?: boolean;
  includeMatchingPlaces?: boolean;
  origin?: LngLat | null;
  rankPlacesByDistance?: boolean;
  rankEventsByDistance?: boolean;
  eventMunicipality?: string | null;
  eventFilter?: (event: Event) => boolean;
  /** The original question retains time language after location cleaning. */
  eventQuery?: string;
  /** Injectable clock for deterministic evaluations and time-scoped callers. */
  now?: Date;
};

/** Pre-tokenized page registry — the app's own guides/tools as search
 *  hits ("public restroom" → Amenities, "post office" → Shipping).
 *  Multi-word keywords match ONLY as typed phrases — splitting "water
 *  level" into words made "water bill" surface River levels. Words keep
 *  2-char tokens ("ev" charging) since keywords are curated. */
const PAGE_INDEX = APP_PAGES.map((page) => ({
  page,
  words: new Set(
    [...page.title.toLowerCase().split(/[^a-z0-9]+/), ...page.keywords.filter((k) => !k.includes(" ")).map((k) => k.toLowerCase())]
      .filter((w) => w.length >= 2),
  ),
  phrases: page.keywords.filter((k) => k.includes(" ")).map((k) => k.toLowerCase()),
}));

export function search(
  query: string,
  limit = 30,
  eventPool: readonly Event[] = EVENTS,
  options: SearchOptions = {},
): SearchHit[] {
  const terms = normalize(query);
  const eventIntent = detectEventIntent(query);
  if (
    terms.length === 0 &&
    !options.includeMatchingPlaces &&
    !eventIntent
  ) return [];

  const hits: SearchHit[] = [];
  const intent = detectIntent(query);
  const expansion = expandQuery(query);
  const shortIntent = recognizedShortIntent(query);
  const genericCoffeeIntent = isGenericCoffeeIntent(query);
  const phoneChargingIntent = /\b(?:phone|mobile|device)\s+charg(?:e|er|ers|ing)\b/i.test(query);
  const dogFriendlyPatioIntent =
    /\b(?:dog|pet)[ -]?friendly\b/i.test(query) &&
    /\b(?:patio|outdoor seating|terrace)\b/i.test(query);
  const now = options.now ?? new Date();
  const eventWindow = searchEventWindow(options.eventQuery ?? query, now);
  const explicitEventSearch = options.resultKind === "event" || options.resultKind === "all";
  const datedEventRequest = Boolean((eventIntent || options.resultKind === "event") && eventWindow.meta.label && !options.onlyPlaces);

  for (const p of datedEventRequest || options.resultKind === "event" || options.resultKind === "page" ? [] : clientPlaces()) {
    if (options.placeFilter && !options.placeFilter(p)) continue;
    if (shortIntent && !matchesRecognizedShortIntent(p, shortIntent)) continue;
    const s =
      fieldScore(p.name, terms) * 4 +
      fieldScore(p.short_blurb, terms) * 1 +
      fieldScore(p.description ?? "", terms) * 1 +
      fieldScore(p.category, terms) * 2 +
      fieldScore(p.city, terms) * 1 +
      aliasPhraseScore(query, p.search_aliases) +
      // Curated subcategories are corrected roles (places-overrides.json) —
      // score them like tags so "pizza" finds Pistarro's (subcategory pizza,
      // no pizza in the name) the same way it finds category matches.
      [...(p.tags ?? []), ...(p.subcategories ?? [])].reduce(
        (acc, t) => acc + fieldScore(t, terms),
        0,
      );
    // Intent can SURFACE a relevant place with no keyword match (boost),
    // and SINK a mismatch that only caught a stray token (downrank).
    const evidenceText = [
      p.name,
      p.short_blurb,
      p.description ?? "",
      p.primary_type ?? "",
      ...(p.subcategories ?? []),
      ...(p.tags ?? []),
      ...(p.search_aliases ?? []),
    ].join(" ");
    const reviewedDecisionEvidence = [
      evidenceText,
      p.field_note_tip ?? "",
      ...(p.known_for ?? []),
    ].join(" ");
    // A phone-charging request is not an EV-charging request. Only a record
    // with explicit device/USB/outlet evidence may survive; otherwise the
    // Nearby essentials tool below is the honest route into mapped power.
    if (
      phoneChargingIntent &&
      !/\b(?:phone|mobile|device|usb|power outlet|electrical outlet)\b/i.test(evidenceText)
    ) {
      continue;
    }
    // "Dog-friendly patio" is a compound evidence request. A dog-friendly
    // park or a restaurant with a patio answers only half of it. Keep only
    // hospitality records whose own reviewed fields support both claims.
    if (dogFriendlyPatioIntent) {
      const isHospitality = new Set([
        "restaurant", "bar", "brewery", "distillery", "winery", "cafe", "coffee",
      ]).has(p.category);
      const hasDogEvidence = /\b(?:dog|pet)[ -]?friendly\b/i.test(reviewedDecisionEvidence);
      const hasPatioEvidence = /\b(?:patio|outdoor seating|terrace)\b/i.test(reviewedDecisionEvidence);
      if (!isHospitality || !hasDogEvidence || !hasPatioEvidence) continue;
    }
    const iv = intent
      ? intentScore(
          p.category,
          [...(p.tags ?? []), ...(p.subcategories ?? [])],
          p.name,
          evidenceText,
          intent,
        )
      : 0;
    const coverage = compoundCoverage(query, evidenceText, terms);
    // Everyday words the catalog does not use ("prescription" for the
    // pharmacy category, "barbecue" for the BBQ places filed under
    // restaurant). `cats` answers the need outright; `terms` needs the
    // evidence to be present, so a synonym never promotes a whole
    // category on topic words alone.
    const xv = expansionScore(p.category, evidenceText, expansion);
    const cv = genericCoffeeIntent ? coffeeIntentScore(p) : 0;
    // Event intent ("live music"): genuine venues stay in play, but a
    // place whose only claim was an incidental name token (the candle
    // shop "Liveyoung") steps aside for the actual events below.
    const ev = eventIntent ? (eventIntent.venueCats.has(p.category) ? 2 : -6) : 0;
    const utilityEvidence = shortIntent ? 12 : 0;
    if (s > 0 || iv > 0 || xv > 0 || utilityEvidence > 0 || options.includeMatchingPlaces) {
      const place = options.origin
        ? { ...p, distance_m: haversineMeters(options.origin, p.geom) }
        : p;
      hits.push({
        type: "place",
        place,
        score:
          s +
          p.feature_score +
          iv +
          ev +
          xv +
          cv +
          utilityEvidence +
          (coverage?.score ?? 0) +
          termCoverageScore(p.name, terms),
        conceptCoverage: coverage
          ? { matched: coverage.matched, total: coverage.total }
          : undefined,
      });
    }
  }

  if (options.resultKind !== "place" && options.resultKind !== "page" &&
    (explicitEventSearch || (!options.onlyPlaces && !shortIntent && !intent?.placesOnly && !dogFriendlyPatioIntent && !phoneChargingIntent))) for (const e of eventPool) {
    if (!eventWindow.matches(e)) continue;
    if (options.eventMunicipality && e.municipality !== options.eventMunicipality) continue;
    if (options.eventFilter && !options.eventFilter(e)) continue;
    const eventEvidence = `${e.title} ${e.description ?? ""}`;
    if (dogFriendlyPatioIntent && (
      !/\b(?:dog|pet)[ -]?friendly\b/i.test(eventEvidence) ||
      !/\b(?:patio|outdoor seating|terrace)\b/i.test(eventEvidence)
    )) continue;
    if (phoneChargingIntent && !/\b(?:phone|mobile|device|usb|power outlet|electrical outlet)\b/i.test(eventEvidence)) continue;
    const s =
      fieldScore(e.title, terms) * 4 +
      fieldScore(e.description, terms) * 1 +
      fieldScore(e.venue_name, terms) * 2 +
      fieldScore(e.category, terms) * 2;
    // For an event intent, an on-topic upcoming event leads (soonest
    // first); a past one is sunk. Lets a music show with no literal
    // term match still surface above places for "live music".
    const ev = eventIntent ? eventIntentScore(e, eventIntent, now) : 0;
    if (s > 0 || ev > 0) {
      const event = options.origin
        ? { ...e, distance_m: haversineMeters(options.origin, e.geom) }
        : e;
      hits.push({ type: "event", event, score: s + ev });
    }
  }

  const doorsAllowed = !datedEventRequest && (!options.onlyPlaces || options.includeDoors || options.resultKind === "page");
  // A door riding the strict near-me path meets the same bar its places do:
  // every term of the query has to land. Scoring alone is too generous when
  // no places survive to balance it, and one shared weak word was enough to
  // answer "public restroom near me" with Public art, Public WiFi, and
  // Public safety.
  const doorNeedsEveryTerm = Boolean(options.onlyPlaces && options.includeDoors);
  const doorEarnsPlace = (text: string) => {
    if (!doorNeedsEveryTerm) return true;
    // `termVariants` only de-pluralizes the QUERY, so the term "store" never
    // reaches the Hardware blurb's "stores". Singularize the haystack too, or
    // this check drops the very door it exists to keep.
    const words = new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}'-]+/gu)
        .filter(Boolean)
        .flatMap((w) => [w, singularTerm(w)]),
    );
    return terms.every(
      (t) => termVariants(t).some((v) => words.has(v)) || fieldScore(text, [t]) > 0,
    );
  };

  if (doorsAllowed && !shortIntent) for (const m of MUNICIPALITIES) {
    const s = fieldScore(m.name, terms) * 5 + fieldScore(m.description, terms) * 1;
    if (s > 0 && doorEarnsPlace(`${m.name} ${m.description}`)) {
      hits.push({ type: "municipality", municipality: m, score: s });
    }
  }

  if (doorsAllowed && !shortIntent) for (const c of CATEGORIES) {
    const s = fieldScore(c.name, terms) * 3 + fieldScore(c.blurb, terms) * 1;
    if (s > 0 && doorEarnsPlace(`${c.name} ${c.blurb}`)) {
      hits.push({ type: "category", category: c, score: s });
    }
  }

  // The app's own guides/tools: an exact keyword word scores high enough
  // (14) to lead its noun — "brunch" finds the brunch GUIDE above the
  // places whose blurbs mention brunch — and a typed multi-word keyword
  // ("happy hour", "post office") gets a phrase bonus. Threshold = one
  // real word hit, so stray tokens never surface an unrelated page.
  {
    const ql = query.toLowerCase();
    for (const { page, words, phrases } of PAGE_INDEX) {
      if (datedEventRequest && !["/events", "/events/calendar", "/live-music"].includes(page.href)) continue;
      let s = 0;
      for (const t of terms) if (words.has(t)) s += 14;
      // A typed multi-word keyword ("ev charging", "post office") is the
      // strongest signal — full weight, since its words don't score solo.
      if (phrases.some((p) => ql.includes(p))) s += 14;
      if (s >= 14) {
        // A direct working guide should lead a terse utility query. The
        // supporting place candidates remain underneath when the catalog has
        // trustworthy evidence (for example, the hospital below the ER guide).
        hits.push({ type: "page", page, score: s + (shortIntent ? 12 : 0) });
      }
    }
  }

  // The typo net — fallback only. When exact/substring ranking strands the
  // query with zero place hits ("brewrey", "carrol creek"), the closest
  // trigram matches step in with modest scores so quick actions and real
  // keyword hits still lead. Same math as pg_trgm, run over the in-memory
  // sets (a DB round-trip would be strictly slower at ~1.5k names). Gated
  // at 4+ chars: shorter typos are indistinguishable from prefixes the
  // substring pass already handles.
  if (
    !datedEventRequest &&
    !shortIntent &&
    !phoneChargingIntent &&
    !dogFriendlyPatioIntent &&
    !options.onlyPlaces &&
    !options.placeFilter &&
    query.trim().length >= 4
  ) {
    // Run the typo net on normalized terms, not conversational filler or
    // location context. A single typo keeps pg_trgm's permissive floor;
    // multi-word fallbacks must clear the stronger confidence threshold so
    // unrelated fragments cannot manufacture a "match."
    const fuzzyQuery = terms.join(" ");
    const fuzzyThreshold = fuzzyThresholdForQuery(fuzzyQuery);
    let bestFuzzyPlaceScore = 0;
    let bestFuzzyPlaceSimilarity = 0;
    if (!hits.some((h) => h.type === "place")) {
      const close: { p: PlaceCardData; f: number }[] = [];
      for (const p of clientPlaces()) {
        const f = fuzzyNameScore(fuzzyQuery, p.name);
        if (f >= fuzzyThreshold) close.push({ p, f });
      }
      close.sort((a, b) => b.f - a.f);
      for (const { p, f } of close.slice(0, 3)) {
        const score = f * 10 + p.feature_score;
        bestFuzzyPlaceScore = Math.max(bestFuzzyPlaceScore, score);
        bestFuzzyPlaceSimilarity = Math.max(bestFuzzyPlaceSimilarity, f);
        hits.push({ type: "place", place: p, score });
      }
    }
    if (!hits.some((h) => h.type === "municipality")) {
      for (const m of MUNICIPALITIES) {
        const f = fuzzyNameScore(fuzzyQuery, m.name);
        if (f < fuzzyThreshold) continue;
        // A one-word query that fuzzy-matches a town name is a misspelled
        // TOWN, not a business search. Similarity alone cannot separate the
        // two — "thurmount" scores identically against "Thurmont" and
        // "Thurmont Trolley Trail", because both carry the same token — so
        // the place branch's `+ feature_score` decided it, and every town in
        // the county lost to a business that merely shares its name:
        // "emmitsburgh" led with Emmitsburg Liquors, "frederik" with
        // Frederick Auto Repair. When the town matches at least as closely as
        // the best fuzzy business, the town leads. Derived from the scores
        // actually in play rather than a tuned constant, and reachable only
        // through the typo net, so correctly-spelled queries never touch it.
        const townIsTheWholeQuery =
          terms.length === 1 && f >= bestFuzzyPlaceSimilarity;
        hits.push({
          type: "municipality",
          municipality: m,
          score: townIsTheWholeQuery
            ? Math.max(f * 12, bestFuzzyPlaceScore + 1)
            : f * 12,
        });
      }
    }
  }

  if (options.rankPlacesByDistance) {
    for (const hit of hits) {
      if (hit.type !== "place") continue;
      const distance = hit.place.distance_m;
      if (distance == null || !Number.isFinite(distance)) continue;
      // A precise nearby match should feel like Radius knows where the person
      // is. Relevance and complete concept coverage are already in hit.score;
      // this then gives a strong lift inside a short walk and progressively
      // penalizes results that send a user across the county.
      const proximityLift = 10 / (1 + distance / 600);
      const farPenalty = Math.max(0, distance - 6_000) / 2_000;
      // One continuous local-coffee nudge, rather than a global chain penalty
      // stacked with another preference. A strong independent shop at the
      // reader's feet can beat a chain a block away; a chain at the reader's
      // exact position still wins over farther independents.
      const nearbyLocalCoffeeLift =
        genericCoffeeIntent &&
        coffeeIntentTier(hit.place) === 3 &&
        !isChainName(hit.place.name)
          ? 8 / (1 + distance / 250)
          : 0;
      // Persist the location-aware score. Ask's optional taste reranker runs
      // after this search; keeping the adjustment prevents personalization
      // from accidentally restoring a farther generic result.
      hit.score += proximityLift + nearbyLocalCoffeeLift - farPenalty;
    }
  }

  hits.sort((a, b) => {
    // Keep one transitive ordering across mixed result types. The previous
    // comparator sorted event-vs-event pairs by distance but event-vs-place
    // pairs by relevance, which could push a higher-scoring event below a
    // page of weaker venue cards. Relevance wins globally; distance breaks
    // ties between equally relevant events.
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    if (options.rankEventsByDistance && a.type === "event" && b.type === "event") {
      const distance = (a.event.distance_m ?? Infinity) - (b.event.distance_m ?? Infinity);
      if (distance !== 0) return distance;
    }
    return 0;
  });
  return hits.filter((hit) =>
    !options.resultKind || options.resultKind === "all" || hit.type === options.resultKind ||
    (options.resultKind === "page" && (hit.type === "category" || hit.type === "municipality")),
  ).slice(0, limit);
}

export type QualifiedSearchContext = {
  resultKind?: SearchResultKind;
  origin?: LngLat | null;
  municipality?: string | null;
  contextLabel?: string;
  /** Precise device fixes may expose a distance. Town/home centroids may
   * rank results, but must not be presented as the visitor's distance. */
  canShowDistance?: boolean;
  fallbackReason?: "outside-county" | "location-unavailable" | null;
  /** Injectable clock for deterministic evaluations and tests. */
  now?: Date;
};

export type QualifiedSearchMeta = {
  qualifiers: SearchQualifiers;
  contextLabel: string | null;
  nearMeApplied: boolean;
  fallbackReason: "outside-county" | "location-unavailable" | null;
  eventWindow?: SearchEventWindow;
  scopeMunicipality?: string | null;
};

/** A town named in the query is an explicit destination, not a weak keyword.
 * Bare Frederick stays ambiguous unless the reader says Frederick City. A
 * town name by itself remains a normal municipality search rather than being
 * consumed as an empty scope. */
export function namedMunicipalityScope(query: string): Municipality | null {
  for (const municipality of MUNICIPALITIES) {
    const names = municipality.slug === "frederick"
      ? ["frederick city"]
      : [municipality.name, municipality.slug.replace(/-/g, " ")];
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "i");
      if (!pattern.test(query)) continue;
      const remainder = query
        .replace(pattern, " ")
        .replace(/\b(?:in|near|around|by)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (normalize(remainder).length === 0 && !detectEventIntent(remainder)) {
        return null;
      }
      return municipality;
    }
  }
  return null;
}

function withoutMunicipalityScope(query: string, municipality: Municipality | null): string {
  if (!municipality) return query;
  const names = municipality.slug === "frederick"
    ? ["frederick city"]
    : [municipality.name, municipality.slug.replace(/-/g, " ")];
  let result = query;
  for (const name of new Set(names)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
  }
  return result
    .replace(/\b(?:in|near|around|by)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function balanceRegionalHits(hits: SearchHit[], regions: readonly CountyRegion[], limit: number): SearchHit[] {
  if (regions.length < 2) return hits.slice(0, limit);
  const queues = new Map(regions.map((region) => [region, [] as SearchHit[]]));
  const remainder: SearchHit[] = [];
  for (const hit of hits) {
    const municipality = hit.type === "place"
      ? hit.place.municipality
      : hit.type === "event"
        ? hit.event.municipality
        : null;
    const queue = regionForMunicipality(municipality);
    if (queue && queues.has(queue)) queues.get(queue)?.push(hit);
    else remainder.push(hit);
  }
  const balanced: SearchHit[] = [];
  while (balanced.length < limit && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const region of regions) {
      const next = queues.get(region)?.shift();
      if (next) balanced.push(next);
      if (balanced.length === limit) break;
    }
  }
  return [...balanced, ...remainder].slice(0, limit);
}

/** Execute, rather than merely recognize, category/open/near language. */
export function qualifiedSearch(
  query: string,
  limit = 30,
  eventPool: readonly Event[] = EVENTS,
  context: QualifiedSearchContext = {},
): { hits: SearchHit[]; meta: QualifiedSearchMeta } {
  const qualifiers = parseSearchQualifiers(query);
  const namedMunicipality = namedMunicipalityScope(query);
  const scopedQuery = withoutMunicipalityScope(query, namedMunicipality);
  if (!qualifiers.constrained) {
    const rankingOrigin = namedMunicipality ? null : context.origin ?? null;
    const municipality = namedMunicipality?.slug ?? context.municipality ?? null;
    return {
      hits: search(scopedQuery, limit, eventPool, {
        resultKind: context.resultKind,
        eventQuery: query,
        origin: rankingOrigin,
        rankPlacesByDistance: Boolean(rankingOrigin),
        rankEventsByDistance: Boolean(rankingOrigin),
        eventMunicipality: municipality,
        placeFilter: municipality
          ? (place) => place.municipality === municipality
          : undefined,
        now: context.now,
      }),
      meta: {
        qualifiers,
        contextLabel: namedMunicipality?.name ?? (rankingOrigin ? context.contextLabel ?? null : null),
        nearMeApplied: false,
        fallbackReason: context.fallbackReason ?? null,
        eventWindow: searchEventWindow(query, context.now).meta,
        scopeMunicipality: municipality,
      },
    };
  }

  const nearMeApplied = qualifiers.nearMe && Boolean(context.origin);
  const downtownApplied = qualifiers.downtown;
  const regionalScope = qualifiers.regions.length > 0;
  const rankingOrigin = downtownApplied
    ? FREDERICK_CENTER
    : namedMunicipality
      ? null
      : context.origin ?? null;
  const municipality = regionalScope
    ? null
    : namedMunicipality?.slug ?? (downtownApplied ? "frederick" : context.municipality);
  const downtownRadiusMeters = 1_600;
  const effectiveQuery = withoutMunicipalityScope(qualifiers.cleanedQuery, namedMunicipality);
  // Location language alone must not turn an event-intent query into a
  // place-only search. "Live music near me" should still return concerts;
  // the origin may rank genuine venue places without suppressing events.
  const preserveMixedEventResults = Boolean(
    context.resultKind === "event" || context.resultKind === "all" ||
    (detectEventIntent(query) && !qualifiers.categoryKey && !qualifiers.openNow),
  );
  const semanticIntent = detectIntent(query);
  const broadUmbrellaQuery =
    (qualifiers.categoryKey === "food" && /^\s*(?:food|eat|dining|restaurants?)\s*$/i.test(effectiveQuery)) ||
    (qualifiers.categoryKey === "drinks" && /^\s*(?:drinks?|beverages?)\s*$/i.test(effectiveQuery)) ||
    (qualifiers.categoryKey === "shops" && /^\s*(?:shops?|shopping|stores?)\s*$/i.test(effectiveQuery));
  const umbrellaEvidenceQuery = (() => {
    if (qualifiers.categoryKey === "food") {
      return effectiveQuery.replace(/\b(?:food|eat|dining|restaurants?)\b/gi, " ").replace(/\s+/g, " ").trim();
    }
    if (qualifiers.categoryKey === "drinks") {
      return effectiveQuery.replace(/\b(?:drinks?|beverages?)\b/gi, " ").replace(/\s+/g, " ").trim();
    }
    if (qualifiers.categoryKey === "shops") {
      return effectiveQuery.replace(/\b(?:shops?|shopping|stores?)\b/gi, " ").replace(/\s+/g, " ").trim();
    }
    return effectiveQuery;
  })();
  const requiresSpecificUmbrellaEvidence = Boolean(
    !regionalScope &&
    !semanticIntent &&
    ["food", "drinks", "shops"].includes(qualifiers.categoryKey ?? "") &&
    !broadUmbrellaQuery &&
    umbrellaEvidenceQuery.length > 0,
  );
  const includeMatchingPlaces = qualifiers.compoundIntent
    ? true
    : qualifiers.strictPlaceKind
      ? true
    : qualifiers.categoryKey
    ? qualifiers.includeAllCategoryMatches || regionalScope || broadUmbrellaQuery || effectiveQuery.length === 0
    : qualifiers.openNow ||
      // "Near me" ranks relevant records; it is not permission to fill the
      // list with every nearby business. Utility queries such as "trash can
      // near me" already have a deterministic map action, and arbitrary
      // massage/jewelry/shop rows underneath make that correct action look
      // untrustworthy. Only a location-only query may intentionally browse
      // all nearby places.
      (qualifiers.nearMe &&
        !preserveMixedEventResults &&
        effectiveQuery.length === 0) ||
      effectiveQuery.length === 0;
  const requiresExplicitPlaceEvidence =
    (
      qualifiers.nearMe &&
      !qualifiers.compoundIntent &&
      !qualifiers.strictPlaceKind &&
      !qualifiers.categoryKey &&
      !qualifiers.openNow &&
      effectiveQuery.length > 0 &&
      !preserveMixedEventResults
    ) || requiresSpecificUmbrellaEvidence;
  const explicitEvidenceQuery = requiresSpecificUmbrellaEvidence
    ? umbrellaEvidenceQuery
    : effectiveQuery;
  // Pull a wider candidate set for multi-region requests, then interleave the
  // requested regions. Otherwise a data-rich town can consume the result cap
  // before a smaller town gets a fair chance to appear.
  const candidateLimit = regionalScope && qualifiers.regions.length > 1 ? Math.max(limit * 4, 60) : limit;
  const candidates = search(effectiveQuery, candidateLimit, eventPool, {
    resultKind: context.resultKind,
    eventQuery: query,
    onlyPlaces: !preserveMixedEventResults,
    // Only where places are filtered down to explicit evidence. That branch
    // can legitimately empty the place list, and the town or category door is
    // then the answer the reader came for. Category-recognized requests
    // ("coffee near me") already rank real places and are left untouched.
    includeDoors: requiresExplicitPlaceEvidence,
    includeMatchingPlaces,
    origin: rankingOrigin,
    rankPlacesByDistance: Boolean(rankingOrigin),
    rankEventsByDistance: Boolean(rankingOrigin),
    eventMunicipality: municipality,
    eventFilter: (event) =>
      municipalityMatchesRegions(event.municipality, qualifiers.regions) &&
      (!downtownApplied || haversineMeters(FREDERICK_CENTER, event.geom) <= downtownRadiusMeters),
    placeFilter: (place) =>
      matchesSearchQualifiers(place, qualifiers, municipality) &&
      (!requiresExplicitPlaceEvidence ||
        hasExplicitQueryEvidence(place, explicitEvidenceQuery)) &&
      (!downtownApplied || haversineMeters(FREDERICK_CENTER, place.geom) <= downtownRadiusMeters),
    now: context.now,
  });
  const hits = regionalScope
    ? balanceRegionalHits(candidates, qualifiers.regions, limit)
    : candidates;

  return {
    hits,
    meta: {
      qualifiers,
      contextLabel: regionalScope
        ? countyRegionSummary(qualifiers.regions)
        : namedMunicipality
          ? namedMunicipality.name
        : downtownApplied
          ? "Downtown Frederick"
          : context.contextLabel ?? null,
      nearMeApplied: nearMeApplied || downtownApplied,
      fallbackReason: context.fallbackReason ?? null,
      eventWindow: searchEventWindow(query, context.now).meta,
      scopeMunicipality: municipality ?? null,
    },
  };
}
