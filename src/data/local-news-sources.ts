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
};

export const LOCAL_NEWS_SOURCES: LocalNewsSource[] = [
  {
    id: "frederick-news-post",
    label: "FNP",
    feedUrl: "https://www.fredericknewspost.com/search/?f=rss&t=article&l=25&s=start_time&sd=desc",
    homeUrl: "https://www.fredericknewspost.com/",
  },
  {
    id: "maryland-matters",
    label: "MD Matters",
    feedUrl: "https://www.marylandmatters.org/feed/",
    homeUrl: "https://www.marylandmatters.org/",
  },
  // Patch is intentionally NOT here. As of May 2026, Patch has no
  // working town-level RSS for Frederick MD: /maryland/frederick-md/
  // rss.xml 404s, /feeds/maryland/frederick-md.rss returns a valid
  // RSS envelope with 0 items, and the other obvious variants either
  // 404 or serve HTML. Their newsletter-only distribution model
  // means readers must subscribe via email (the URL you'd paste into
  // an RSS reader doesn't exist). If they ship a real town feed,
  // add it back here — the loader is source-agnostic.
];
