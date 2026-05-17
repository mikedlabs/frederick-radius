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
function splitTitleSource(raw: string, fallback: string): { title: string; source: string } {
  const i = raw.lastIndexOf(" - ");
  if (i > 20 && i > raw.length - 60) {
    return { title: raw.slice(0, i).trim(), source: raw.slice(i + 3).trim() || fallback };
  }
  return { title: raw, source: fallback };
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
    const k = normTitle(h.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    merged.push(h);
  }
  merged.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
  return merged.slice(0, 24);
}
