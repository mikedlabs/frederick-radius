/**
 * Local news for Frederick County.
 * Pulls Google News RSS (free, no key) filtered to Frederick County–relevant queries.
 * Returns a small headline strip for Today.
 */

export type NewsHeadline = {
  title: string;
  source: string;
  url: string;
  published_at: string;
};

const QUERY = 'Frederick County Maryland OR "Frederick, Md."';
const ENDPOINT = `https://news.google.com/rss/search?q=${encodeURIComponent(QUERY)}&hl=en-US&gl=US&ceid=US:en`;

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function extract(tag: string, xml: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? stripCdata(m[1]) : "";
}

function parseItems(xml: string): NewsHeadline[] {
  const items: NewsHeadline[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null && items.length < 8) {
    const block = match[1];
    const title = extract("title", block);
    const link = extract("link", block);
    const pubDate = extract("pubDate", block);
    const source = extract("source", block) || "Google News";
    if (!title || !link) continue;
    items.push({
      title,
      source,
      url: link,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

export async function getLocalHeadlines(): Promise<NewsHeadline[]> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseItems(xml);
  } catch {
    return [];
  }
}
