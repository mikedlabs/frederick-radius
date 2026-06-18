/**
 * Cost transparency — what Frederick Radius COST TO BUILD.
 *
 * Civic credibility move, surfaced on /trust: a plain-English account of the
 * design + engineering + data work that's already been donated to the project.
 * (The runtime "what it costs to run" line-item breakdown was removed by owner
 * request; this file is now the build-cost source of truth.)
 *
 * Civic framing, not VC framing: "evenings + weekends" reads as community
 * contribution; "$80k saved" reads as humblebrag. The dollar number is included
 * as MARKET-EQUIVALENT, with a clear note that it was donated. The point is to
 * show a resident that real work went in, not to suggest debt.
 *
 * Numbers are owner-maintained, NOT pulled from a time-tracking tool. Edit with
 * care — better to under-claim than pretend.
 */

export type BuildLine = {
  /** Short label. e.g. "Design + engineering". */
  label: string;
  /** Plain-English description of what this line covered. */
  description: string;
  /** Approximate hours invested. Owner-maintained, honest order-of-magnitude. */
  hours: number;
  /** Typical agency rate this kind of work commissions at. The range
   *  is wide on purpose; we pick the midpoint for the headline number. */
  rate_low_usd: number;
  rate_high_usd: number;
  /** Who carried this line. "Owner" = the person maintaining the project;
   *  "Volunteer" = uncompensated community contribution; "Vendor" = a
   *  paid contractor or service (rare; document specifically). */
  who: "Owner" | "Volunteer" | "Vendor";
};

/**
 * Build investment line items. Numbers are owner-maintained, NOT
 * pulled from a time-tracking tool. Edit with care: better to
 * under-claim than pretend.
 *
 * Hours are rough — order-of-magnitude is the unit. Rate ranges are
 * 2026 mid-Atlantic market rates for design + engineering work.
 */
export const BUILD_LINES: ReadonlyArray<BuildLine> = [
  {
    label: "Design + engineering",
    description:
      "Product design, frontend (Next.js + React), backend (Postgres + Drizzle), data pipelines, integrations (Google Places, Mapbox, NWS, iCal feeds), and the editorial copy across every surface.",
    hours: 500,
    rate_low_usd: 150,
    rate_high_usd: 225,
    who: "Owner",
  },
  {
    label: "Data verification + curation",
    description:
      "The 1,700+ Frederick County places, vetted by hand. Address corrections, photo sourcing, blurb editing, dedup decisions: the work that doesn't show up in commits but is the difference between a directory and a field guide.",
    hours: 80,
    rate_low_usd: 75,
    rate_high_usd: 125,
    who: "Owner",
  },
  {
    label: "Brand + identity",
    description:
      "Name, logo, typography system, color palette, photo treatment, voice + tone document: the small editorial decisions that make every page feel like the same product.",
    hours: 40,
    rate_low_usd: 175,
    rate_high_usd: 275,
    who: "Owner",
  },
  {
    label: "Photography",
    description:
      "Original photos of Frederick (Carroll Creek, Baker Park, the Catoctin ridge), used as hero imagery and seasonal variants. Not stock.",
    hours: 30,
    rate_low_usd: 100,
    rate_high_usd: 200,
    who: "Owner",
  },
];

/** Midpoint market-equivalent value for the whole build investment. */
export function totalBuildMarketUsd(
  lines: ReadonlyArray<BuildLine> = BUILD_LINES,
): { low: number; high: number; mid: number; hours: number } {
  let low = 0;
  let high = 0;
  let hours = 0;
  for (const l of lines) {
    low += l.hours * l.rate_low_usd;
    high += l.hours * l.rate_high_usd;
    hours += l.hours;
  }
  return { low, high, mid: Math.round((low + high) / 2), hours };
}

/** Editorial framing line that runs above the build-cost breakdown.
 *  Update at the same cadence as the line items. */
export const BUILD_STARTED = "November 2025";
