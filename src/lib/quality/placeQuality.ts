import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * placeQuality — a transparent usefulness + confidence score (≈0..0.9)
 * from signals we already hold. Deliberately dumb (no ML, no fabrication):
 * a place we can show with confidence — verified hours, a real photo, a
 * meaningful rating, a local blessing, real prose — should outrank a bare
 * row. Used to break ranking ties so the funnel surfaces the most useful,
 * most trustworthy answers first instead of falling back to alphabetical.
 *
 * Every term maps to a field a user would actually care about, so the
 * ranking stays explainable (the basis for a future "why shown" line).
 */
export function placeQuality(p: PlaceCardData): number {
  let s = 0;
  if (p.google_photo_url) s += 0.25; // has a real photo
  const rating = p.google_rating;
  const count = p.google_rating_count ?? 0;
  // Reward a rating only once there are enough reviews to mean something.
  if (typeof rating === "number" && count >= 20) {
    s += 0.2 + Math.max(0, Math.min(0.15, (rating - 3.5) * 0.1));
  }
  if (p.local_favorite) s += 0.2; // a curated local pick
  if (p.open_confidence === "verified") s += 0.15; // hours we actually trust
  if (p.short_blurb || p.description) s += 0.1; // real prose, not a placeholder
  return s;
}
