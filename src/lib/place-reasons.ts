import type { PlaceCardData } from "@/lib/loaders/places";
import type { ReasonTone } from "@/components/ui/ReasonChip";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { isHiddenGem } from "@/data/hidden-gems";

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
 *   3. ONE intent reason (kid-friendly / free / near a landmark) —
 *      answers "does this fit what I'm doing?" Capped to one so it never
 *      crowds out the decision signals.
 *   4. Top rated / local favorite — answers "is it good?"
 *   5. Recently verified — answers "is the data current?"
 */
export type PlaceReason =
  | "verified_open"
  | "open_now"
  | "hidden_gem"
  | "near"
  | "walkable"
  | "kid_friendly"
  | "free"
  | "near_landmark"
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

// Unambiguous kid destinations (category-level only — conservative; no
// fuzzy "park is sort of kid-friendly" guessing).
const KID_CATEGORIES: ReadonlySet<string> = new Set(["family", "playground"]);
// Obviously-free public destinations.
const FREE_CATEGORIES: ReadonlySet<string> = new Set([
  "park", "trail", "outdoors", "public-art",
]);

// Tiny curated landmark set — the locators a local actually uses. Downtown
// coords are the real place geoms; Hood/Monocacy are well-known points.
// "Near {x}" fires only within NEAR_LANDMARK_M of one of these.
const NEAR_LANDMARK_M = 500;
const LANDMARKS: ReadonlyArray<{ name: string } & LngLat> = [
  { name: "Carroll Creek", lng: -77.4109, lat: 39.4137 },
  { name: "Baker Park", lng: -77.4198, lat: 39.4170 },
  { name: "the Weinberg", lng: -77.4124, lat: 39.4145 },
  { name: "Hood College", lng: -77.3985, lat: 39.4235 },
  { name: "Monocacy Battlefield", lng: -77.3905, lat: 39.3730 },
];

/** Nearest curated landmark within NEAR_LANDMARK_M, else null. Pure. */
function nearestLandmark(geom: LngLat): { name: string } | null {
  let best: { name: string } | null = null;
  let bestD = NEAR_LANDMARK_M;
  for (const lm of LANDMARKS) {
    const d = haversineMeters(geom, { lng: lm.lng, lat: lm.lat });
    if (d <= bestD) {
      bestD = d;
      best = { name: lm.name };
    }
  }
  return best;
}


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

  // 2. Hidden gem: a hand-curated local standout from src/data/hidden-gems.
  // Placed high so this editorial "why you'd go" survives the 3-chip cap
  // for the handful of places that earn it; it's the most distinctive
  // single reason for those spots. Until now the curation never reached a
  // screen — this is the wire-up.
  if (isHiddenGem(p.slug)) {
    out.push({ kind: "hidden_gem", label: "Hidden gem", tone: "rated" });
  }

  // 3. Distance — only when an origin was set on the loader.
  if (typeof p.distance_m === "number") {
    if (p.distance_m <= WALK_NEAR_M) {
      const mins = Math.max(1, Math.round(p.distance_m / WALK_SPEED_M_PER_MIN));
      out.push({ kind: "near", label: `${mins} min walk`, tone: "near" });
    } else if (p.distance_m <= WALK_OK_M) {
      out.push({ kind: "walkable", label: "Walkable", tone: "near" });
    }
  }

  // 3. One intent reason — the single most useful "does this fit?" signal,
  // derived from data we already have. Capped to ONE (kid-friendly → free →
  // near a landmark) so it never crowds out open / distance / quality.
  if (KID_CATEGORIES.has(p.category)) {
    out.push({ kind: "kid_friendly", label: "Kid-friendly", tone: "neutral" });
  } else if (FREE_CATEGORIES.has(p.category)) {
    out.push({ kind: "free", label: "Free", tone: "free" });
  } else {
    const lm = nearestLandmark(p.geom);
    if (lm) out.push({ kind: "near_landmark", label: `Near ${lm.name}`, tone: "near" });
  }

  // 4. Quality signal. The authoritative local-favorite flag (hand-pick
  // in local-favorites.json, or the verified high-rating data proxy —
  // see resolveLocalFavorite in the loader) is the same signal the
  // visitor ranking blends, so the chip and the ranking never disagree.
  // Curated seed places with a high feature_score but no Google profile
  // still qualify. Otherwise a strong Google rating earns "Top rated".
  if (p.local_favorite || (p.feature_score ?? 0) >= LOCAL_FAVORITE_MIN_FEATURE) {
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
      out.push({ kind: "recently_verified", label: "Confirmed", tone: "verified" });
    }
  }

  return out.slice(0, 3);
}
