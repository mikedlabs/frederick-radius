/**
 * Local news for Frederick County.
 *
 * Multiple Google News RSS queries (free, no key) — county-wide plus a
 * town-spread query so smaller municipalities actually surface — merged,
 * de-duplicated by headline, and sorted newest-first. Refreshed hourly.
 * No fabricated items: only what the feeds return.
 */

export type NewsHeadline = {
  title: string;
  source: string;
  url: string;
  published_at: string;
};

// Each query becomes its own Google News RSS feed. County-wide first,
// then town-spread queries so Thurmont/Brunswick/etc. are not drowned
// out by city-of-Frederick stories.
const QUERIES = [
  "Frederick County Maryland",
  '"Frederick, Md." OR "Frederick, Maryland"',
  "Thurmont OR Brunswick OR Walkersville OR Middletown OR Emmitsburg OR Woodsboro Maryland",
  '"Mount Airy" OR "New Market" OR Myersville OR Burkittsville Maryland',
];
const feedUrl = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function extract(tag: string, xml: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? stripCdata(m[1]) : "";
}

// Google appends " - The Source" to RSS titles; split it back out.
// We're conservative: only split when the suffix looks like a publisher
// name (≤ 80 chars after the dash, no terminal punctuation) AND there's
// real headline before it (≥ 10 chars). Short-headline edge cases
// where the publisher *is* the news (e.g. "Early Voting Update — City
// of Frederick (.gov)") still get the source pulled off cleanly.
function splitTitleSource(raw: string, fallback: string): { title: string; source: string } {
  const i = raw.lastIndexOf(" - ");
  if (i < 10) return { title: raw, source: fallback };
  const suffix = raw.slice(i + 3).trim();
  if (suffix.length === 0 || suffix.length > 80) return { title: raw, source: fallback };
  if (/[.!?]$/.test(suffix)) return { title: raw, source: fallback };
  return { title: raw.slice(0, i).trim(), source: suffix || fallback };
}

function parseItems(xml: string): NewsHeadline[] {
  const items: NewsHeadline[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null && items.length < 40) {
    const block = match[1];
    const rawTitle = extract("title", block);
    const link = extract("link", block);
    const pubDate = extract("pubDate", block);
    const feedSource = extract("source", block);
    if (!rawTitle || !link) continue;
    const { title, source } = splitTitleSource(rawTitle, feedSource || "Google News");
    items.push({
      title,
      source,
      url: link,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ── Quality gate (boundary cleaning — never render-time) ──────────────
// Google News RSS occasionally surfaces items that aren't real local news
// and hurt the field-guide feel:
//   1. A title that is just a URL (a malformed feed item, e.g.
//      "https://marylandreporter.com/2025/10/25/freedom-bank-wins…") — we
//      don't fabricate a headline from a slug, we drop it.
//   2. Obituary / death-notice listings (Legacy.com syndication, "… Obituary
//      (1949 - 2026) - The Frederick News-Post", source "Legacy | Obituary
//      Search") — real to someone, but not civic news, and they crowd out
//      actual stories.
// Applied once here so every consumer (/pulse, /today LocalNewsStrip) is
// clean without each surface re-filtering.
const URL_ONLY_TITLE = /^\s*(?:https?:\/\/|www\.)/i;
// A spaceless "title" that is really a bare domain path ("marylandreporter.com/2025/…").
const BARE_DOMAIN_PATH = /^\S+\.[a-z]{2,}\/\S*$/i;
const OBITUARY_TITLE = /\bobituar(?:y|ies)\b|\bin memoriam\b|\bdeath notice/i;
const OBITUARY_SOURCE = /\blegacy\b|obituary\s*search/i;

/** True when a headline is real, publishable local news. Drops URL-only
 *  titles and obituary listings. Exported for the boundary test. */
export function isPublishableHeadline(
  h: Pick<NewsHeadline, "title" | "source">,
): boolean {
  const title = (h.title ?? "").trim();
  if (!title) return false;
  if (URL_ONLY_TITLE.test(title)) return false;
  if (!/\s/.test(title) && BARE_DOMAIN_PATH.test(title)) return false;
  if (OBITUARY_TITLE.test(title)) return false;
  if (OBITUARY_SOURCE.test((h.source ?? "").trim())) return false;
  return true;
}

export async function getLocalHeadlines(): Promise<NewsHeadline[]> {
  const feeds = await Promise.all(
    QUERIES.map(async (q) => {
      try {
        // Hourly: fresh without hammering the feed.
        const res = await fetch(feedUrl(q), { next: { revalidate: 3600 } });
        if (!res.ok) return [];
        return parseItems(await res.text());
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  const merged: NewsHeadline[] = [];
  for (const h of feeds.flat()) {
    // Drop URL-only titles + obituary listings at the boundary, before
    // dedupe + cap, so the 24 we keep are 24 real stories.
    if (!isPublishableHeadline(h)) continue;
    const k = normTitle(h.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    merged.push(h);
  }
  merged.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
  return merged.slice(0, 24);
}
