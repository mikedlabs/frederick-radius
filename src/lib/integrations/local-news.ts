import { XMLParser } from "fast-xml-parser";
import { LOCAL_NEWS_SOURCES, type LocalNewsSource } from "@/data/local-news-sources";

/**
 * Local news loader — fetches RSS / Atom from each configured source,
 * normalizes to a flat list of items, dedupes by canonical URL, sorts
 * newest-first, and caps the total. Used by the /now Local news rail.
 *
 * Why this stays simple:
 *   - No body content is ever stored or surfaced. Headlines + canonical
 *     URLs + source attribution + publish date only. Copyright safety
 *     comes from doing the minimum.
 *   - Per-source failures are silent. A 404 / DNS error / parse error
 *     for one source removes it from this run — the rail still renders
 *     with whatever else came back.
 *   - Fetches use Next's `revalidate: 1800` (30 min) cache rather than
 *     a custom in-memory store. The data does not change minute-to-
 *     minute and 30 min keeps source servers happy.
 *
 * If every source fails the loader returns []. Callers should hide the
 * rail entirely in that case — a blank "Local news" header would lower
 * trust, not raise it.
 */
export type LocalNewsItem = {
  title: string;
  url: string;
  source: LocalNewsSource;
  /** Epoch ms — used to sort newest-first and for relative time labels. */
  publishedAt: number;
};

type RssChannelItem = {
  title?: string | { "#text": string };
  link?: string | { "#text"?: string; "@_href"?: string };
  pubDate?: string;
  "dc:date"?: string;
  guid?: string | { "#text": string };
  updated?: string;
  published?: string;
};

type ParsedFeed = {
  rss?: { channel?: { item?: RssChannelItem | RssChannelItem[] } };
  feed?: { entry?: RssChannelItem | RssChannelItem[] };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

/**
 * Decode the HTML entities that RSS feeds routinely double-encode
 * in <title>. FNP and MD Matters both publish smart-quoted titles
 * as `&#8216;…&#8217;` because the RSS spec treats title as
 * plain-text-escaped, but downstream UIs that just render the
 * string see the raw entity instead of the glyph.
 *
 * Covers the named entities we actually see (amp/lt/gt/quot/apos)
 * plus the numeric / hex form used for fancy typography. Wider
 * decoders pull a whole library; this stays small because RSS
 * titles only contain the safe subset.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pickText(v: unknown): string {
  let raw = "";
  if (typeof v === "string") raw = v;
  else if (v && typeof v === "object" && "#text" in v) {
    const t = (v as { "#text"?: string })["#text"];
    raw = typeof t === "string" ? t : "";
  }
  return decodeEntities(raw);
}

function pickLink(v: RssChannelItem["link"]): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    return v["@_href"] ?? v["#text"] ?? "";
  }
  return "";
}

function pickDate(item: RssChannelItem): number {
  const candidates = [
    typeof item.pubDate === "string" ? item.pubDate : undefined,
    typeof item["dc:date"] === "string" ? item["dc:date"] : undefined,
    typeof item.published === "string" ? item.published : undefined,
    typeof item.updated === "string" ? item.updated : undefined,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

async function fetchOne(source: LocalNewsSource): Promise<LocalNewsItem[]> {
  try {
    const res = await fetch(source.feedUrl, {
      // Stay polite — server-fetch a feed with a recognizable UA so
      // publishers can identify and rate-limit us cleanly if they want.
      headers: {
        "User-Agent":
          "Frederick Radius RSS Reader (https://frederickradius.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      // Next-side cache — 30 min per source.
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml.trim().startsWith("<")) return [];
    const parsed = parser.parse(xml) as ParsedFeed;

    const rawItems =
      parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items
      .map((raw) => {
        const title = pickText(raw.title).trim();
        const url = pickLink(raw.link).trim();
        const publishedAt = pickDate(raw);
        if (!title || !url) return null;
        return { title, url, source, publishedAt };
      })
      .filter((x): x is LocalNewsItem => x !== null)
      // Drop items without timestamps — they'd sort to the bottom
      // unpredictably and clutter the rail.
      .filter((x) => x.publishedAt > 0);
  } catch {
    return [];
  }
}

/** Fetch + dedupe + sort + cap. Hides any source that errored. */
export async function getLocalNews(limit = 6): Promise<LocalNewsItem[]> {
  const all = (
    await Promise.all(LOCAL_NEWS_SOURCES.map((s) => fetchOne(s)))
  ).flat();

  // Dedupe by canonical URL (some sources cross-syndicate the same
  // story under slightly different paths — we still treat duplicates
  // as one item, keyed on full URL since path nuances matter).
  const seen = new Set<string>();
  const deduped: LocalNewsItem[] = [];
  for (const item of all) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  deduped.sort((a, b) => b.publishedAt - a.publishedAt);
  return deduped.slice(0, limit);
}
