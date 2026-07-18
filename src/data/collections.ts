/**
 * Editorial collections — the "field guide" layer over the directory.
 *
 * Pre-launch review §6 caught that /places reads as a directory and
 * doesn't surface local taste. Google Maps shows 2,000 pins; a field
 * guide says "if it's raining, here are the six places I'd send a
 * stranger downtown." That's the bet. Collections is the layer that
 * makes the recommendation explicit.
 *
 * Shape
 *   Each collection is a curated, ordered list of place slugs with a
 *   title + one-sentence editorial blurb. No data fan-out — when a
 *   page renders a collection it resolves the slugs against the
 *   canonical place index at request time, so collections survive
 *   the data churn underneath them.
 *
 * Voice
 *   Brand-voice STYLE.md: complete sentences, no em dashes, no "craft",
 *   "team" not "staff", plain and direct. Each blurb reads like a
 *   resident telling a friend where to go.
 *
 * v1 collections
 *   - "Frederick Without a Plan" — wandering downtown afternoon
 *   - "Walkable Date Night" — a downtown evening sequence
 *   - "Rainy Day Frederick" — indoors when it's wet
 *   - "Kid Energy Burners" — places to wear out the kids
 *
 * Adding a collection: append to COLLECTIONS, give it a slug, title,
 * one-sentence blurb, and the ordered place slugs. The renderer
 * handles the rest. Slugs that don't resolve are silently skipped so
 * a renamed place can't break a collection page.
 */

import { HIDDEN_GEM_SLUGS } from "@/data/hidden-gems";

export type CollectionDef = {
  /** URL slug; lives at /collections/<slug>. */
  slug: string;
  /** Display title; serif H1 on the detail page. */
  title: string;
  /** One-sentence editorial blurb. Brand voice; no em dashes. */
  blurb: string;
  /** Token color name from globals.css — drives the hero tint and
   *  the index-page card stripe. Use a CSS var literal so a future
   *  palette change in globals.css cascades automatically. */
  accent: string;
  /** Ordered list of place slugs. Display order is array order; the
   *  renderer doesn't re-sort. Unknown slugs are skipped. */
  places: string[];
};

export const COLLECTIONS: CollectionDef[] = [
  {
    // Sourced from the curated HIDDEN_GEM_SLUGS (one source of truth, shared
    // with the place card's "Hidden gem" chip + the /guide rail).
    slug: "hidden-gems",
    title: "Small finds",
    blurb:
      "These are the smaller places a resident is likely to send a visitor before the usual names.",
    accent: "var(--app-accent)",
    places: [...HIDDEN_GEM_SLUGS],
  },
  {
    slug: "frederick-without-a-plan",
    title: "Frederick without a plan",
    blurb:
      "This downtown route starts with coffee and follows the creek before ending near a taproom. Each stop is a short walk from the last.",
    accent: "var(--app-brand)",
    places: [
      "dublin-roasters-frederick",
      "carroll-creek-linear-park-frederick",
      "the-curious-iguana-frederick",
      "north-market-pop-shop-frederick",
      "olde-mother-brewing-frederick",
      "brewers-alley-frederick",
    ],
  },
  {
    slug: "walkable-date-night",
    title: "Walkable date night",
    blurb:
      "Start near Carroll Creek, then walk to dinner and a quiet drink. The stops stay within a few downtown blocks.",
    accent: "var(--app-brand)",
    places: [
      "frederick-coffee-company-frederick",
      "carroll-creek-linear-park-frederick",
      "isabellas-taverna-tapas-bar-frederick",
      "hootch-and-banter-frederick",
      "weinberg-center-for-the-arts-frederick",
    ],
  },
  {
    slug: "rainy-day-frederick",
    title: "Rainy day Frederick",
    blurb:
      "These indoor stops work for a wet afternoon when you want enough room to stay awhile.",
    accent: "var(--app-cool)",
    places: [
      "national-museum-civil-war-medicine-frederick",
      "delaplaine-arts-center-frederick",
      "weinberg-center-for-the-arts-frederick",
      "c-burr-artz-public-library-frederick",
      "the-curious-iguana-frederick",
      "hidden-hills-farm-vineyard-frederick",
    ],
  },
  {
    slug: "kid-energy-burners",
    title: "Kid energy burners",
    blurb:
      "These places give young kids room to run and have parking close enough to keep the trip manageable.",
    accent: "var(--app-brand-2)",
    places: [
      "baker-park-frederick",
      "carroll-creek-linear-park-frederick",
      "monocacy-national-battlefield-frederick",
    ],
  },
  {
    // Beer around Frederick — the county's breweries and taprooms as one
    // trail. Every stop is a real, currently-open beer brewery (not a winery,
    // distillery, meadery, or cidery): each was web-verified operational in
    // July 2026 before shipping, because a guide that sends you to a closed
    // taproom (see Idiom Brewing, closed Feb 2026) loses trust. Order is
    // walk-then-drive: downtown Frederick's walkable core first, then the
    // outlying-town breweries in Brunswick and Mount Airy. Flood Zone
    // (Union Bridge) was verified open but sits in Carroll County, so it is
    // out of scope and excluded.
    slug: "beer-around-frederick",
    title: "Beer around Frederick",
    blurb:
      "Start downtown, where the taprooms are close enough to walk between. When you're ready, drive out to Brunswick and the farm breweries around Mount Airy.",
    accent: "var(--app-accent)",
    places: [
      "brewers-alley-frederick",
      "olde-mother-brewing-frederick",
      "steinhardt-brewing-company-frederick",
      "attaboy-beer-frederick",
      "rockwell-brewery-frederick",
      "midnight-run-brewing",
      "monocacy-brewing-frederick",
      "sandbox-brewhouse-frederick",
      "rak-brewing-co-frederick",
      "prospect-point-brewing-frederick",
      "brudr-bier-co-frederick",
      "smoketown-brewing-brunswick",
      "liquidity-aleworks-mount-airy",
      "milkhouse-brewery-mt-airy",
      "red-shedman-farm-brewery-and-hop-yard-mount-airy",
    ],
  },
  {
    // LGBTQ+ Frederick — CURATED, never auto-detected. We hold no
    // "LGBTQ-friendly" data attribute, and guessing which venues are welcoming
    // would be worse than saying nothing. So this is hand-verified only: it
    // starts with The Frederick Center (the county's LGBTQ+ community hub) and
    // grows as the owner/community confirms welcoming + LGBTQ-owned spaces.
    // Add verified place slugs below (unknown slugs are skipped by the renderer).
    slug: "lgbtq-frederick",
    title: "LGBTQ+ Frederick",
    blurb:
      "The Frederick Center anchors this list. Other spaces appear only after we can verify that they are welcoming.",
    accent: "var(--app-accent)",
    places: [
      "the-frederick-center",
      // Add owner/community-verified welcoming + LGBTQ-owned venues here.
    ],
  },
];

/** O(1) lookup by slug, with the same data the array carries. */
export const COLLECTION_BY_SLUG: Record<string, CollectionDef> =
  Object.fromEntries(COLLECTIONS.map((c) => [c.slug, c]));
