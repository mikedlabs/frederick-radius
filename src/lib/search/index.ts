/**
 * Global search index — flattens places, events, categories, and municipalities
 * into a single searchable list. Scoring favors name prefix matches, then word
 * starts, then anywhere matches, then secondary fields (blurb, address, tags).
 *
 * Index is built once and cached in module memory (~1500 entries × ~150 bytes
 * = ~225kb, well under any reasonable budget). Re-import will rebuild if
 * underlying data changes during HMR.
 */

import { publicPlaces } from "@/lib/loaders/places";
import { EVENTS } from "@/data/events";
import { CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";

export type SearchResultType = "place" | "event" | "category" | "municipality";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Compact textual hint of category/municipality for badges */
  badge?: string;
  /** Internal: lowercased haystack used for matching */
  _haystack: string;
};

let CACHED_INDEX: SearchResult[] | null = null;

function buildIndex(): SearchResult[] {
  const idx: SearchResult[] = [];

  // Places — canonical public set (deduped, operational, enriched)
  for (const p of publicPlaces()) {
    const cat = CATEGORIES.find((c) => c.slug === p.category);
    const muni = MUNICIPALITIES.find((m) => m.slug === p.municipality);
    idx.push({
      type: "place",
      id: `place:${p.slug}`,
      title: p.name,
      subtitle: `${cat?.name ?? p.category} · ${muni?.name ?? p.municipality}`,
      href: `/places/${p.slug}`,
      badge: cat?.name,
      _haystack: `${p.name} ${p.short_blurb} ${p.address} ${cat?.name ?? ""} ${muni?.name ?? ""}`.toLowerCase(),
    });
  }

  // Events
  for (const e of EVENTS) {
    const muni = MUNICIPALITIES.find((m) => m.slug === e.municipality);
    idx.push({
      type: "event",
      id: `event:${e.slug}`,
      title: e.title,
      subtitle: `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`,
      href: `/events/${e.slug}`,
      badge: e.category,
      _haystack: `${e.title} ${e.description ?? ""} ${e.venue_name} ${e.organizer ?? ""} ${muni?.name ?? ""}`.toLowerCase(),
    });
  }

  // Categories
  for (const c of CATEGORIES) {
    idx.push({
      type: "category",
      id: `category:${c.slug}`,
      title: c.name,
      subtitle: c.blurb ?? "Browse this category",
      href: `/category/${c.slug}`,
      _haystack: `${c.name} ${c.slug} ${c.blurb ?? ""}`.toLowerCase(),
    });
  }

  // Municipalities
  for (const m of MUNICIPALITIES) {
    idx.push({
      type: "municipality",
      id: `municipality:${m.slug}`,
      title: m.name,
      subtitle: m.hero_blurb ?? `${m.type ?? "Municipality"} · pop. ${m.population?.toLocaleString() ?? "?"}`,
      href: `/m/${m.slug}`,
      _haystack: `${m.name} ${m.description ?? ""} ${m.hero_blurb ?? ""}`.toLowerCase(),
    });
  }

  return idx;
}

function getIndex(): SearchResult[] {
  if (!CACHED_INDEX) CACHED_INDEX = buildIndex();
  return CACHED_INDEX;
}

/**
 * Search and rank. Returns top N results across all types.
 * Scoring:
 *  - 100 = title starts with query
 *  - 60  = a word in title starts with query
 *  - 30  = title contains query
 *  - 10  = haystack (blurb, address, etc.) contains query
 * Multiple terms get min of per-term scores so all must match.
 */
export function searchIndex(query: string, limit = 12): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const results: Array<{ r: SearchResult; score: number }> = [];

  for (const item of getIndex()) {
    const title = item.title.toLowerCase();
    let minScore = Infinity;
    for (const term of terms) {
      let s = 0;
      if (title.startsWith(term)) s = 100;
      else if (title.split(/[\s\-·,]+/).some((w) => w.startsWith(term))) s = 60;
      else if (title.includes(term)) s = 30;
      else if (item._haystack.includes(term)) s = 10;
      if (s < minScore) minScore = s;
      if (minScore === 0) break;
    }
    if (minScore > 0 && minScore !== Infinity) {
      // Type weighting: places > events > categories > municipalities
      const typeBoost = item.type === "place" ? 5 : item.type === "event" ? 4 : item.type === "category" ? 2 : 1;
      results.push({ r: item, score: minScore + typeBoost });
    }
  }

  results.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title));
  return results.slice(0, limit).map((x) => x.r);
}
