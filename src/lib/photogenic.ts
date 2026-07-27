import type { PlaceCardData } from "@/lib/loaders/places";
import { placeQuality } from "@/lib/quality/placeQuality";

/**
 * Photogenic categories — the single source of truth for "would someone
 * want a photo of this?". Per the design audits, the visual feed must
 * never surface a parking deck, a driving school, or a county-permits
 * office: those technically carry a photo but destroy the curated feel.
 *
 * Shared by PhotoMosaic (the "Looks like Frederick" wall) and the
 * FunnelFlow topic grid (each topic's signature photo), so the two never
 * drift apart. Adopt once → apply everywhere.
 */
export const PHOTOGENIC_CATEGORIES: ReadonlySet<string> = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "park", "trail", "playground",
  "museum", "gallery", "theater", "music",
  "market", "lodging", "family",
  // The wine/spirits trails and pick-your-own farms are signature photo-led
  // draws of the county. worth-a-look.ts had already added them to its own
  // copy of this set; the two are now one list again, which is what the
  // "adopt once, apply everywhere" note above always claimed.
  "winery", "distillery", "agritourism", "ice-cream",
  // "outdoors" and "public-art" were dropped: both are real taxonomy slugs
  // but no place carries either as its category, so they never matched.
]);

/** A place is photogenic when it has a real photo AND sits in a category
 *  someone would actually want to see pictured. */
export function isPhotogenic(p: PlaceCardData): boolean {
  return Boolean(p.google_photo_url) && PHOTOGENIC_CATEGORIES.has(p.category);
}

/**
 * Pick the single best representative photo for a pool of places — the
 * highest-quality photogenic, photo-bearing member (placeQuality blends
 * rating, local-favorite, verified hours, photo, prose). Deterministic:
 * the same pool always yields the same hero, so a topic's photo is stable
 * from visit to visit. Returns null when the pool has no photogenic photo
 * (the caller should then fall back to a calm, photo-less treatment).
 */
export function bestPhoto(pool: readonly PlaceCardData[]): { url: string; name: string } | null {
  let best: PlaceCardData | null = null;
  let bestQ = -Infinity;
  for (const p of pool) {
    if (!p.google_photo_url || !PHOTOGENIC_CATEGORIES.has(p.category)) continue;
    const q = placeQuality(p);
    if (q > bestQ) {
      bestQ = q;
      best = p;
    }
  }
  return best ? { url: best.google_photo_url as string, name: best.name } : null;
}
