/**
 * find-picks.ts
 *
 * Cached loader behind /find — the "Find somewhere good" surface, the
 * visitor's answer to "I'm hungry, downtown, where would a local send
 * me?" The whole point, like now-picks.ts: never re-rank 1,700 places
 * on every request.
 *
 * Wraps getCuratedPicks (the blended four-signal visitor ranking:
 * ratings + local-favorite + closest/open + moment-fit). Open status
 * depends on `now`, so the cache key buckets `now` to a 10-minute slot
 * — a place that just closed may read open for up to ten extra minutes,
 * well inside the noise of any "is it open?" answer, and the bucket lets
 * the cache hit across every request inside it.
 *
 * Tagged "find-picks" + "places" so an admin closure/refresh write
 * (revalidateTag("places")) flushes it alongside the rest of the place
 * surfaces. unstable_cache is still supported in Next 16 and works
 * without enabling cacheComponents globally — same posture as now-picks.
 */
import { unstable_cache } from "next/cache";
import { getCuratedPicks, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import { tenMinBucket } from "@/lib/now-picks";

/**
 * The craving filters offered on /find. Each maps to the place
 * categories that satisfy it. `all` is the unscoped food-&-drink set —
 * a visitor who taps "Find somewhere good" without narrowing still gets
 * eat/drink places, never the civic firehose.
 */
export const FIND_FILTERS = {
  all: ["restaurant", "bar", "brewery", "winery", "coffee", "bakery", "pizza", "cafe"],
  dinner: ["restaurant", "pizza"],
  drinks: ["bar", "brewery", "winery"],
  coffee: ["coffee", "cafe", "bakery"],
  sweet: ["bakery", "dessert", "ice-cream"],
} as const;

export type FindFilter = keyof typeof FIND_FILTERS;

export function isFindFilter(v: string | undefined): v is FindFilter {
  return v !== undefined && v in FIND_FILTERS;
}

/**
 * The curated short-list for a craving. Ranked by the visitor blend,
 * open-or-closing-soon, scoped to the filter's food/drink categories,
 * capped short (a stranger wants the best few, not a directory).
 *
 * Cache key: (filter, bucket). FREDERICK_CENTER is the origin — the
 * downtown anchor a visitor is most often standing near; a future pass
 * can thread the device location through a non-cached variant.
 */
export const getFindPicks = unstable_cache(
  async (filter: FindFilter, bucket: string): Promise<PlaceCardData[]> => {
    void bucket; // part of the cache key; the time is reconstructed below
    const cats = new Set<string>(FIND_FILTERS[filter]);
    // Pull a generous ranked set, then keep only the craving's
    // categories. getCuratedPicks already forces preferOpen + the
    // visitor profile, so this list is open-now, blended, and trustworthy.
    return getCuratedPicks({ origin: FREDERICK_CENTER, limit: 200 })
      .filter((p) => cats.has(p.category) || (p.subcategories ?? []).some((s) => cats.has(s)))
      .slice(0, 12);
  },
  ["find-picks", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  // 10-minute revalidate matches the bucket granularity; tagged so an
  // admin write flips it early.
  { revalidate: 600, tags: ["find-picks", "places"] },
);

/** Today's bucket key for the current request. */
export function findBucket(now: Date = new Date()): string {
  return tenMinBucket(now);
}

// (getOpenNowCount / getOpenNowLead were removed on 2026-06-15 when the
//  /today open-now answer card was retired — they had no other consumer.
//  getFindPicks below still powers the craving short-lists on /find.)
