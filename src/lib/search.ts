import type { Place } from "@/data/places";
// Slim, client-safe set (same canonical public places, pre-decorated
// at build) so this shared search core never drags the ~12MB
// places-enrichment.json into the SearchOverlay client bundle.
import { clientPlaces } from "@/lib/loaders/places-client";
import { EVENTS, type Event } from "@/data/events";
import { MUNICIPALITIES, type Municipality } from "@/data/municipalities";
import { CATEGORIES, type Category } from "@/data/categories";

export type SearchHit =
  | { type: "place"; place: Place; score: number }
  | { type: "event"; event: Event; score: number }
  | { type: "municipality"; municipality: Municipality; score: number }
  | { type: "category"; category: Category; score: number };

const STOP = new Set(["the", "a", "an", "in", "of", "and", "or", "to", "at"]);

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
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

export function search(query: string, limit = 30): SearchHit[] {
  const terms = normalize(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  const intent = detectIntent(query);

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
    if (s > 0 || iv > 0) hits.push({ type: "place", place: p, score: s + p.feature_score + iv });
  }

  for (const e of EVENTS) {
    const s =
      fieldScore(e.title, terms) * 4 +
      fieldScore(e.description, terms) * 1 +
      fieldScore(e.venue_name, terms) * 2 +
      fieldScore(e.category, terms) * 2;
    if (s > 0) hits.push({ type: "event", event: e, score: s });
  }

  for (const m of MUNICIPALITIES) {
    const s = fieldScore(m.name, terms) * 5 + fieldScore(m.description, terms) * 1;
    if (s > 0) hits.push({ type: "municipality", municipality: m, score: s });
  }

  for (const c of CATEGORIES) {
    const s = fieldScore(c.name, terms) * 3 + fieldScore(c.blurb, terms) * 1;
    if (s > 0) hits.push({ type: "category", category: c, score: s });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
