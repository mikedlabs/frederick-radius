/**
 * Local news for Frederick County.
 *
 * Multiple Google News RSS queries (free, no key) — county-wide plus a
 * town-spread query so smaller municipalities actually surface — merged,
 * de-duplicated by headline, and sorted newest-first. Refreshed hourly.
 * No fabricated items: only what the feeds return.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isPromotedDataBuild } from "@/lib/data-release-mode";
import { cleanFeedText } from "@/lib/format/text";
import { createAbortDeadline, withDeadlineFallback } from "@/lib/promise-deadline";

export type NewsHeadline = {
  title: string;
  source: string;
  url: string;
  /** Publication time from RSS, never the time this feed was read. */
  published_at: string | null;
};

export type NewsHeadlinesResult = {
  items: NewsHeadline[];
  status: "available" | "partial" | "unavailable";
};

export const NEWS_FETCH_DEADLINE_MS = 2_500;

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

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "#text" in value) {
    return text(value["#text"]);
  }
  return "";
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
  // A 200 HTML error page is a failed feed, not evidence of no local news.
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid news RSS");
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (channel !== "" && (!channel || typeof channel !== "object")) {
    throw new Error("Missing RSS channel");
  }
  const rows: unknown[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item ? [channel.item] : [];
  const items: NewsHeadline[] = [];
  for (const row of rows.slice(0, 40)) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const rawTitle = cleanFeedText(text(entry.title));
    const link = text(entry.link);
    if (!rawTitle || !/^https?:\/\//i.test(link)) continue;
    const { title, source } = splitTitleSource(
      rawTitle, cleanFeedText(text(entry.source)) || "Google News",
    );
    const timestamp = Date.parse(text(entry.pubDate));
    items.push({
      title, source, url: link,
      // One missing/invalid item date must not discard its valid siblings.
      published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
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
// Applied once here so every consumer (Pulse and Today) is
// clean without each surface re-filtering.
const URL_ONLY_TITLE = /^\s*(?:https?:\/\/|www\.)/i;
// A spaceless "title" that is really a bare domain path ("marylandreporter.com/2025/…").
const BARE_DOMAIN_PATH = /^\S+\.[a-z]{2,}\/\S*$/i;
const OBITUARY_TITLE = /\bobituar(?:y|ies)\b|\bin memoriam\b|\bdeath notice/i;
const OBITUARY_SOURCE = /\blegacy\b|obituary\s*search|funeral home|funeral homes|mortuary/i;
const PROPERTY_LISTING_SOURCE =
  /\brealtor(?:\.com)?\b|\bzillow\b|\bredfin\b|\bhomes\.com\b|\btrulia\b/i;
const PROPERTY_LISTING_TITLE =
  /^\s*\d{1,6}\s+[A-Za-z0-9.' -]+\s+(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|ln|lane|ct|court|cir(?:cle)?|pike|way)\b/i;
const YEAR_IN_TITLE = /\b(20\d{2})\b/g;

/** True when a headline is real, publishable local news. Drops URL-only
 *  titles and obituary listings. Exported for the boundary test. */
export function isPublishableHeadline(
  h: Pick<NewsHeadline, "title" | "source">,
  now: Date = new Date(),
): boolean {
  const title = (h.title ?? "").trim();
  const source = (h.source ?? "").trim();
  if (!title) return false;
  if (URL_ONLY_TITLE.test(title)) return false;
  if (!/\s/.test(title) && BARE_DOMAIN_PATH.test(title)) return false;
  if (OBITUARY_TITLE.test(title)) return false;
  if (OBITUARY_SOURCE.test(source)) return false;
  if (PROPERTY_LISTING_SOURCE.test(source)) return false;
  if (PROPERTY_LISTING_TITLE.test(title)) return false;

  // Google News occasionally republishes an old government notice with a
  // fresh RSS timestamp. An explicit past year in the headline is strong
  // evidence that it is not a current Pulse item. Keep future-year planning
  // stories and headlines with no year.
  const currentYear = now.getUTCFullYear();
  for (const match of title.matchAll(YEAR_IN_TITLE)) {
    if (Number(match[1]) < currentYear) return false;
  }
  return true;
}

// Query matches are discovery candidates, not proof of a local story. In
// particular, the town-spread OR queries also return other states' towns.
const LOCAL_PLACES = String.raw`(?:Frederick(?: County)?|Thurmont|Brunswick|Walkersville|Middletown|Emmitsburg|Woodsboro|Mount Airy|New Market|Myersville|Burkittsville|Ijamsville|Urbana|Monrovia)`;
const OTHER_STATES = String.raw`(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)`;
const OTHER_STATE_PLACE = new RegExp(
  String.raw`\b${LOCAL_PLACES}(?:,\s*|\s+(?:in\s+)?)${OTHER_STATES}\b|\b${OTHER_STATES}(?:['’]s)?\s+${LOCAL_PLACES}\b|\b${LOCAL_PLACES},\s*(?:VA|CO|OK|NC|TX|SD)\b`, "i",
);
const PLACE_IN_MARYLAND = new RegExp(
  String.raw`\b${LOCAL_PLACES}(?:,\s*|\s+(?:in\s+)?)M(?:aryland|d\.?)\b|\bMaryland(?:['’]s)?\s+${LOCAL_PLACES}\b`, "i",
);
const DISTINCT_LOCAL_PLACE = /\b(?:Thurmont|Walkersville|Emmitsburg|Woodsboro|Myersville|Burkittsville|Ijamsville)\b/i;
const REGIONAL_LOCAL_ANCHOR = new RegExp(
  String.raw`\b${LOCAL_PLACES}\b|\b(?:Catoctin|Camp David|Carroll Creek|Baker Park|Hood College|Fort Detrick|Frederick Community College)\b`, "i",
);
const LOCAL_PUBLISHERS = new Set([
  "the frederick news-post", "frederick news-post", "wfmd",
  "the city of frederick, md (.gov)", "city of frederick", "frederick county",
  "frederick county government", "frederick county sheriff's office, md",
]);
const REGIONAL_PUBLISHERS = new Set([
  "dc news now", "wjla", "wusa9", "wtop", "wbal-tv", "wbal tv", "wbal",
  "wbal newsradio", "wypr", "fox 5 dc", "the baltimore sun", "baltimore sun",
  "maryland matters", "conduit street blog",
]);

function hasLocalNewsContext(headline: NewsHeadline): boolean {
  if (OTHER_STATE_PLACE.test(headline.title)) return false;
  // These are different Maryland towns; their names cannot establish scope.
  const withoutOtherTowns = headline.title.replace(/\b(?:Prince Frederick|East New Market)\b/gi, "");
  if (withoutOtherTowns !== headline.title && !REGIONAL_LOCAL_ANCHOR.test(withoutOtherTowns)) return false;
  const source = headline.source.toLowerCase().trim();
  if (LOCAL_PUBLISHERS.has(source)) return true;
  // A metaphorical comparison with Camp David says nothing about local impact.
  const title = withoutOtherTowns.replace(/\bCamp David[\s-]+(?:like|style)\b/gi, "");
  return PLACE_IN_MARYLAND.test(title) || DISTINCT_LOCAL_PLACE.test(title) ||
    (REGIONAL_PUBLISHERS.has(source) && REGIONAL_LOCAL_ANCHOR.test(title));
}

/** Corroboration is limited to a whole capitalized name-shaped title,
 * never a substring or a fuzzy subject match inside an action/profile. */
function personKey(title: string): string | null {
  if (!/^[\p{Lu}][\p{L}'’.-]*(?:\s+(?:[\p{Lu}][\p{L}'’.-]*|van|von|de|del|da|di|la|le)){1,5}$/u.test(title)) return null;
  const parts = title.toLowerCase().split(/\s+/).filter(Boolean);
  while (/^(?:jr\.?|sr\.?|ii|iii|iv)$/.test(parts.at(-1) ?? "")) parts.pop();
  return parts.length >= 2 ? `${parts[0]}|${parts.at(-1)}` : null;
}

function obituaryKeys(headlines: NewsHeadline[]): Set<string> {
  const keys = new Set<string>();
  for (const headline of headlines) {
    // The explicit obituary label must come from these same RSS responses.
    const name = headline.title.match(/^(.+?)\s+Obituary\b/i)?.[1]?.trim();
    const key = name ? personKey(name) : null;
    if (key) keys.add(key);
  }
  return keys;
}

/** Health-aware read of the existing four Google News RSS queries. */
export async function getLocalHeadlinesResult(): Promise<NewsHeadlinesResult> {
  if (isPromotedDataBuild()) return { items: [], status: "unavailable" };
  const feeds = await Promise.all(QUERIES.map(async (query) => {
    const deadline = createAbortDeadline(NEWS_FETCH_DEADLINE_MS);
    const fallback = { items: [] as NewsHeadline[], available: false };
    try {
      return await withDeadlineFallback((async () => {
        // The existing hourly cache remains unchanged. Cancellation also
        // covers a stalled response body, while the UI deadline is bounded
        // even if a transport does not honor AbortSignal.
        const response = await fetch(feedUrl(query), {
          signal: deadline.signal,
          next: { revalidate: 3600 },
        });
        if (!response.ok) return fallback;
        return { items: parseItems(await response.text()), available: true };
      })(), NEWS_FETCH_DEADLINE_MS, fallback);
    } finally {
      deadline.dispose();
    }
  }));

  const candidates = feeds.flatMap((feed) => feed.items);
  const corroboratedObituaries = obituaryKeys(candidates);
  const seen = new Set<string>();
  const merged: NewsHeadline[] = [];
  for (const headline of candidates) {
    if (!isPublishableHeadline(headline) || !hasLocalNewsContext(headline)) continue;
    const person = personKey(headline.title);
    if (person && corroboratedObituaries.has(person)) continue;
    const key = normTitle(headline.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(headline);
  }
  // Undated items remain readable without being promoted as fresh news.
  merged.sort((a, b) =>
    (b.published_at ? Date.parse(b.published_at) : -Infinity) -
    (a.published_at ? Date.parse(a.published_at) : -Infinity),
  );
  const available = feeds.filter((feed) => feed.available).length;
  return {
    items: merged.slice(0, 24),
    status: available === feeds.length ? "available" : available > 0 ? "partial" : "unavailable",
  };
}

/** Compatibility facade for the existing deck consumer. */
export async function getLocalHeadlines(): Promise<NewsHeadline[]> {
  return (await getLocalHeadlinesResult()).items;
}
