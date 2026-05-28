/**
 * Cost transparency — what Frederick Radius actually costs to run.
 *
 * Civic credibility move: a small, plain-English breakdown of the
 * line items keeping the site online. Surfaced on /trust so a
 * resident who wonders "who's funding this and how" can read the
 * answer in one screen.
 *
 * Numbers are owner-maintained, NOT scraped from billing APIs (yet).
 * The honest framing is "approximate, as of <date>" — better to be
 * slightly stale and clearly bounded than to pretend a billing
 * webhook is producing them in real time. A future pass can wire
 * up Vercel's billing API + Supabase usage endpoints; this file
 * is the temporary source of truth.
 *
 * Update protocol: when costs change materially (new line item, a
 * tier upgrade, a quarterly true-up), edit the values below + bump
 * `lastUpdated`. The /trust surface will pick the change up on its
 * next render — no migration, no API call.
 */

export type CostCadence = "monthly" | "one-time" | "annual";

export type CostLine = {
  /** Short label for the line item. e.g. "Google Places API". */
  label: string;
  /** Plain-English description of what this pays for. */
  description: string;
  /** USD figure. 0 means "covered by a free tier" — keep the row
   *  for honesty about the dependency, not zero it out. */
  cost_usd: number;
  /** Reporting cadence for the number above. The page normalizes
   *  one-time + annual into monthly for the headline total. */
  cadence: CostCadence;
  /** Honest provenance for the number. e.g. "May 2026 actual",
   *  "Vercel hobby tier (free)", "Estimated from current traffic". */
  source: string;
};

export const COST_LINES: ReadonlyArray<CostLine> = [
  {
    label: "Google Places API",
    description:
      "Hours, photos, ratings, business status, and the place IDs that anchor everything to the right venue. Refreshed on a cron; one-time backfill spikes show up in the monthly average.",
    cost_usd: 35,
    cadence: "monthly",
    source: "May 2026 estimate — includes the 1,212-call ChIJ backfill",
  },
  {
    label: "Mapbox tiles + isochrone",
    description:
      "The map background and the reachability polygons on /radius. Most months sit comfortably below the free tier.",
    cost_usd: 0,
    cadence: "monthly",
    source: "Under the 50k monthly free-tier ceiling at current traffic",
  },
  {
    label: "Supabase (Postgres + Auth)",
    description:
      "The database (place catalog, follows, submissions) and the magic-link sign-in. Free tier covers the project today.",
    cost_usd: 0,
    cadence: "monthly",
    source: "Free tier — upgrades when DAU or DB size warrants",
  },
  {
    label: "Vercel (hosting + CDN)",
    description:
      "The Next.js app itself, the edge cache, and image optimization.",
    cost_usd: 0,
    cadence: "monthly",
    source: "Hobby tier (free) — adequate at current traffic",
  },
  {
    label: "Sentry (error capture)",
    description:
      "Catches the runtime errors that make pages quietly half-broken before a user notices.",
    cost_usd: 0,
    cadence: "monthly",
    source: "Free tier — runtime-only, source maps off",
  },
  {
    label: "Domain (frederickradius.app)",
    description:
      "The address you typed to get here. Renews once a year.",
    cost_usd: 12,
    cadence: "annual",
    source: "2026 renewal",
  },
];

/** ISO date the figures above were last reconciled. Update with edits. */
export const COST_LAST_UPDATED = "2026-05-28";

/** Approximate dollars per month, summing monthly + annual/12 + one-time/12. */
export function totalMonthlyUsd(lines: ReadonlyArray<CostLine> = COST_LINES): number {
  return lines.reduce((sum, l) => {
    if (l.cadence === "monthly") return sum + l.cost_usd;
    if (l.cadence === "annual") return sum + l.cost_usd / 12;
    // one-time amortized over twelve months for a rough monthly read.
    return sum + l.cost_usd / 12;
  }, 0);
}
