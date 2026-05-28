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

// ════════════════════════════════════════════════════════════════════
//                    Build cost — what it took to make
// ════════════════════════════════════════════════════════════════════
//
// Runtime costs above tell the "how much to keep it on" story. The
// honest companion is what it COST to build — the design + engineering
// + data work that's already been donated to the project.
//
// Civic framing, not VC framing: "evenings + weekends" reads as
// community contribution; "$80k saved" reads as humblebrag. The
// dollar number is included as MARKET-EQUIVALENT, with a clear note
// that it was donated. The point is to show a resident that real
// work went in, not to suggest debt.

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
 * pulled from a time-tracking tool. Edit with the same care as
 * COST_LINES — better to under-claim than pretend.
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
      "The 1,700+ Frederick County places, vetted by hand. Address corrections, photo sourcing, blurb editing, dedup decisions — work that doesn't show up in commits but is the difference between a directory and a field guide.",
    hours: 80,
    rate_low_usd: 75,
    rate_high_usd: 125,
    who: "Owner",
  },
  {
    label: "Brand + identity",
    description:
      "Name, logo, typography system, color palette, photo treatment, voice + tone document — the small editorial decisions that make every page feel like the same product.",
    hours: 40,
    rate_low_usd: 175,
    rate_high_usd: 275,
    who: "Owner",
  },
  {
    label: "Photography",
    description:
      "Original photos of Frederick — Carroll Creek, Baker Park, the Catoctin ridge — used as hero imagery and seasonal variants. Not stock.",
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
