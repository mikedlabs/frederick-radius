/**
 * worth-a-look.ts
 *
 * Cached helper behind the "Worth a look today" rail on /now —
 * the page's only photo-led discovery surface. Six photo-backed,
 * high-feature-score places rotated by day so a returning visitor
 * sees a fresh six tomorrow.
 *
 * Why a separate cached helper instead of reusing rankPlaces directly:
 * we want a STABLE pick per day, not "the top 6 by feature score
 * which never moves." The rotation is the whole point — without it
 * the rail becomes wallpaper that the eye stops registering.
 *
 * The cache key is the day (Eastern). Each day generates one set of
 * six and serves it from the edge for 60 minutes (refresh-as-needed).
 */
import { unstable_cache } from "next/cache";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { isRecommendable } from "@/lib/relevance";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";

/**
 * Categories that read well as photo-led "discovery" tiles. A parking
 * deck or a county permits office is a real place but not what
 * "Worth a look today" should surface.
 */
const PHOTOGENIC: ReadonlySet<string> = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "park", "trail", "outdoors", "playground",
  "museum", "gallery", "theater", "music", "public-art",
  "market", "lodging", "family", "winery",
]);

/** Eastern-time YYYY-MM-DD — the rotation key. */
export function easternDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Pull the rotating six. Deterministic per day: same six all day,
 * different six tomorrow. The pool is filtered to photo-backed,
 * photogenic-category places that are operational; sort by feature
 * score so the pool stays high-quality regardless of day.
 *
 * Rotation algorithm:
 *   1. Sort the eligible pool by feature_score desc.
 *   2. Take top N (default 60) — the "discovery surface" pool.
 *   3. Compute a day-of-year offset and rotate the pool by that.
 *   4. Take the first six. They become today's rail.
 *
 * Effect: a stranger sees a high-quality six. The same stranger
 * tomorrow sees a different high-quality six. Over 10 days they've
 * been shown 60 different places — meaningful breadth without any
 * tile feeling random.
 */
export const getWorthALookToday = unstable_cache(
  async (dayKey: string): Promise<PlaceCardData[]> => {
    const origin: LngLat = FREDERICK_CENTER;
    // Pull a generous ranked set so the filter has room to work.
    const ranked = rankPlaces({ origin, limit: 400 });
    const eligible = ranked.filter(
      (p) =>
        isRecommendable(p) &&
        Boolean(p.google_photo_url) &&
        PHOTOGENIC.has(p.category) &&
        p.open_status?.state !== "closed",
    );
    if (eligible.length === 0) return [];

    // Pool: top 60 by feature score, so the rail stays curated even
    // as the rotation cycles.
    const pool = eligible.slice(0, Math.min(60, eligible.length));

    // Deterministic per-day offset. Parse YYYY-MM-DD to a day index
    // (days since epoch) so the rotation actually advances by one
    // each day, not by some scrambled hash.
    const [y, m, d] = dayKey.split("-").map(Number);
    const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
    const start = ((dayIndex % pool.length) + pool.length) % pool.length;

    // Take six, wrapping the pool. Stride > 1 so consecutive days
    // don't share five out of six picks — gives a more varied
    // day-to-day read.
    const STRIDE = 7;
    return Array.from({ length: 6 }, (_, i) => pool[(start + i * STRIDE) % pool.length]);
  },
  // Cache key includes the current deployment hash so any data
  // change (e.g. places-photos.json gaining downloaded Blob URLs)
  // busts the cache automatically on deploy. Without this, the
  // 60-minute revalidate window holds the OLD URLs even after a
  // build that should have switched the loader to Blob — which is
  // exactly what happened when this fix's PR was merged but /now
  // kept serving slow proxy URLs.
  // VERCEL_GIT_COMMIT_SHA is set on every Vercel build; falls back
  // to "dev" locally so the dev server still caches normally.
  ["worth-a-look:today", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  // 60-minute revalidate — well under the daily rotation but cheap
  // enough that an admin write to places-client.json shows up fast.
  { revalidate: 3600, tags: ["worth-a-look", "places"] },
);
