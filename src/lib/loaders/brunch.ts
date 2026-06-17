import RAW from "@/data/brunch.json" with { type: "json" };

/**
 * Brunch — the verified weekend-brunch layer of the Field Notes moat.
 *
 * Each spot is agent-researched and confirmed at the VENUE'S OWN source (its
 * site/menu showing a real brunch service + days/hours), never an aggregator.
 * `slug` links to the place page when the venue is in our directory; spots not
 * yet in the directory still list here (name + town + the verified hours).
 *
 * A wrong brunch is worse than none — only `high`/`medium` confidence ships.
 */
export type BrunchSpot = {
  name: string;
  town: string;
  address?: string;
  /** Days as the venue states them, e.g. "Sat-Sun" / "Sunday" / "Daily". */
  days: string;
  /** Hours as the venue states them, e.g. "10am-2pm". */
  hours: string;
  /** The venue's OWN confirming URL. */
  sourceUrl: string;
  confidence: "high" | "medium";
  /** Place slug when the venue is in the directory (links to its page). */
  slug?: string;
  /** One honest line of what the source says / what's special (bottomless, etc.). */
  note?: string;
};

const DATA = RAW as BrunchSpot[];

/** Every verified brunch spot, sorted by town then name. */
export function brunchSpots(): BrunchSpot[] {
  return [...DATA].sort((a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
}
