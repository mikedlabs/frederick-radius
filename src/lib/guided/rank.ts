import { recommendationTier } from "@/lib/quality/readiness";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * The Track 1 → Track 2 bridge. The audit scores every place into a
 * recommendation tier; guided results consume that same gate so the UI never
 * has to re-derive "is this safe to show". Pure, memo-friendly helpers.
 */

/**
 * Drop places that should never surface in a guided result — Tier 4 is the
 * audit's hide/archive bucket (stale, broken, duplicate, or a non-discoverable
 * type like lawn care). Tiers 1–3 stay; ordering handles the rest.
 */
export function gateRecommendable<T extends PlaceCardData>(places: T[]): T[] {
  return places.filter((p) => recommendationTier(p).tier <= 3);
}

/**
 * Readiness tier as a ranking key (1 = best). Used as the PRIMARY sort term in
 * "best" mode so a Tier-1 pick always leads a Tier-3 B2B leak, with the
 * existing relevance blend settling order within a tier.
 */
export function tierRank(p: PlaceCardData): number {
  return recommendationTier(p).tier;
}
