/**
 * parking — pure, client-safe helpers for the /map Parking layer.
 *
 * The downtown garage markers are tinted by LIVE availability and their
 * peek card names a real spaces count only when the feed actually has one.
 * Both rules live here (framework-free, no server-only imports) so the map
 * marker, the peek, and the unit tests read the exact same truth. The live
 * numbers arrive server-side via lib/integrations/parking-live.ts; this file
 * only interprets the already-normalized snapshot fields.
 *
 * Honesty first: when the feed is dormant or a deck is unmatched, every live
 * field is null and we render the garage as a NEUTRAL marker with NO number,
 * never a fabricated count. See parking-garages.ts + parking-live.ts.
 */

/**
 * A downtown garage as the map draws it: the static curated metadata
 * (name / address / coords / rate) plus the live availability fields lifted
 * from GarageOccupancy. All live fields are null when there's no live data
 * for this deck, so a marker can always tell "known" from "unknown".
 */
export type ParkingPin = {
  slug: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  /** The City's published rate line, when the data carries it. */
  rate?: string;
  /** Live spaces open right now, or null when the feed doesn't report it. */
  available: number | null;
  /** Live percent-full (0-100), or null when unknown. */
  percentFull: number | null;
  /** Derived by the feed: at/over the full threshold, zero spaces, or a
   *  FULL status string. */
  isFull: boolean;
  /** Derived: filling up (past the caution threshold) but not yet full. */
  isFilling: boolean;
  /** ISO timestamp the feed last updated this deck, when present. */
  updated: string | null;
};

/** The tint buckets a garage marker can land in. */
export type ParkingTone = "positive" | "warning" | "danger" | "neutral";

/** True when the feed carries ANY usable live signal for this deck. */
export function parkingHasLive(pin: Pick<ParkingPin, "available" | "percentFull" | "isFull" | "isFilling">): boolean {
  return (
    pin.available !== null ||
    pin.percentFull !== null ||
    pin.isFull ||
    pin.isFilling
  );
}

/**
 * Availability → marker tint. The one rule the marker and the peek share:
 *   - full           → danger  (red)
 *   - filling up     → warning (amber)
 *   - plenty of live data, not filling → positive (green)
 *   - no live signal → neutral (ink; NEVER faked green)
 *
 * Full/filling are checked first because a FULL/filling status can arrive
 * as a bare string with no number — that's still an honest "full".
 */
export function parkingTone(
  pin: Pick<ParkingPin, "available" | "percentFull" | "isFull" | "isFilling">,
): ParkingTone {
  if (pin.isFull) return "danger";
  if (pin.isFilling) return "warning";
  return parkingHasLive(pin) ? "positive" : "neutral";
}

/**
 * The honest spaces line for the peek card:
 *   - full             → "Full"
 *   - a real count     → "N space(s) open"
 *   - no live number   → null  (render the garage with no number)
 *
 * A garage can be full-by-status with no count, so "Full" wins over a null
 * available; and a plain count never gets dressed up as anything more than
 * "spaces open" — no hype.
 */
export function parkingSpacesLabel(
  pin: Pick<ParkingPin, "available" | "isFull">,
): string | null {
  if (pin.isFull) return "Full";
  if (pin.available !== null) {
    return `${pin.available} space${pin.available === 1 ? "" : "s"} open`;
  }
  return null;
}

/** Marker fill + on-fill text tokens per tone (AA-checked pairings). */
export const PARKING_TONE_STYLE: Record<
  ParkingTone,
  { fill: string; ink: string }
> = {
  // Positive, warning, danger, and neutral fills all clear AA with the warm
  // near-white on-brand token. The lighter decorative amber uses dark Ink,
  // but this status fill is the darker text-safe warning token.
  positive: { fill: "var(--app-positive)", ink: "var(--app-on-brand, #FCFBF8)" },
  warning: { fill: "var(--app-warning)", ink: "var(--app-on-brand, #FCFBF8)" },
  danger: { fill: "var(--app-danger)", ink: "var(--app-on-brand, #FCFBF8)" },
  neutral: { fill: "var(--app-ink-2, #5A5348)", ink: "var(--app-on-brand, #FCFBF8)" },
};
