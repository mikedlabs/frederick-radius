import { MUNICIPALITIES } from "@/data/municipalities";
import { publicPlacesByMunicipality, decoratePlace } from "@/lib/loaders/places";
import { recommendationTier } from "@/lib/quality/readiness";

/**
 * Per-town summary for the town picker — "choose a starting point". Counts are
 * REAL: places are gated on the audit's readiness tier (Tier 1–2, what's worth
 * showing), and event counts cover the next seven days, so a quiet town reads
 * honestly (0) instead of a faked number.
 */
export type TownStat = {
  slug: string;
  name: string;
  fact: string;
  placeCount: number;
  eventCount: number;
  bestFor: string[];
};

// Category slug → evocative "best for" group. Only the common ones; anything
// unmapped simply doesn't contribute a tag.
const GROUP: Record<string, string> = {
  coffee: "Coffee",
  restaurant: "Food", bakery: "Food", "food-truck": "Food",
  brewery: "Drinks", winery: "Drinks", bar: "Drinks", distillery: "Drinks",
  park: "Outdoors", trail: "Outdoors", playground: "Outdoors", garden: "Outdoors",
  museum: "Arts", gallery: "Arts", theater: "Arts", "live-music": "Arts",
  shopping: "Shops", antiques: "Shops", market: "Shops", "book-store": "Shops", boutique: "Shops",
  spa: "Wellness", gym: "Wellness", yoga: "Wellness",
};

function bestForTags(places: { category?: string }[], n = 2): string[] {
  const tally = new Map<string, number>();
  for (const p of places) {
    const g = p.category ? GROUP[p.category] : undefined;
    if (g) tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

/**
 * Pure + sync: the place counts/curation are local data, but the next-seven-day
 * PUBLIC event count per municipality is passed IN (the caller fetches it
 * from the cached unified-event loader) so this stays testable and free of a
 * request-scoped cache. Default `{}` → all zero (a quiet town reads 0).
 */
export function townStats(eventCounts: Record<string, number> = {}): TownStat[] {
  return MUNICIPALITIES.map((m) => {
    const places = publicPlacesByMunicipality(m.slug)
      .map((p) => decoratePlace(p))
      .filter((p) => recommendationTier(p).tier <= 2);
    const eventCount = eventCounts[m.slug] ?? 0;
    return {
      slug: m.slug,
      name: m.name,
      fact: m.fact,
      placeCount: places.length,
      eventCount,
      bestFor: bestForTags(places),
    };
  }).sort((a, b) => b.placeCount - a.placeCount);
}
