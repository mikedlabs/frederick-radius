/**
 * Flat search adapter for the command palette (SearchOverlay).
 *
 * P0-7: there is now ONE search implementation — `src/lib/search.ts`,
 * which ranks the single canonical public set (publicPlaces) plus
 * events, municipalities, and categories. This module no longer holds a
 * second index or scoring pass; it only maps those ranked hits to flat
 * nav items (title / subtitle / href) for the overlay. The
 * `place:`/`event:` id prefixes stay stable so SearchOverlay's trust
 * resolver keeps working.
 */

import { search, type SearchHit } from "@/lib/search";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export type SearchResultType = "place" | "event" | "category" | "municipality";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Compact category/municipality hint for badges. */
  badge?: string;
};

function hitToResult(h: SearchHit): SearchResult {
  if (h.type === "place") {
    const p = h.place;
    const cat = CATEGORY_BY_SLUG[p.category];
    const muni = MUNICIPALITY_BY_SLUG[p.municipality];
    return {
      type: "place",
      id: `place:${p.slug}`,
      title: p.name,
      subtitle: `${cat?.name ?? p.category} · ${muni?.name ?? p.municipality}`,
      href: `/places/${p.slug}`,
      badge: cat?.name,
    };
  }
  if (h.type === "event") {
    const e = h.event;
    return {
      type: "event",
      id: `event:${e.slug}`,
      title: e.title,
      subtitle: `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`,
      href: `/events/${e.slug}`,
      badge: e.category,
    };
  }
  if (h.type === "category") {
    const c = h.category;
    return {
      type: "category",
      id: `category:${c.slug}`,
      title: c.name,
      subtitle: c.blurb ?? "Browse this category",
      href: `/category/${c.slug}`,
    };
  }
  const m = h.municipality;
  return {
    type: "municipality",
    id: `municipality:${m.slug}`,
    title: m.name,
    subtitle: m.hero_blurb ?? `${m.type ?? "Municipality"} · pop. ${m.population?.toLocaleString() ?? "?"}`,
    href: `/m/${m.slug}`,
  };
}

export function searchIndex(query: string, limit = 12): SearchResult[] {
  return search(query, limit).map(hitToResult);
}
