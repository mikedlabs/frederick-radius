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

export function search(query: string, limit = 30): SearchHit[] {
  const terms = normalize(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const p of clientPlaces()) {
    const s =
      fieldScore(p.name, terms) * 4 +
      fieldScore(p.short_blurb, terms) * 1 +
      fieldScore(p.description ?? "", terms) * 1 +
      fieldScore(p.category, terms) * 2 +
      fieldScore(p.city, terms) * 1 +
      (p.tags ?? []).reduce((acc, t) => acc + fieldScore(t, terms), 0);
    if (s > 0) hits.push({ type: "place", place: p, score: s + p.feature_score });
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
