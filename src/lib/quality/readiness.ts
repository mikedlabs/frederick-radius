import type { PlaceCardData } from "@/lib/loaders/places";
import {
  isRecommendable,
  isNonDiscoverable,
  SUPPRESSED_JUNK_SLUGS,
} from "@/lib/relevance";
import { isHiddenGem } from "@/data/hidden-gems";
import { placeQuality } from "./placeQuality";

/**
 * recommendationTier — the single readiness verdict the brief calls for, and
 * the bridge between the data audit (Track 1) and the guided UI (Track 2).
 *
 * It does NOT invent a new score. It COMPOSES the gates the app already
 * trusts — isRecommendable (B2B/junk), is_operational (Google's authority),
 * isNonDiscoverable, the curation flags, and placeQuality (the [0..0.9]
 * confidence score) — into four mutually-exclusive tiers:
 *
 *   Tier 1 — Recommend   : safe to LEAD a "Best match" / top result card.
 *   Tier 2 — Browse only : real and usable, but not a top recommendation.
 *   Tier 3 — Needs review: a key gate is soft (B2B leak, temp-closed, thin).
 *   Tier 4 — Hide/archive: closed permanently, junk, or missing essentials.
 *
 * The same function is meant to gate runtime surfaces later (a result block
 * leads with Tier 1, fills with Tier 2, never tops with Tier 3/4), so the
 * audit and the UI never disagree about what's safe to show.
 */
export type RecommendationTier = 1 | 2 | 3 | 4;
export type TierResult = { tier: RecommendationTier; reason: string };

/** placeQuality at/above this reads as "confident enough to lead". */
export const TIER1_QUALITY_FLOOR = 0.4;

export function recommendationTier(p: PlaceCardData): TierResult {
  // ── Tier 4 — Hide / archive. Never surface, anywhere. ──
  if (SUPPRESSED_JUNK_SLUGS.has(p.slug)) return { tier: 4, reason: "suppressed junk" };
  if (p.is_operational === "closed_permanently") return { tier: 4, reason: "closed permanently" };
  // The discovery loader only suppresses a non-discoverable Google type when
  // it came from a bulk DFP/Google import. A curated or discovered civic place
  // can legitimately carry Google's vague "service" type (for example, a
  // county senior center), so the readiness audit must honor the same source
  // guard instead of contradicting the public catalog.
  if (
    (p.source === "dfp" || p.source === "google") &&
    isNonDiscoverable(p.primary_type)
  ) {
    return { tier: 4, reason: "non-discoverable bulk-import type" };
  }
  const geomOk = p.geom && Number.isFinite(p.geom.lng) && Number.isFinite(p.geom.lat);
  if (!p.name?.trim() || !p.category?.trim() || !geomOk) {
    return { tier: 4, reason: "missing name / category / coordinates" };
  }

  // ── Tier 3 — Needs review. Real, but a gate is soft. ──
  if (p.is_operational === "closed_temporarily") return { tier: 3, reason: "temporarily closed" };
  if (!isRecommendable(p)) return { tier: 3, reason: "not eligible for recommendation" };

  // Curated picks always lead — a hand-blessed local standout outranks the
  // data proxy (a seed gem with no Google profile still earns Tier 1).
  if (p.local_favorite || isHiddenGem(p.slug)) {
    return { tier: 1, reason: "curated / local favorite" };
  }

  const q = placeQuality(p);

  // Completeness floor: a bare import with almost nothing real to show is a
  // review candidate, not a browse row — even if it passed the gates above.
  const hasRating = typeof p.google_rating === "number" && (p.google_rating_count ?? 0) >= 20;
  const hasHours = p.open_confidence === "verified" || p.open_confidence === "likely";
  const hasProse = Boolean(p.short_blurb || p.description);
  const completeness =
    [p.google_photo_url, hasRating, hasHours, hasProse, p.address].filter(Boolean).length;
  if (completeness <= 1 && q < 0.25) {
    return { tier: 3, reason: "thin record — needs review" };
  }

  // ── Tier 1 vs Tier 2 — confidence decides. ──
  if (q >= TIER1_QUALITY_FLOOR) {
    return { tier: 1, reason: `confident (quality ${q.toFixed(2)})` };
  }
  return { tier: 2, reason: `browse only (quality ${q.toFixed(2)})` };
}

/** Convenience: true when a place is safe to LEAD a recommendation. */
export function isTopRecommendable(p: PlaceCardData): boolean {
  return recommendationTier(p).tier === 1;
}

/** Convenience: true when a place may appear in browse lists at all. */
export function isBrowsable(p: PlaceCardData): boolean {
  return recommendationTier(p).tier <= 2;
}
