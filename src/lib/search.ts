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
import { isChainName } from "@/lib/category-ranking";
import {
  matchesSearchQualifiers,
  parseSearchQualifiers,
  BREAKFAST_FOOD_EVIDENCE_RE,
  SANDWICH_EVIDENCE_RE,
  type SearchQualifiers,
} from "@/lib/search/qualifiers";
import { isTimedActivityRequest } from "@/lib/ask/intent";

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
  "need", "want", "wanna", "looking", "look", "find", "show", "get", "give",
  "some", "any", "please", "near", "nearby", "around", "where", "what", "how", "can", "do",
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
      else if (lower.startsWith(variant)) best = Math.max(best, 2);
      else if (words.includes(variant)) best = Math.max(best, 1);
    }
    score += best;
  }
  return score;
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
  /** Multi-part evidence required by a compound request. A breakfast
   * sandwich needs BOTH morning-food evidence and sandwich/bagel evidence;
   * matching only one half must not beat a place that answers the full job. */
  evidenceGroups?: RegExp[];
  /** Soft-demote national chains when equally relevant local answers exist. */
  chainPenalty?: number;
};

const INTENTS: Intent[] = [
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

function detectIntent(query: string): Intent | null {
  const q = ` ${query.toLowerCase()} `;
  for (const intent of INTENTS) {
    if (intent.triggers.some((t) => q.includes(` ${t} `) || query.toLowerCase().includes(t))) return intent;
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
  const q = ` ${query.toLowerCase()} `;
  const lower = query.toLowerCase();
  for (const intent of EVENT_INTENTS) {
    if (intent.triggers.some((t) => q.includes(` ${t} `) || lower.includes(t))) return intent;
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
export type SearchOptions = {
  placeFilter?: (place: PlaceCardData) => boolean;
  onlyPlaces?: boolean;
  includeMatchingPlaces?: boolean;
  origin?: LngLat | null;
  rankPlacesByDistance?: boolean;
  rankEventsByDistance?: boolean;
  eventMunicipality?: string | null;
  eventFilter?: (event: Event) => boolean;
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
  if (terms.length === 0 && !options.includeMatchingPlaces) return [];

  const hits: SearchHit[] = [];
  const intent = detectIntent(query);
  const eventIntent = detectEventIntent(query);
  const now = new Date();

  for (const p of clientPlaces()) {
    if (options.placeFilter && !options.placeFilter(p)) continue;
    const s =
      fieldScore(p.name, terms) * 4 +
      fieldScore(p.short_blurb, terms) * 1 +
      fieldScore(p.description ?? "", terms) * 1 +
      fieldScore(p.category, terms) * 2 +
      fieldScore(p.city, terms) * 1 +
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
    ].join(" ");
    const iv = intent ? intentScore(p.category, p.tags ?? [], p.name, evidenceText, intent) : 0;
    const coverage = compoundCoverage(query, evidenceText, terms);
    // Event intent ("live music"): genuine venues stay in play, but a
    // place whose only claim was an incidental name token (the candle
    // shop "Liveyoung") steps aside for the actual events below.
    const ev = eventIntent ? (eventIntent.venueCats.has(p.category) ? 2 : -6) : 0;
    if (s > 0 || iv > 0 || options.includeMatchingPlaces) {
      const place = options.origin
        ? { ...p, distance_m: haversineMeters(options.origin, p.geom) }
        : p;
      hits.push({
        type: "place",
        place,
        score: s + p.feature_score + iv + ev + (coverage?.score ?? 0),
        conceptCoverage: coverage
          ? { matched: coverage.matched, total: coverage.total }
          : undefined,
      });
    }
  }

  if (!options.onlyPlaces) for (const e of eventPool) {
    if (options.eventMunicipality && e.municipality !== options.eventMunicipality) continue;
    if (options.eventFilter && !options.eventFilter(e)) continue;
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

  if (!options.onlyPlaces) for (const m of MUNICIPALITIES) {
    const s = fieldScore(m.name, terms) * 5 + fieldScore(m.description, terms) * 1;
    if (s > 0) hits.push({ type: "municipality", municipality: m, score: s });
  }

  if (!options.onlyPlaces) for (const c of CATEGORIES) {
    const s = fieldScore(c.name, terms) * 3 + fieldScore(c.blurb, terms) * 1;
    if (s > 0) hits.push({ type: "category", category: c, score: s });
  }

  // The app's own guides/tools: an exact keyword word scores high enough
  // (14) to lead its noun — "brunch" finds the brunch GUIDE above the
  // places whose blurbs mention brunch — and a typed multi-word keyword
  // ("happy hour", "post office") gets a phrase bonus. Threshold = one
  // real word hit, so stray tokens never surface an unrelated page.
  {
    const ql = query.toLowerCase();
    for (const { page, words, phrases } of PAGE_INDEX) {
      let s = 0;
      for (const t of terms) if (words.has(t)) s += 14;
      // A typed multi-word keyword ("ev charging", "post office") is the
      // strongest signal — full weight, since its words don't score solo.
      if (phrases.some((p) => ql.includes(p))) s += 14;
      if (s >= 14) hits.push({ type: "page", page, score: s });
    }
  }

  // The typo net — fallback only. When exact/substring ranking strands the
  // query with zero place hits ("brewrey", "carrol creek"), the closest
  // trigram matches step in with modest scores so quick actions and real
  // keyword hits still lead. Same math as pg_trgm, run over the in-memory
  // sets (a DB round-trip would be strictly slower at ~1.5k names). Gated
  // at 4+ chars: shorter typos are indistinguishable from prefixes the
  // substring pass already handles.
  if (!options.onlyPlaces && !options.placeFilter && query.trim().length >= 4) {
    // Run the typo net on normalized terms, not conversational filler or
    // location context. A single typo keeps pg_trgm's permissive floor;
    // multi-word fallbacks must clear the stronger confidence threshold so
    // unrelated fragments cannot manufacture a "match."
    const fuzzyQuery = terms.join(" ");
    const fuzzyThreshold = fuzzyThresholdForQuery(fuzzyQuery);
    if (!hits.some((h) => h.type === "place")) {
      const close: { p: PlaceCardData; f: number }[] = [];
      for (const p of clientPlaces()) {
        const f = fuzzyNameScore(fuzzyQuery, p.name);
        if (f >= fuzzyThreshold) close.push({ p, f });
      }
      close.sort((a, b) => b.f - a.f);
      for (const { p, f } of close.slice(0, 3)) {
        hits.push({ type: "place", place: p, score: f * 10 + p.feature_score });
      }
    }
    if (!hits.some((h) => h.type === "municipality")) {
      for (const m of MUNICIPALITIES) {
        const f = fuzzyNameScore(fuzzyQuery, m.name);
        if (f >= fuzzyThreshold) hits.push({ type: "municipality", municipality: m, score: f * 12 });
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
      // Persist the location-aware score. Ask's optional taste reranker runs
      // after this search; keeping the adjustment prevents personalization
      // from accidentally restoring a farther generic result.
      hit.score += proximityLift - farPenalty;
    }
  }

  hits.sort((a, b) => {
    if (options.rankEventsByDistance && a.type === "event" && b.type === "event") {
      const distance = (a.event.distance_m ?? Infinity) - (b.event.distance_m ?? Infinity);
      if (distance !== 0) return distance;
    }
    return b.score - a.score;
  });
  return hits.slice(0, limit);
}

export type QualifiedSearchContext = {
  origin?: LngLat | null;
  municipality?: string | null;
  contextLabel?: string;
  /** Precise device fixes may expose a distance. Town/home centroids may
   * rank results, but must not be presented as the visitor's distance. */
  canShowDistance?: boolean;
  fallbackReason?: "outside-county" | "location-unavailable" | null;
};

export type QualifiedSearchMeta = {
  qualifiers: SearchQualifiers;
  contextLabel: string | null;
  nearMeApplied: boolean;
  fallbackReason: "outside-county" | "location-unavailable" | null;
};

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
  if (!qualifiers.constrained) {
    const rankingOrigin = context.origin ?? null;
    const municipality = context.municipality ?? null;
    return {
      hits: search(query, limit, eventPool, {
        origin: rankingOrigin,
        rankPlacesByDistance: Boolean(rankingOrigin),
        rankEventsByDistance: Boolean(rankingOrigin),
        eventMunicipality: municipality,
        placeFilter: municipality
          ? (place) => place.municipality === municipality
          : undefined,
      }),
      meta: {
        qualifiers,
        contextLabel: rankingOrigin ? context.contextLabel ?? null : null,
        nearMeApplied: false,
        fallbackReason: context.fallbackReason ?? null,
      },
    };
  }

  const nearMeApplied = qualifiers.nearMe && Boolean(context.origin);
  const downtownApplied = qualifiers.downtown;
  const regionalScope = qualifiers.regions.length > 0;
  const rankingOrigin = downtownApplied
    ? FREDERICK_CENTER
    : context.origin ?? null;
  const municipality = regionalScope ? null : downtownApplied ? "frederick" : context.municipality;
  const downtownRadiusMeters = 1_600;
  const effectiveQuery = qualifiers.cleanedQuery;
  // Location language alone must not turn an event-intent query into a
  // place-only search. "Live music near me" should still return concerts;
  // the origin may rank genuine venue places without suppressing events.
  const preserveMixedEventResults = Boolean(
    detectEventIntent(query) && !qualifiers.categoryKey && !qualifiers.openNow,
  );
  const includeMatchingPlaces = qualifiers.compoundIntent
    ? true
    : qualifiers.categoryKey
    ? qualifiers.includeAllCategoryMatches || regionalScope || effectiveQuery.length === 0
    : qualifiers.openNow ||
      (qualifiers.nearMe && !preserveMixedEventResults) ||
      effectiveQuery.length === 0;
  // Pull a wider candidate set for multi-region requests, then interleave the
  // requested regions. Otherwise a data-rich town can consume the result cap
  // before a smaller town gets a fair chance to appear.
  const candidateLimit = regionalScope && qualifiers.regions.length > 1 ? Math.max(limit * 4, 60) : limit;
  const candidates = search(effectiveQuery, candidateLimit, eventPool, {
    onlyPlaces: !preserveMixedEventResults,
    includeMatchingPlaces,
    origin: rankingOrigin,
    rankPlacesByDistance: Boolean(rankingOrigin),
    rankEventsByDistance: Boolean(rankingOrigin),
    eventMunicipality: municipality,
    eventFilter: regionalScope
      ? (event) => municipalityMatchesRegions(event.municipality, qualifiers.regions)
      : undefined,
    placeFilter: (place) =>
      matchesSearchQualifiers(place, qualifiers, municipality) &&
      (!downtownApplied || haversineMeters(FREDERICK_CENTER, place.geom) <= downtownRadiusMeters),
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
        : downtownApplied
          ? "Downtown Frederick"
          : context.contextLabel ?? null,
      nearMeApplied: nearMeApplied || downtownApplied,
      fallbackReason: context.fallbackReason ?? null,
    },
  };
}
