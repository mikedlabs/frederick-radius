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
import { evaluateDecision, type DecisionReason } from "@/lib/decision/core";

/** Brand chains we soft-demote in Best matches so local shops lead (kept,
 *  never hidden). */
const CHAIN_RE =
  /\b(starbucks|dunkin'?|dutch bros|wawa|sheetz|peet'?s|tim hortons|mcdonald'?s|7-?eleven)\b/i;
/** Tea/boba/tearoom records living under the broad "coffee" category —
 *  legitimate, but demoted from Best matches so they don't dominate. */
const LOOSE_RE = /\b(tea ?rooms?|tea house|boba|bubble tea|emporium)\b/i;
const COFFEE_NON_DESTINATION_RE = /\b(?:office only|warehouse only|wholesale only)\b/i;
const DEDICATED_COFFEE_TYPES = new Set([
  "coffee_shop",
  "coffee_roastery",
]);
const CAFE_COFFEE_TYPES = new Set([
  "cafe",
  "bakery",
  "pastry_shop",
]);
const INCIDENTAL_COFFEE_TYPES = new Set([
  "asian_restaurant",
  "bistro",
  "deli",
  "food",
  "greek_restaurant",
  "restaurant",
  "tea_store",
]);
const DEDICATED_COFFEE_NAME_RE =
  /\b(coffee(?:house| shop)?|espresso|roast(?:er|ery|ing)?)\b/i;
const DEDICATED_COFFEE_BLURB_RE =
  /\b(?:coffee bar|coffee roaster(?:y)?|roaster\b|roasts? (?:its|their|coffee|beans)|house[- ]roasted|on[- ]site roaster|roasted on[- ]site|pour[- ]overs?)\b/i;
const LOOSE_COFFEE_NAME_RE = /\b(?:boba|bubble tea|tea)\b/i;

export function isChainName(name: string): boolean {
  return chainBrandKey(name) !== null;
}

/** Stable brand key for diversity rules. A chain remains eligible, but several
 * locations of the same chain should not consume one short recommendation row. */
export function chainBrandKey(name: string): string | null {
  return name.match(CHAIN_RE)?.[1]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? null;
}
export function isLooseCategory(name: string): boolean {
  return LOOSE_RE.test(name);
}

/**
 * How directly a place answers a generic coffee request.
 *
 * The imported `coffee` bucket intentionally remains broad enough to retain
 * cafés, bakeries, tea sellers, and restaurants that happen to serve coffee.
 * That is useful inventory, but it is not a useful ranking tier. A person who
 * asks only for coffee expects a coffee shop or roaster before a boba counter
 * or a restaurant with coffee on the menu. Specific boba/tea searches do not
 * use this helper, so those businesses still lead their own noun.
 */
export function coffeeIntentTier(place: {
  name: string;
  category?: string;
  primary_type?: string;
  subcategories?: string[];
  tags?: string[];
  short_blurb?: string;
}): 0 | 1 | 2 | 3 {
  const primaryType = place.primary_type?.toLowerCase() ?? "";
  const exactTypes = new Set(
    [primaryType, ...(place.subcategories ?? []), ...(place.tags ?? [])]
      .map((value) => value.toLowerCase().replace(/[ -]+/g, "_")),
  );
  if (
    isLooseCategory(place.name) ||
    (LOOSE_COFFEE_NAME_RE.test(place.name) &&
      !DEDICATED_COFFEE_NAME_RE.test(place.name)) ||
    COFFEE_NON_DESTINATION_RE.test(place.name) ||
    primaryType === "tea_store"
  ) {
    return 0;
  }
  if (
    DEDICATED_COFFEE_TYPES.has(primaryType) ||
    exactTypes.has("coffee_shop") ||
    exactTypes.has("coffeeshop") ||
    exactTypes.has("coffee_roastery") ||
    exactTypes.has("coffee")
  ) {
    return 3;
  }
  // A restaurant that says it serves coffee is still a restaurant for a
  // generic coffee decision. Primary role beats incidental blurb language.
  if (primaryType && INCIDENTAL_COFFEE_TYPES.has(primaryType)) return 1;
  if (CAFE_COFFEE_TYPES.has(primaryType)) return 2;
  if (DEDICATED_COFFEE_NAME_RE.test(place.name)) return 3;
  if (DEDICATED_COFFEE_BLURB_RE.test(place.short_blurb ?? "")) return 3;
  return place.category === "coffee" ? 2 : 1;
}

/** Signed lift used by text search. Today uses the tier itself as a stable
 * relevance bucket before distance/quality, while global search needs the
 * same judgment expressed inside its existing numeric score. */
export function coffeeIntentScore(place: Parameters<typeof coffeeIntentTier>[0]): number {
  const tier = coffeeIntentTier(place);
  const relevance = tier === 3 ? 10 : tier === 2 ? 4 : tier === 1 ? -6 : -12;
  // This score answers only whether coffee is the place's primary job.
  // Location-aware local preference is applied once, continuously, in search;
  // stacking a global chain penalty here made an exact-location chain lose to
  // businesses several blocks away.
  return relevance;
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
   *  same-town nudge; null = no geographic nudge. */
  town?: string | null;
  /** Category being ranked. Category-specific soft penalties must never leak
   * into unrelated guides (for example, a tea room is only a loose match on
   * the Coffee page, not on Restaurants or Bakeries). */
  category?: string | null;
};

function categoryDecisionFactors(
  p: PlaceCardData,
  ctx: CategoryRankContext,
) {
  const rating = ratingSignal(p.google_rating, p.google_rating_count);
  const curation = clamp01(
    (p.feature_score ?? 0) / 10 + (p.local_favorite ? 0.15 : 0),
  );
  const proximity = proximitySignal(p.distance_m);
  const open = openSignal(p.open_status);
  const sameTown = ctx.town && p.municipality === ctx.town ? 1 : 0;
  const trust = p.is_verified || p.hours_verified ? 1 : 0;
  return [
    {
      id: "reviews",
      label: "It has strong review evidence.",
      points: 0.24 * rating,
      visible: (p.google_rating_count ?? 0) >= 30,
      evidenceIds: (p.google_rating_count ?? 0) >= 30 ? ["google-places"] : [],
    },
    {
      id: "curation",
      label: "Radius has stronger local evidence for this place.",
      points: 0.22 * curation,
      visible: false,
    },
    {
      id: "proximity",
      label: "It is close to your location.",
      points: 0.22 * proximity,
      visible: p.distance_m !== undefined,
      evidenceIds: p.distance_m !== undefined ? ["decision-origin"] : [],
    },
    {
      id: "availability",
      label: "Its current hours show it open now.",
      points: 0.12 * open,
      visible: isOpenNow(p.open_status),
      evidenceIds: isOpenNow(p.open_status) ? ["verified-hours"] : [],
    },
    {
      id: "town",
      label: "It is in the area you chose.",
      points: 0.08 * sameTown,
      visible: Boolean(sameTown),
      evidenceIds: sameTown ? ["chosen-town"] : [],
    },
    {
      id: "trust",
      label: "Its listing has verified details.",
      points: 0.04 * trust,
      visible: Boolean(trust),
      evidenceIds: trust ? ["place-record"] : [],
    },
    {
      id: "chain-nudge",
      label: "A local option receives the tie-breaker.",
      points: isChainName(p.name) ? -0.1 : 0,
      visible: false,
    },
    {
      id: "category-fit",
      label: "It directly matches this category.",
      points:
        ctx.category === "coffee" && isLooseCategory(p.name) ? -0.06 : 0,
      visible: false,
    },
  ];
}

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
  return evaluateDecision(p, categoryDecisionFactors(p, ctx)).score;
}

export function categoryDecisionReasons(
  p: PlaceCardData,
  ctx: CategoryRankContext = {},
): DecisionReason[] {
  return evaluateDecision(p, categoryDecisionFactors(p, ctx)).reasons;
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
