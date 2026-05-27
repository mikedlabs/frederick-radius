/**
 * now-picks.ts
 *
 * Cached helpers behind RightNowStrip. The whole point: stop ranking
 * 1,725 places on every /now request.
 *
 * The expensive call is rankPlaces({ origin, now, preferOpen }), which
 * walks every public place and computes a score that includes the
 * place's current open_status. Open_status depends on `now`, so a
 * naive cache key of "the request time" would never hit.
 *
 * The strategy: bucket `now` to a 10-minute slot key and use that as
 * the cache key. A place that closes at 5:00 PM may read as "open"
 * for up to ten extra minutes after closing, which is well inside
 * the noise of any real "is it open?" answer and lets the cache hit
 * across all requests inside that bucket.
 *
 * Each call is tagged with "now-picks" and "places" so an admin
 * write (closure, refresh) can invalidate everything with
 * revalidateTag("places"). The "now-picks" tag exists as a finer
 * handle if a future flow only wants to nudge the home page picks
 * without touching every place detail page.
 *
 * Uses unstable_cache (still supported in Next 16 alongside the
 * Cache Components migration that will land in a follow-up PR).
 * unstable_cache works without enabling cacheComponents globally,
 * so this surface ships without forcing the rest of the app to
 * migrate at the same time.
 */
import { unstable_cache, revalidateTag } from "next/cache";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";

export type Daypart = "morning" | "midday" | "evening";

const DAYTIME_OUTDOOR_CATS = new Set(["park", "trail", "outdoors", "playground", "market"]);
const DAYTIME_MIXED_CATS = new Set([
  "coffee", "bakery", "restaurant", "park", "trail", "museum", "gallery",
  "market", "outdoors",
]);
const EVENING_OUT_CATS = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "music", "theater", "gallery", "museum",
]);
const WEEKEND_BET_CATS = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "music", "theater", "gallery", "museum", "market",
  "park", "trail", "outdoors", "playground",
]);

function openNowCats(daypart: Daypart): Set<string> {
  if (daypart === "morning") return DAYTIME_MIXED_CATS;
  if (daypart === "midday") return DAYTIME_OUTDOOR_CATS;
  return EVENING_OUT_CATS;
}

/**
 * Eastern-time daypart bucket. Three zones tuned to the candidate
 * categories above: morning (coffee + bakery + parks), midday (parks
 * + trails + markets), evening (dinner + drinks + culture).
 */
export function dayPartOf(d: Date): Daypart {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d),
    10,
  ) % 24;
  if (hour < 10) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

/**
 * "YYYY-MM-DDTHHmm" Eastern, rounded down to the nearest 10 minutes.
 * The bucket key for the open-status cache. Cheap, stable, and gives
 * us a fresh re-rank every ten minutes without paying the ranking
 * cost on every request inside the bucket.
 */
export function tenMinBucket(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const minute = Math.floor(Number(map.minute) / 10) * 10;
  return `${map.year}-${map.month}-${map.day}T${map.hour}${String(minute).padStart(2, "0")}`;
}

/**
 * Eastern YYYY-MM-DD for the daily rotation seed.
 */
export function easternDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/**
 * Reconstruct a Date inside the bucket so rankPlaces gets a
 * deterministic value when computing open_status. The minute-level
 * resolution is fine for the open/closed read: any place that closes
 * at xx:00 may show open for up to ten extra minutes, which is below
 * the noise floor of "is this open right now?" anyway.
 */
function bucketToDate(bucket: string): Date {
  const year = Number(bucket.slice(0, 4));
  const month = Number(bucket.slice(5, 7));
  const day = Number(bucket.slice(8, 10));
  const hour = Number(bucket.slice(11, 13));
  const min = Number(bucket.slice(13, 15));
  // The bucket is Eastern wall time; we need a real Date. Build a
  // candidate UTC date and shift it by Eastern's offset for that
  // moment. The offset can be -4 or -5 hours depending on DST.
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, min, 0));
  const easternHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(candidate),
    10,
  ) % 24;
  const drift = (hour - easternHour + 24) % 24;
  return new Date(Date.UTC(year, month - 1, day, hour + drift, min, 0));
}

/**
 * Open-now candidates for the RightNowStrip card. The "open right
 * now" filter and the rating floor are applied here so the cached
 * result is the ready-to-rotate list. The final pick (the one we
 * actually render) is chosen by daily rotation at the call site.
 *
 * Cache key: (daypart, bucket, originKey). Returns the top filtered
 * places. Tags: "now-picks" + "places" so a place-set update or a
 * closure write invalidates the cache.
 */
export const getOpenNowCandidates = unstable_cache(
  async (
    daypart: Daypart,
    bucket: string,
    originKey: string,
  ): Promise<PlaceCardData[]> => {
    void originKey;
    const origin: LngLat = FREDERICK_CENTER;
    const now = bucketToDate(bucket);
    const ranked = rankPlaces({ origin, now, preferOpen: true, limit: 80 });
    const cats = openNowCats(daypart);
    return ranked.filter(
      (p) =>
        p.open_status.state === "open" &&
        cats.has(p.category) &&
        (p.google_rating ?? 0) >= 4.0,
    );
  },
  // Deployment hash in the key so a build that updates the place
  // loader (e.g. new Blob photo URLs) busts the cache. Without it,
  // the 10-minute revalidate window holds stale URLs even after a
  // deploy that should have changed them.
  ["right-now-strip:open-now", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  // Revalidate every 10 minutes (matches the bucket granularity).
  // Tagged so an admin write triggers an early flip.
  { revalidate: 600, tags: ["now-picks", "places"] },
);

/**
 * Weekend bet candidates: broader set including parks and trails,
 * photo and rating floor applied. Bucketed to the day, not the
 * 10-minute slot, because the "weekend bet" pick does not depend on
 * the current minute, and a daily key gives us cleaner cache hits.
 */
export const getWeekendBetCandidates = unstable_cache(
  async (
    dayKey: string,
    originKey: string,
  ): Promise<PlaceCardData[]> => {
    void originKey;
    const origin: LngLat = FREDERICK_CENTER;
    const now = bucketToDate(`${dayKey}T1200`);
    const ranked = rankPlaces({ origin, now, limit: 200 });
    return ranked.filter(
      (p) =>
        Boolean(p.google_photo_url) &&
        WEEKEND_BET_CATS.has(p.category) &&
        (p.google_rating ?? 0) >= 4.4 &&
        p.open_status.state !== "closed",
    );
  },
  // Deployment hash in the key — same reason as getOpenNowCandidates.
  ["right-now-strip:weekend-bet", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  // Day-scoped cache; one warm-up per day per origin.
  { revalidate: 3600, tags: ["now-picks", "places"] },
);

/**
 * Re-export revalidateTag here so an admin route or cron can call
 * `revalidateNowPicks()` without learning the tag names. Keeps the
 * cache boundary's invalidation surface in one place.
 *
 * Uses the Next 16 two-argument form. "max" gives stale-while-
 * revalidate semantics so the home page does not stall on the
 * blocking revalidate path that the deprecated single-arg form
 * triggers.
 */
export function revalidateNowPicks(): void {
  revalidateTag("now-picks", "max");
}
