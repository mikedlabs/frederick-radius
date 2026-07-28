/**
 * Context-aware category ranking — the coffee pattern (Pass 3).
 *
 * The category page used to sort by `feature_score*0.4 + proximity*0.3 +
 * open*0.3`, but feature_score is 0–10 while proximity/open cap at 0.3, so
 * proximity was ~6% of the score: "Ranked from {town}" was cosmetic — a
 * Brunswick user saw the same 10 downtown coffee shops as everyone else
 * (measured: top-10 identical across all six origins). This module is the
 * fix: one balanced, normalized score where quality AND context actually
 * both move the result, proven to put a town's own coffee at the top for
 * that town's users WITHOUT becoming a nearest-wins sort.
 *
 * Pure + unit-tested (tests/category-ranking.spec.ts). The reusable
 * context-aware layout currently applies it to Coffee.
 */
import type { PlaceCardData } from "@/lib/loaders/places";
import { isOpenNow, type OpenStatus } from "@/lib/hours";

/** Brand chains we soft-demote in Best matches so local shops lead (kept,
 *  never hidden). */
const CHAIN_RE =
  /\b(starbucks|dunkin'?|dutch bros|wawa|sheetz|peet'?s|tim hortons|mcdonald'?s|7-?eleven)\b/i;
/** Tea/boba/tearoom records living under the broad "coffee" category —
 *  legitimate, but demoted from Best matches so they don't dominate. */
const LOOSE_RE = /\b(tea ?rooms?|tea house|boba|bubble tea|emporium)\b/i;

export function isChainName(name: string): boolean {
  return CHAIN_RE.test(name);
}
export function isLooseCategory(name: string): boolean {
  return LOOSE_RE.test(name);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Bayesian rating signal — a 5.0 with three reviews must not outrank a 4.6
// with hundreds. Mirrors the loader's prior so the two never disagree.
const RATING_PRIOR_MEAN = 4.0;
const RATING_PRIOR_WEIGHT = 30;
export function ratingSignal(rating?: number, count?: number): number {
  if (rating === undefined) return 0.5;
  const n = count ?? 0;
  const bayes = (n * rating + RATING_PRIOR_WEIGHT * RATING_PRIOR_MEAN) / (n + RATING_PRIOR_WEIGHT);
  return clamp01((bayes - 3) / 2);
}

function openSignal(status: OpenStatus): number {
  return status.state === "open"
    ? 1
    : status.state === "closing-soon"
      ? 0.6
      : status.state === "unknown"
        ? 0.5
        : 0;
}

// Continuous proximity decay (≈0.5 at 3 km) — real resolution, unlike the
// loader's coarse 5-step function where two shops a block apart scored the
// same. Undefined distance → neutral 0.4.
export function proximitySignal(distance_m?: number): number {
  if (distance_m === undefined) return 0.4;
  return 1 / (1 + distance_m / 3000);
}

export type CategoryRankContext = {
  /** The user's known municipality slug, or null when unknown. Drives the
   *  same-town nudge; null = no nudge (the honest downtown default). */
  town?: string | null;
  /** Category being ranked. Category-specific soft penalties must never leak
   * into unrelated guides (for example, a tea room is only a loose match on
   * the Coffee page, not on Restaurants or Bakeries). */
  category?: string | null;
};

/**
 * The balanced, context-aware category score. Quality (rating + curation)
 * and context (proximity + same-town) are weighted together, with soft
 * penalties for chains and loose-category records. same-town is
 * deliberately SMALL (0.08) so a thin local record surfaces but never
 * outranks clearly stronger coffee just for being in-town — Nearby and
 * Across-the-county sections carry the local-visibility job. Verified by
 * the origin comparison: Downtown stays strong-downtown; Brunswick /
 * Thurmont / Middletown / Walkersville lead with their own towns.
 */
export function categoryScore(p: PlaceCardData, ctx: CategoryRankContext = {}): number {
  const rating = ratingSignal(p.google_rating, p.google_rating_count);
  const curation = clamp01((p.feature_score ?? 0) / 10 + (p.local_favorite ? 0.15 : 0));
  const proximity = proximitySignal(p.distance_m);
  const open = openSignal(p.open_status);
  const sameTown = ctx.town && p.municipality === ctx.town ? 1 : 0;
  const trust = p.is_verified || p.hours_verified ? 1 : 0;

  let s =
    0.24 * rating +
    0.22 * curation +
    0.22 * proximity +
    0.12 * open +
    0.08 * sameTown +
    0.04 * trust;

  if (isChainName(p.name)) s -= 0.1;
  if (ctx.category === "coffee" && isLooseCategory(p.name)) s -= 0.06;
  return s;
}

/** Top-N by the balanced score (Best matches). */
export function bestMatches(
  places: PlaceCardData[],
  ctx: CategoryRankContext = {},
  limit = 6,
): PlaceCardData[] {
  return [...places]
    .sort((a, b) => categoryScore(b, ctx) - categoryScore(a, ctx))
    .slice(0, limit);
}

/** Open-now subset, nearest first. */
export function openNowOf(places: PlaceCardData[]): PlaceCardData[] {
  return [...places]
    .filter((p) => isOpenNow(p.open_status))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}

/** Local-favorite subset, by balanced score. */
export function localFavoritesOf(
  places: PlaceCardData[],
  ctx: CategoryRankContext = {},
): PlaceCardData[] {
  return [...places]
    .filter((p) => p.local_favorite)
    .sort((a, b) => categoryScore(b, ctx) - categoryScore(a, ctx));
}

/** Nearest first. Places are already distance-decorated from the page
 *  origin, so this sorts by that. */
export function nearestFrom(places: PlaceCardData[]): PlaceCardData[] {
  return [...places].sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}

export type CuratedStack = {
  best: PlaceCardData[];
  openNow: PlaceCardData[];
  favs: PlaceCardData[];
  nearby: PlaceCardData[];
};

/**
 * The curated stack with PROGRESSIVE dedupe. "Best matches", "Open now",
 * "Local favorites", and "Nearby" overlap heavily — a strong local café is
 * open AND loved AND close — so a place used to appear three or four times
 * on one long page, which read like padding.
 *
 * Each section now shows a place only if no EARLIER section already did, so
 * a place lands once, in the highest-value section it qualifies for (Best →
 * Open now → Local favorites → Nearby). This only de-duplicates the curated
 * stack; the place is never removed from the PAGE — "Across the county" and
 * "Full browse" remain the complete browsing tail. Sections degrade
 * gracefully: if dedupe empties a later one, it simply renders fewer (or its
 * caller hides it), it never back-fills with a place already shown above.
 *
 * Pure given its inputs (the section selectors are pure); unit-tested.
 */
export function selectCuratedStack(
  rec: PlaceCardData[],
  ctx: CategoryRankContext = {},
  opts: { bestN?: number; sectionN?: number } = {},
): CuratedStack {
  const bestN = opts.bestN ?? 3;
  const sectionN = opts.sectionN ?? 6;
  const best = bestMatches(rec, ctx, bestN);
  const shown = new Set(best.map((p) => p.slug));
  const take = (list: PlaceCardData[]): PlaceCardData[] => {
    const picked = list.filter((p) => !shown.has(p.slug)).slice(0, sectionN);
    for (const p of picked) shown.add(p.slug);
    return picked;
  };
  // Order is the priority order — each take() consumes from the same
  // `shown` set the earlier ones grew.
  const openNow = take(openNowOf(rec));
  const favs = take(localFavoritesOf(rec, ctx));
  const nearby = take(nearestFrom(rec));
  return { best, openNow, favs, nearby };
}

export type MunicipalityGroup = { municipality: string; places: PlaceCardData[] };

/**
 * Group by municipality (each group's places by balanced score, groups
 * ordered by their strongest place) so "Across the county" can make every
 * town visible without becoming a second giant list.
 */
export function groupByMunicipality(
  places: PlaceCardData[],
  ctx: CategoryRankContext = {},
): MunicipalityGroup[] {
  const m = new Map<string, PlaceCardData[]>();
  for (const p of places) {
    const arr = m.get(p.municipality) ?? [];
    arr.push(p);
    m.set(p.municipality, arr);
  }
  const groups = [...m.entries()].map(([municipality, list]) => ({
    municipality,
    places: list.sort((a, b) => categoryScore(b, ctx) - categoryScore(a, ctx)),
  }));
  groups.sort((a, b) => categoryScore(b.places[0], ctx) - categoryScore(a.places[0], ctx));
  return groups;
}

/** Short, human reasons a place is a Best match — for the card caption. */
export function bestMatchReasons(p: PlaceCardData, ctx: CategoryRankContext = {}): string[] {
  const r: string[] = [];
  if (ctx.town && p.municipality === ctx.town) r.push("in your town");
  if (p.local_favorite) r.push("local favorite");
  if (p.google_rating && (p.google_rating_count ?? 0) >= 25) r.push(`${p.google_rating.toFixed(1)}★`);
  if (isOpenNow(p.open_status)) r.push("open now");
  return r.slice(0, 3);
}
