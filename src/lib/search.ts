import type { Place } from "@/data/places";
// Slim, client-safe set (same canonical public places, pre-decorated
// at build) so this shared search core never drags the ~12MB
// places-enrichment.json into the SearchOverlay client bundle.
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { fuzzyNameScore, FUZZY_THRESHOLD } from "@/lib/search/fuzzy";
import { EVENTS, type Event } from "@/data/events";
import { MUNICIPALITIES, type Municipality } from "@/data/municipalities";
import { CATEGORIES, type Category } from "@/data/categories";
import { isUpcomingEvent } from "@/lib/events/visible";

export type SearchHit =
  | { type: "place"; place: Place; score: number }
  | { type: "event"; event: Event; score: number }
  | { type: "municipality"; municipality: Municipality; score: number }
  | { type: "category"; category: Category; score: number };

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
]);

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    // Drop stop words and single-character tokens: a lone "i"/"a" prefix- or
    // substring-matches almost every place name and drowns the real keyword.
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function fieldScore(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    if (lower === t) score += 3;
    else if (lower.startsWith(t)) score += 2;
    else if (lower.includes(t)) score += 1;
  }
  return score;
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
};

const INTENTS: Intent[] = [
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
  /** event.category values that strongly answer this intent. */
  eventCats: Set<string>;
  /** an event qualifies for the boost if its text reads on-topic. */
  topicalRx: RegExp;
  /** place categories that are genuine venues for this intent. */
  venueCats: Set<string>;
};

const EVENT_INTENTS: EventIntent[] = [
  {
    triggers: ["live music", "music", "concert", "concerts", "karaoke", "open mic", "open-mic"],
    eventCats: new Set(["music"]),
    topicalRx: /\b(music|concert|band|live|dj|karaoke|jazz|acoustic|open[- ]mic|singer|songwriter|orchestra|symphony|blues|bluegrass)\b/i,
    venueCats: new Set(["bar", "brewery", "theater", "music", "arts"]),
  },
];

function detectEventIntent(query: string): EventIntent | null {
  const q = ` ${query.toLowerCase()} `;
  const lower = query.toLowerCase();
  for (const intent of EVENT_INTENTS) {
    if (intent.triggers.some((t) => q.includes(` ${t} `) || lower.includes(t))) return intent;
  }
  return null;
}

/** Does this event read as on-topic for the event intent? */
function eventMatchesIntent(e: Event, intent: EventIntent): boolean {
  return (
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
export function search(query: string, limit = 30, eventPool: readonly Event[] = EVENTS): SearchHit[] {
  const terms = normalize(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  const intent = detectIntent(query);
  const eventIntent = detectEventIntent(query);
  const now = new Date();

  for (const p of clientPlaces()) {
    const s =
      fieldScore(p.name, terms) * 4 +
      fieldScore(p.short_blurb, terms) * 1 +
      fieldScore(p.description ?? "", terms) * 1 +
      fieldScore(p.category, terms) * 2 +
      fieldScore(p.city, terms) * 1 +
      (p.tags ?? []).reduce((acc, t) => acc + fieldScore(t, terms), 0);
    // Intent can SURFACE a relevant place with no keyword match (boost),
    // and SINK a mismatch that only caught a stray token (downrank).
    const iv = intent ? intentScore(p.category, p.tags ?? [], p.name, intent) : 0;
    // Event intent ("live music"): genuine venues stay in play, but a
    // place whose only claim was an incidental name token (the candle
    // shop "Liveyoung") steps aside for the actual events below.
    const ev = eventIntent ? (eventIntent.venueCats.has(p.category) ? 2 : -6) : 0;
    if (s > 0 || iv > 0) hits.push({ type: "place", place: p, score: s + p.feature_score + iv + ev });
  }

  for (const e of eventPool) {
    const s =
      fieldScore(e.title, terms) * 4 +
      fieldScore(e.description, terms) * 1 +
      fieldScore(e.venue_name, terms) * 2 +
      fieldScore(e.category, terms) * 2;
    // For an event intent, an on-topic upcoming event leads (soonest
    // first); a past one is sunk. Lets a music show with no literal
    // term match still surface above places for "live music".
    const ev = eventIntent ? eventIntentScore(e, eventIntent, now) : 0;
    if (s > 0 || ev > 0) hits.push({ type: "event", event: e, score: s + ev });
  }

  for (const m of MUNICIPALITIES) {
    const s = fieldScore(m.name, terms) * 5 + fieldScore(m.description, terms) * 1;
    if (s > 0) hits.push({ type: "municipality", municipality: m, score: s });
  }

  for (const c of CATEGORIES) {
    const s = fieldScore(c.name, terms) * 3 + fieldScore(c.blurb, terms) * 1;
    if (s > 0) hits.push({ type: "category", category: c, score: s });
  }

  // The typo net — fallback only. When exact/substring ranking strands the
  // query with zero place hits ("brewrey", "carrol creek"), the closest
  // trigram matches step in with modest scores so quick actions and real
  // keyword hits still lead. Same math as pg_trgm, run over the in-memory
  // sets (a DB round-trip would be strictly slower at ~1.5k names). Gated
  // at 4+ chars: shorter typos are indistinguishable from prefixes the
  // substring pass already handles.
  if (query.trim().length >= 4) {
    if (!hits.some((h) => h.type === "place")) {
      const close: { p: PlaceCardData; f: number }[] = [];
      for (const p of clientPlaces()) {
        const f = fuzzyNameScore(query, p.name);
        if (f >= FUZZY_THRESHOLD) close.push({ p, f });
      }
      close.sort((a, b) => b.f - a.f);
      for (const { p, f } of close.slice(0, 3)) {
        hits.push({ type: "place", place: p, score: f * 10 + p.feature_score });
      }
    }
    if (!hits.some((h) => h.type === "municipality")) {
      for (const m of MUNICIPALITIES) {
        const f = fuzzyNameScore(query, m.name);
        if (f >= FUZZY_THRESHOLD) hits.push({ type: "municipality", municipality: m, score: f * 12 });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
