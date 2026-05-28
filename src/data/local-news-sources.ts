/**
 * Local news RSS sources surfaced in the /now Local news rail.
 *
 * Each entry is a publication we LINK OUT to — we never store or
 * republish body content. RSS is designed for this: titles +
 * summaries + canonical URLs. The only thing Frederick Radius does
 * is rank, dedupe, and present.
 *
 * URLs are listed best-guess where I'm not 100% sure of the path
 * (Patch in particular varies). If a fetch returns a non-XML
 * response or a 404, the source falls out silently and the rail
 * still renders with whichever sources succeeded — the user never
 * sees a broken section.
 *
 * To add a source: append a row. To remove: delete the row. To
 * change weight: see the per-source priority in the loader (sources
 * declared first win on duplicate URLs).
 */
export type LocalNewsSource = {
  /** Stable id used as a fallback dedupe key + analytics tag. */
  id: string;
  /** Display name on the rail card (e.g. "Patch", "FNP"). */
  label: string;
  /** Full RSS / Atom URL. */
  feedUrl: string;
  /** Optional canonical homepage — used for the "all from {source}"
   *  link in the rail footer when present. */
  homeUrl?: string;
  /** Brand-token accent color — drives the left edge of each item
   *  in the rail so the eye can sort by source at a glance. Values
   *  are CSS color tokens, not raw hex, so theme swaps work. */
  accent: string;
};

export const LOCAL_NEWS_SOURCES: LocalNewsSource[] = [
  {
    id: "frederick-news-post",
    label: "FNP",
    feedUrl: "https://www.fredericknewspost.com/search/?f=rss&t=article&l=25&s=start_time&sd=desc",
    homeUrl: "https://www.fredericknewspost.com/",
    accent: "var(--app-brand)",
  },
  {
    id: "maryland-matters",
    label: "MD Matters",
    feedUrl: "https://www.marylandmatters.org/feed/",
    homeUrl: "https://www.marylandmatters.org/",
    accent: "var(--app-cool)",
  },
  {
    // Discovered via Patch's own May 28 newsletter — they cite
    // mocoshow for the Burlington-replacing-Staples story at
    // 5557 Urbana Pike. Their feed has 25 items, mostly biz
    // openings + closings in Montgomery County, but with strong
    // Frederick-adjacent coverage (Urbana Pike, Riverview Plaza,
    // etc.) since that corridor straddles the line.
    id: "mocoshow",
    label: "MoCo Show",
    feedUrl: "https://mocoshow.com/feed/",
    homeUrl: "https://mocoshow.com/",
    accent: "var(--app-accent)",
  },
  {
    // WFMD 930 AM — Frederick's long-running local radio station.
    // Their /category/local-news/feed/ is a clean WordPress RSS with
    // Frederick-county-specific crime, court, politics, and business
    // stories (verified live 2026-05-28). The generic /feed/ has too
    // much national wire content from TownSquareMedia syndication; the
    // category-scoped URL is the correct endpoint.
    id: "wfmd",
    label: "WFMD",
    feedUrl: "https://wfmd.com/category/local-news/feed/",
    homeUrl: "https://wfmd.com/",
    accent: "var(--app-warm)",
  },
  // Patch itself is intentionally NOT here. As of May 2026 their
  // town-level RSS endpoints either 404 or return 0 items — they
  // distribute via newsletter, not RSS. Loader is source-agnostic,
  // so adding any of these back later is a one-line change.
  //
  // Weinberg Center and Delaplaine Arts do not publish news RSS feeds;
  // their events surface via the iCal feed path in ical-live.ts.
];
