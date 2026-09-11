import RAW from "@/data/brunch.json" with { type: "json" };

/**
 * Brunch — a source-linked weekend-brunch guide.
 *
 * Each spot carries the page used for its brunch details. A source link alone
 * is not a current verification date, so rows only receive a checked label
 * when `lastVerified` is recorded explicitly.
 * `slug` links to the place page when the venue is in our directory; spots not
 * yet in the directory still list here (name + town + posted hours).
 */
export type BrunchSpot = {
  name: string;
  town: string;
  address?: string;
  /** Days as the venue states them, e.g. "Sat-Sun" / "Sunday" / "Daily". */
  days: string;
  /** Hours as the venue states them, e.g. "10am-2pm". */
  hours: string;
  /** Source page used for this row. */
  sourceUrl: string;
  confidence: "high" | "medium";
  /** ISO date recorded only after this row is checked against its source. */
  lastVerified?: string;
  /** Place slug when the venue is in the directory (links to its page). */
  slug?: string;
  /** One honest line of what the source says / what's special (bottomless, etc.). */
  note?: string;
};

const DATA = RAW as BrunchSpot[];

/** Source-linked brunch spots, sorted by town then name. */
export function brunchSpots(): BrunchSpot[] {
  return [...DATA].sort((a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
}

export function brunchVerificationDate(spot: BrunchSpot): string | null {
  const candidate = spot.lastVerified?.trim();
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return null;
  return candidate;
}
