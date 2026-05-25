import type { PlaceCardData } from "@/lib/loaders/places";
import type { ReasonTone } from "@/components/ui/ReasonChip";

/**
 * Derive the small "why this is shown" reason chips for a place,
 * from data the loader already produces. No new ingestion — these
 * are signals every place already carries.
 *
 * Capped at 3 reasons per card so the row stays scannable. The order
 * here is the priority order — earlier reasons survive the cap.
 *
 * Priority rationale:
 *   1. Open / verified open — answers "can I go right now?"
 *   2. Distance — answers "how much effort?"
 *   3. Top rated / local favorite — answers "is it good?"
 *   4. Recently verified — answers "is the data current?"
 */
export type PlaceReason =
  | "verified_open"
  | "open_now"
  | "near"
  | "walkable"
  | "top_rated"
  | "local_favorite"
  | "recently_verified";

export type PlaceReasonChip = { kind: PlaceReason; label: string; tone: ReasonTone };

const WALK_NEAR_M = 400; // ~5 minute walk
const WALK_OK_M = 1200; // ~15 minute walk
const WALK_SPEED_M_PER_MIN = 80; // 4.8 km/h

const TOP_RATED_MIN_STARS = 4.5;
const TOP_RATED_MIN_COUNT = 50;
const LOCAL_FAVORITE_MIN_FEATURE = 9;
const FRESH_WITHIN_DAYS = 14;

export function placeReasons(
  p: PlaceCardData,
  now: Date = new Date(),
): PlaceReasonChip[] {
  const out: PlaceReasonChip[] = [];

  // 1. Open status — the strongest single signal. Prefer the verified
  // tier label ("Open") over "Open now" when the place has live hours.
  if (p.open_status?.state === "open") {
    if (p.open_confidence === "verified") {
      out.push({ kind: "verified_open", label: "Open", tone: "open" });
    } else {
      out.push({ kind: "open_now", label: "Open now", tone: "open" });
    }
  }

  // 2. Distance — only when an origin was set on the loader.
  if (typeof p.distance_m === "number") {
    if (p.distance_m <= WALK_NEAR_M) {
      const mins = Math.max(1, Math.round(p.distance_m / WALK_SPEED_M_PER_MIN));
      out.push({ kind: "near", label: `${mins} min walk`, tone: "near" });
    } else if (p.distance_m <= WALK_OK_M) {
      out.push({ kind: "walkable", label: "Walkable", tone: "near" });
    }
  }

  // 3. Quality signal. Hand-picked seed places carry a high
  // feature_score even when they don't have a Google rating; Google-
  // sourced spots earn the "top rated" chip via stars + count.
  if ((p.feature_score ?? 0) >= LOCAL_FAVORITE_MIN_FEATURE) {
    out.push({ kind: "local_favorite", label: "Local favorite", tone: "rated" });
  } else if (
    (p.google_rating ?? 0) >= TOP_RATED_MIN_STARS &&
    (p.google_rating_count ?? 0) >= TOP_RATED_MIN_COUNT
  ) {
    out.push({ kind: "top_rated", label: "Top rated", tone: "rated" });
  }

  // 4. Freshness — only worth surfacing if it's recent. A stale
  // "verified March" chip would lower trust, not raise it.
  if (p.last_verified_at) {
    const daysOld =
      (now.getTime() - Date.parse(p.last_verified_at)) / (24 * 3600_000);
    if (daysOld <= FRESH_WITHIN_DAYS) {
      out.push({ kind: "recently_verified", label: "Verified", tone: "verified" });
    }
  }

  return out.slice(0, 3);
}
