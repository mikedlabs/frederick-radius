/**
 * Official City and County releases. Only headline, original publication time,
 * publisher and canonical article link are republished, never bodies or photos.
 * The dedicated City news feed supplies normal updates. The wider City feed
 * retains dated civic notices as well as police/advisory coverage; County NewsFlash serves both.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { unstable_cache } from "next/cache";
import { CIVIC_PRESS_SOURCES, type CivicPressSource } from "@/data/civic-press-sources";
import { isPromotedDataBuild } from "@/lib/data-release-mode";
import { cleanFeedText } from "@/lib/format/text";
import { newsArticleUrl } from "@/lib/news-article-url";
import { createAbortDeadline, withDeadlineOutcome } from "@/lib/promise-deadline";
import { createSingleFlight } from "@/lib/single-flight";

export type CivicPressLane = "police" | "advisory" | "civic";
export type CivicPressItem = {
  title: string;
  url: string;
  source: "City of Frederick" | "Frederick County";
  sourceShort: "City" | "County";
  /** Exact subscription provenance; absent only in older compatibility rows. */
  sourceId?: CivicPressSource["id"];
  /** Original pubDate converted to ISO, or legacy zero for an unknown date. */
  publishedAt: string;
  lane: CivicPressLane;
};
export type CivicPressSourceCheck = {
  id: CivicPressSource["id"];
  source: CivicPressItem["source"];
  scope: "city" | "county";
  channel: "news" | "safety";
  status: "available" | "empty" | "unavailable";
  /** Actual response/attempt time, never the article publication time. */
  checkedAt: string | null;
  latestPublishedAt: string | null;
  reason?: "request_failed" | "invalid_feed" | "stale";
};
export type CivicPressResult = {
  items: CivicPressItem[];
  /** Compatibility health for the two broad feeds used by safety consumers. */
  sourceHealth: { degraded: boolean; unavailable: CivicPressItem["source"][] };
  /** Absent only in older cached/test compatibility results. */
  sourceChecks?: CivicPressSourceCheck[];
};
export type OfficialCivicNewsResult = {
  items: CivicPressItem[];
  status: "available" | "partial" | "unavailable";
  sources?: CivicPressSourceCheck[];
};

const POLICE_RE =
  /\b(police|sheriff|deput(?:y|ies)|arrest(?:ed|s)?|homicide|shoot(?:ing|s)?|stabb|robber|burglar|suspect|investigat|barrack|fugitive|amber alert|silver alert|standoff|pursuit|fatal|firearm|assault|wanted|in custody|charged|indict|missing (?:person|man|woman|teen|boy|girl|child|juvenile))\b/i;
const ADVISORY_RE =
  /\b(traffic advisory|road closure|road work|lane closure|detour|temporarily closed|to be closed|boil water|water main|shelter in place|evacuat|emergency|power outage|flooding|flood warning|severe weather|hazmat)\b/i;
const HOLIDAY_CLOSURE_RE = /\boffices?\s+closed\b/i;

export function classifyCivicPress(title: string): CivicPressLane {
  if (POLICE_RE.test(title)) return "police";
  if (ADVISORY_RE.test(title) && !HOLIDAY_CLOSURE_RE.test(title)) return "advisory";
  return "civic";
}

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const MAX_FEED_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 2_000;
const MAX_CHECK_AGE_MS = 60 * 60 * 1_000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const UNKNOWN_DATE = "1970-01-01T00:00:00.000Z";

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "#text" in value) return text(value["#text"]);
  return "";
}

/** Keep the supplied timezone. Ambiguous and implausible future dates stay unknown. */
function publicationTime(value: string, now: number): string {
  if (!/(?:GMT|UTC|UT|Z|[+-]\d{2}:?\d{2})$/i.test(value)) return UNKNOWN_DATE;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + FUTURE_TOLERANCE_MS
    ? new Date(timestamp).toISOString() : UNKNOWN_DATE;
}

function canonicalArticle(raw: string, feed: CivicPressSource): string | null {
  const valid = newsArticleUrl(raw);
  if (!valid) return null;
  const url = new URL(valid);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== feed.host || url.port) return null;
  // CivicPlus article identities are the numeric aid; subscription CID and
  // tracking parameters do not create another story or change its publisher.
  if (url.pathname.toLowerCase() === "/civicalerts.aspx") {
    const aid = [...url.searchParams].find(([name]) => name.toLowerCase() === "aid")?.[1];
    if (!aid || !/^\d+$/.test(aid)) return null;
    return `https://www.${feed.host}/CivicAlerts.aspx?aid=${aid}`;
  }
  url.protocol = "https:";
  url.hostname = `www.${feed.host}`;
  url.hash = "";
  return url.href;
}

function parseFeed(xml: string, feed: CivicPressSource, now: number): CivicPressItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid official RSS");
  }
  const channel: unknown = parser.parse(xml)?.rss?.channel;
  if (channel !== "" && (!channel || typeof channel !== "object" || Array.isArray(channel))) {
    throw new Error("Missing official RSS channel");
  }
  const entries = channel && typeof channel === "object" ? (channel as { item?: unknown }).item : undefined;
  const rows = Array.isArray(entries) ? entries : entries === undefined ? [] : [entries];
  const items: CivicPressItem[] = [];
  for (const row of rows.slice(0, 100)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const entry = row as Record<string, unknown>;
    const title = cleanFeedText(text(entry.title));
    const url = canonicalArticle(text(entry.link), feed);
    if (!title || title.length > 500 || !url) continue;
    const lane = classifyCivicPress(title);
    // The broad City feed also carries useful dated civic/recreation notices.
    // Their headline wording never turns them into a current incident claim.
    items.push({ title, url, source: feed.source, sourceShort: feed.short, sourceId: feed.id,
      publishedAt: publicationTime(text(entry.pubDate), now), lane });
  }
  return items;
}

async function readBoundedFeed(response: Response, signal: AbortSignal): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_FEED_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Official RSS exceeds byte limit");
  }
  if (!response.body) throw new Error("Empty official response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let value = "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error("Official RSS deadline");
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        abort();
        throw new Error("Official RSS exceeds byte limit");
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    if (signal.aborted) throw new Error("Official RSS deadline");
    return value + decoder.decode();
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

async function loadSource(feed: CivicPressSource): Promise<{ items: CivicPressItem[]; check: CivicPressSourceCheck }> {
  const deadline = createAbortDeadline(FETCH_TIMEOUT_MS);
  let reason: CivicPressSourceCheck["reason"] = "request_failed";
  const operation = (async () => {
    // The outer result cache owns the check timestamp. A second raw-response
    // cache could stamp a previously fetched XML response as a new check.
    const response = await fetch(feed.url, { signal: deadline.signal, cache: "no-store",
      headers: { "user-agent": "FrederickRadius/1.0 (+https://frederickradius.app)" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await readBoundedFeed(response, deadline.signal);
    reason = "invalid_feed";
    return parseFeed(xml, feed, Date.now());
  })();
  try {
    const outcome = await withDeadlineOutcome(operation, FETCH_TIMEOUT_MS);
    const items = outcome.status === "fulfilled" ? outcome.value : [];
    const dated = items.filter((item) => item.publishedAt !== UNKNOWN_DATE);
    const latestPublishedAt = dated.map((item) => item.publishedAt).sort().at(-1) ?? null;
    return { items, check: { id: feed.id, source: feed.source, scope: feed.scope, channel: feed.channel,
      status: outcome.status === "fulfilled" ? (items.length ? "available" : "empty") : "unavailable",
      checkedAt: new Date().toISOString(), latestPublishedAt,
      ...(outcome.status !== "fulfilled" ? { reason: outcome.status === "timed_out" ? "request_failed" as const : reason } : {}),
    } };
  } finally {
    deadline.dispose();
  }
}

async function loadCivicPressReleases(): Promise<CivicPressResult> {
  const feeds = await Promise.all(CIVIC_PRESS_SOURCES.map(loadSource));
  // Compatibility health deliberately follows the broad safety channels;
  // a failed City news subscription must not imply its police feed failed.
  const unavailable = feeds.filter((feed) => feed.check.id !== "city_official_news" && feed.check.status === "unavailable")
    .map((feed) => feed.check.source);
  const seen = new Set<string>();
  const items = feeds.flatMap((feed) => feed.items)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  return { items: items.slice(0, 40), sourceChecks: feeds.map((feed) => feed.check),
    sourceHealth: { degraded: unavailable.length > 0, unavailable } };
}

/** Same projection powers Today and Pulse; newsroom status is independent of safety. */
export function officialCivicNews(result: CivicPressResult, now = Date.now()): OfficialCivicNewsResult {
  const items = result.items.filter((item) => item.lane === "civic");
  if (!result.sourceChecks) {
    return { items, status: result.sourceHealth.unavailable.length === 2 ? "unavailable"
      : result.sourceHealth.degraded ? "partial" : "available" };
  }
  const sources = CIVIC_PRESS_SOURCES.map((feed): CivicPressSourceCheck => {
    const source = result.sourceChecks?.find((check) => check.id === feed.id) ?? {
      id: feed.id, source: feed.source, scope: feed.scope, channel: feed.channel,
      status: "unavailable", checkedAt: null, latestPublishedAt: null,
    };
    const checked = source.checkedAt ? Date.parse(source.checkedAt) : NaN;
    if (source.status !== "unavailable" && (!Number.isFinite(checked) || checked > now + FUTURE_TOLERANCE_MS || now - checked > MAX_CHECK_AGE_MS)) {
      return { ...source, status: "unavailable" as const, reason: "stale" as const };
    }
    return source;
  });
  const available = sources.filter((source) => source.status !== "unavailable").length;
  return { items, sources, status: available === CIVIC_PRESS_SOURCES.length ? "available" : available > 0 ? "partial" : "unavailable" };
}

const loadCivicPressOnce = createSingleFlight<"current", CivicPressResult>();
const getCivicPressReleasesCached = unstable_cache(
  () => loadCivicPressOnce("current", loadCivicPressReleases),
  ["civic-press-adapter-v4", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 900, tags: ["civic-press"] },
);

export function getCivicPressReleasesResult(): Promise<CivicPressResult> {
  if (isPromotedDataBuild()) {
    return Promise.resolve({ items: [], sourceHealth: { degraded: true, unavailable: ["City of Frederick", "Frederick County"] },
      sourceChecks: CIVIC_PRESS_SOURCES.map((feed) => ({ id: feed.id, source: feed.source, scope: feed.scope,
        channel: feed.channel, status: "unavailable", checkedAt: null, latestPublishedAt: null })),
    });
  }
  return process.env.NODE_ENV === "test" ? loadCivicPressOnce("current", loadCivicPressReleases) : getCivicPressReleasesCached();
}

/** Compatibility facade for existing user-facing surfaces. */
export async function getCivicPressReleases(): Promise<CivicPressItem[]> {
  return (await getCivicPressReleasesResult()).items;
}

/** Just the police-blotter releases, newest first. */
export function policeReleases(items: CivicPressItem[]): CivicPressItem[] {
  return items.filter((i) => i.lane === "police");
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const URGENT_POLICE_RE =
  /\b(amber alert|silver alert|missing (?:person|man|woman|teen|boy|girl|child|juvenile)|active shooter|shelter in place|evacuat|shoot(?:ing|s)?|stabb|homicide|armed suspect|standoff|hazmat|emergency|fatal crash)\b/i;
// The same urgent words also appear in routine public notices: active-shooter
// drills, shooting-range training, academy classes, and community meetings.
// These contexts fail closed unless the title also carries an incident action
// ("investigating", "arrested", "victim", etc.). A real public directive such
// as "shelter in place" remains eligible even when the title calls it an
// announcement.
const ROUTINE_EXERCISE_RE =
  /\b(shooting range|firearms? range|training|academy|drill|exercise|course|class|workshop|demonstration)\b/i;
const ROUTINE_COMMUNICATION_RE =
  /\b(meeting|open house|announcement|announc(?:e|es|ed|ing)|community event)\b/i;
const INCIDENT_ACTION_RE =
  /\b(investigat(?:e|es|ed|ing|ion)|respond(?:s|ed|ing)?|arrest(?:ed|s)?|charg(?:e|ed|es|ing)|victim|suspect|wounded|injured|killed|dead|fatal|wanted|in custody|seeks? (?:information|help))\b/i;
const PUBLIC_ACTION_RE =
  /\b(amber alert|silver alert|missing (?:person|man|woman|teen|boy|girl|child|juvenile)|shelter in place|evacuat|armed suspect|standoff|hazmat|fatal crash)\b/i;

/**
 * A prominent public-safety strip must be both urgent and fresh. Routine
 * police announcements, community events, and older releases stay in the
 * standing Police section instead of borrowing alert styling.
 */
export function featuredPoliceRelease(
  items: CivicPressItem[],
  now = Date.now(),
  maxAgeHours = 6,
): CivicPressItem | null {
  return policeReleases(items).find((item) => {
    if (!URGENT_POLICE_RE.test(item.title)) return false;
    const incidentAction = INCIDENT_ACTION_RE.test(item.title);
    if (ROUTINE_EXERCISE_RE.test(item.title) && !incidentAction) return false;
    if (
      ROUTINE_COMMUNICATION_RE.test(item.title)
      && !incidentAction
      && !PUBLIC_ACTION_RE.test(item.title)
    ) return false;
    const age = now - +new Date(item.publishedAt);
    return Number.isFinite(age) && age >= 0 && age <= maxAgeHours * HOUR_MS;
  }) ?? null;
}

/**
 * Recent advisory-lane releases (traffic / road closure / boil-water /
 * emergency), newest first. Road work persists for weeks, so the default
 * window is wider than police; each item still shows its post date so the
 * reader judges currency, and links to the source for the real dates.
 */
export function advisoryReleases(items: CivicPressItem[], maxAgeDays = 30): CivicPressItem[] {
  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  return items.filter((i) => i.lane === "advisory" && +new Date(i.publishedAt) >= cutoff);
}
