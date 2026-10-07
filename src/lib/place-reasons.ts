import type { PlaceCardData } from "@/lib/loaders/places";
import type { ReasonTone } from "@/components/ui/ReasonChip";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { isHiddenGem } from "@/data/hidden-gems";
import { CATEGORY_BY_SLUG } from "@/data/categories";

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
 *   5. Recently checked hours — answers "is the open status current?"
 */
export type PlaceReason =
  | "verified_open"
  | "open_now"
  | "hidden_gem"
  | "near"
  | "walkable"
  | "kid_friendly"
  | "dog_friendly"
  | "free"
  | "near_landmark"
  | "top_rated"
  | "local_favorite"
  | "hours_checked";

export type PlaceReasonChip = { kind: PlaceReason; label: string; tone: ReasonTone };

export type PlaceReasonOptions = {
  /**
   * The surface prints the distance itself. A "224 ft away" chip beside a
   * "224 ft" figure says the same thing twice (October 2026 row audit), so
   * the proximity reason is left out.
   */
  distanceShown?: boolean;
};

const NEAR_M = 1200;

const TOP_RATED_MIN_STARS = 4.5;
const TOP_RATED_MIN_COUNT = 50;
const LOCAL_FAVORITE_MIN_FEATURE = 9;

/**
 * "Local favorite" is a claim about a place people choose to spend time in.
 * The loader derives it from a strong Google profile, which flagged 501 of
 * 1,570 places (a print shop, a funeral home and auto shops among them), and
 * a chip on a third of the catalog distinguishes nothing. The chip prints only
 * in the destination families. Shopping, personal care, services, civic and
 * worship, lodging and infrastructure keep the flag for ranking but never
 * print it.
 */
const DESTINATION_FAMILIES: ReadonlySet<string> = new Set([
  "food",
  "outdoors",
  "arts",
  "family",
  "sports",
]);

/**
 * Whether a category is a destination (somewhere people go to eat, drink,
 * play or see something) rather than an errand. Only destinations print the
 * "Local favorite" chip.
 */
export function isDestinationCategory(category: string): boolean {
  const entry = CATEGORY_BY_SLUG[category];
  const family = entry ? entry.parent ?? entry.slug : undefined;
  return family !== undefined && DESTINATION_FAMILIES.has(family);
}

const FRESH_WITHIN_DAYS = 14;

// Unambiguous kid destinations (category-level only — conservative; no
// fuzzy "park is sort of kid-friendly" guessing).
const KID_CATEGORIES: ReadonlySet<string> = new Set(["family", "playground"]);

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
  options: PlaceReasonOptions = {},
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
  // The loader supplies straight-line distance, not a pedestrian route. A
  // nearby point may sit across a river, railway, or road without a crossing.
  if (
    !options.distanceShown &&
    typeof p.distance_m === "number" &&
    Number.isFinite(p.distance_m) &&
    p.distance_m >= 0 &&
    p.distance_m <= NEAR_M
  ) {
    out.push({ kind: "near", label: `${formatDistance(p.distance_m)} away`, tone: "near" });
  }

  // 3. One intent reason — the single most useful "does this fit?" signal,
  // derived from data we already have. Capped to ONE (kid-friendly →
  // dog-friendly → free → near a landmark) so it never crowds out open /
  // distance / quality. Dog-friendly is a real tag (from the discovered
  // rows / Google amenities when present), not a guess, and it's a signal
  // people specifically hunt for — so it outranks the weaker "Free"
  // and "Near {landmark}" fillers. A park or trail may charge entry: only
  // the catalog's explicit free tag supports a price claim.
  if (KID_CATEGORIES.has(p.category)) {
    out.push({ kind: "kid_friendly", label: "Kid-friendly", tone: "neutral" });
  } else if ((p.tags ?? []).includes("dog-friendly")) {
    out.push({ kind: "dog_friendly", label: "Dog-friendly", tone: "neutral" });
  } else if ((p.tags ?? []).includes("free")) {
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
  const favorite =
    p.local_favorite || (p.feature_score ?? 0) >= LOCAL_FAVORITE_MIN_FEATURE;
  if (favorite && isDestinationCategory(p.category)) {
    out.push({ kind: "local_favorite", label: "Local favorite", tone: "rated" });
  } else if (
    (p.google_rating ?? 0) >= TOP_RATED_MIN_STARS &&
    (p.google_rating_count ?? 0) >= TOP_RATED_MIN_COUNT
  ) {
    out.push({ kind: "top_rated", label: "Top rated", tone: "rated" });
  }

  // 5. Hours freshness. A generic row timestamp must never imply that the
  // hours were checked, so only the dedicated hours timestamp earns a chip.
  if (p.hours_verified && p.hours_updated_at) {
    const daysOld =
      (now.getTime() - Date.parse(p.hours_updated_at)) / (24 * 3600_000);
    if (daysOld >= 0 && daysOld <= FRESH_WITHIN_DAYS) {
      out.push({ kind: "hours_checked", label: "Hours checked", tone: "verified" });
    }
  }

  return out.slice(0, 3);
}

/**
 * The one mark a picture row may carry after its status, rating and price.
 *
 * - `deal`: a verified standing deal figure ("25% OFF"), in Brick press.
 * - `notes`: source-linked Field Notes on file, in Brick press.
 * - `neutral`: the first editorial reason (Hidden gem, Local favorite,
 *   Kid-friendly, Dog-friendly, Free, Near a landmark, Hours checked), in ink.
 *
 * Open state, distance and "Top rated" never become a mark. The row already
 * prints its status, its distance and its rating, and repeating them as chips
 * is the duplication the October 2026 row audit removed. "Near Carroll Creek"
 * marks destinations only: the row prints the street already, and on a bank
 * or a salon the landmark is a second address rather than a reason to go.
 */
export type PlaceRowMark = {
  kind: "deal" | "field_notes" | PlaceReason;
  label: string;
  tone: "deal" | "notes" | "neutral";
};

const ROW_MARK_SKIP: ReadonlySet<PlaceReason> = new Set([
  "verified_open",
  "open_now",
  "near",
  "walkable",
  "top_rated",
]);

export function placeRowMark(
  p: PlaceCardData,
  now: Date = new Date(),
): PlaceRowMark | null {
  if (p.deal_hook) return { kind: "deal", label: p.deal_hook, tone: "deal" };
  if (p.field_notes) return { kind: "field_notes", label: "Field notes", tone: "notes" };
  const destination = isDestinationCategory(p.category);
  const reason = placeReasons(p, now, { distanceShown: true }).find(
    (r) =>
      !ROW_MARK_SKIP.has(r.kind) &&
      (r.kind !== "near_landmark" || destination),
  );
  return reason ? { kind: reason.kind, label: reason.label, tone: "neutral" } : null;
}

/**
 * The street part of a catalog address for a row's fact line, or null when
 * the field holds no street. Catalog addresses mix "118 S Market St", a full
 * "49 E Patrick St, Frederick, MD 21701", a venue ahead of the street
 * ("Barbara Fritchie House, 154 W Patrick St, ..."), plus codes ("CH7V+3PR")
 * and bare town names. A row has room for the street only, and a town name or
 * plus code printed where a street belongs reads as a broken address, so the
 * first comma segment that reads as a street wins and anything else is null.
 */
const STREET_WORD =
  /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ln|lane|pike|ct|court|pl|place|hwy|highway|pkwy|parkway|sq|square|ter|terrace|cir|circle|alley|tpke|turnpike|route|rte)\b/i;
/** A house number, then a street: "118 S Market St", "10-B N East St",
 *  "402 5th Ave". A bare number ("25") or a ZIP is not a street. */
const NUMBERED_STREET = /^\d+(?:-?[A-Za-z]|-\d+)?\s+\S/;

export function streetLine(address: string | null | undefined): string | null {
  const segments = (address ?? "")
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.includes("+"));
  // A numbered street beats a named one, so "Market Place, 12 Main St"
  // prints the street rather than the plaza.
  return (
    segments.find((segment) => NUMBERED_STREET.test(segment)) ??
    segments.find((segment) => STREET_WORD.test(segment)) ??
    null
  );
}
