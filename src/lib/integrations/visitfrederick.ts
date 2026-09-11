/**
 * Visit Frederick (visitfrederick.org) -> activation-ready event facts from
 * the destination marketing organization's public events RSS feed.
 *
 * Visit Frederick runs on the Simpleview CMS. Its on-page events calendar is
 * a client-rendered widget backed by an authenticated REST API, but the same
 * data is published keyless at the standard Simpleview events RSS endpoint:
 *   GET https://www.visitfrederick.org/event/rss/
 * So discovery is "read the public feed", no token, no scraping of rendered
 * HTML. The feed carries ~30 active/upcoming listings. Radius uses only
 * factual fields (title, source link, date range, region, category, and free
 * status). Publisher prose and images are intentionally excluded unless
 * separate reuse permission is documented. The runtime and refresh worker
 * both fail closed unless VISIT_FREDERICK_FACTS_REUSE_APPROVED=1; the source
 * registry keeps this integration pending until that written permission is
 * recorded.
 *
 * Honest modelling of an imperfect feed:
 *   - DATES, NOT TIMES. The feed gives each listing a calendar date range
 *     (MM/DD/YYYY to MM/DD/YYYY) but no reliable start time (times appear, if
 *     at all, only as prose inside the blurb). So we anchor each event to noon
 *     Eastern on its start day and end-of-day Eastern on its last day rather
 *     than invent a clock time. A months-long exhibition still surfaces because
 *     the pipeline keeps anything whose ends_at is in the future
 *     (isUpcomingEvent), and the per-event implausible-time guard never fires
 *     on a noon anchor.
 *   - AREA GEOCODE. The feed has no per-event coordinates, only a region tag
 *     ("Downtown Frederick"). We place each event on that town's centroid, so
 *     eventGeoConfidence resolves to "area": it lists, it never claims a
 *     precise distance (the same contract every other live feed honours).
 *   - DEDUPE IS UPSTREAM. Visit Frederick re-lists events that already arrive
 *     via the county iCal, Ticketmaster (Frederick Keys), etc. We do not dedupe
 *     here; the unified assembly's content matcher + clean-slug map collapse the
 *     overlap (same title + same day -> one card).
 *
 * Once approved, confidence is `verified` (provenance
 * EVENT_SOURCE_REGISTRY["visit-frederick"]): the publisher's own event RSS,
 * with no partnership, affiliation, or endorsement implied. Usage remains
 * subject to the publisher's terms. Fully fail-soft: any network or parse
 * failure degrades to [], never throws into the events page. The pure parser
 * is exported for unit testing against a captured feed fixture, with no
 * network.
 */
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { easternWallToUtcISO } from "@/lib/tz";
import { isInsideFrederickCounty } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { createSingleFlight } from "@/lib/single-flight";
import { unstable_cache } from "next/cache";
import {
  eventAdapterFailed,
  eventAdapterOk,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";
import {
  isExactVisitFrederickFeedUrl,
  readStoredVisitFrederickSnapshot,
  VISIT_FREDERICK_FEED_URL,
  VISIT_FREDERICK_SNAPSHOT_FRESH_MS,
  VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS,
  visitFrederickFactsReuseApproved,
  visitFrederickSnapshotAgeMs,
} from "@/lib/integrations/visitfrederick-snapshot";

const FEED_URL = VISIT_FREDERICK_FEED_URL;
const FETCH_TIMEOUT_MS = 2_500;
const MAX_FEED_BYTES = 512 * 1_024;
const SOURCE_LABEL = "Visit Frederick";
const USER_AGENT = "FrederickRadius/1.0 (+https://frederickradius.app)";
const EVENT_IMAGE_HOST = "assets.simpleviewinc.com";

// Visit Frederick region tag (lower-cased) -> our municipality slug. The feed
// tags each listing with a region; map the ones that name a town we model,
// default to the county seat for everything else (county-wide / unmapped).
const REGION_TO_MUNICIPALITY: Record<string, string> = {
  "downtown frederick": "frederick",
  frederick: "frederick",
  brunswick: "brunswick",
  thurmont: "thurmont",
  middletown: "middletown",
  walkersville: "walkersville",
  emmitsburg: "emmitsburg",
  "new market": "new-market",
  "mount airy": "mount-airy",
  myersville: "myersville",
  woodsboro: "woodsboro",
  burkittsville: "burkittsville",
  rosemont: "rosemont",
  urbana: "urbana",
};

/**
 * Resolve the structured address locality on a Visit Frederick detail page to
 * the town scope users expect. The RSS region tags are often county-wide, so
 * rows for Brunswick or Middletown can arrive with the Frederick fallback even
 * though the event's JSON-LD names the correct locality. Only exact, known
 * locality names are accepted; an unfamiliar postal city keeps the RSS scope
 * rather than being guessed from a nearby centroid.
 */
function municipalityFromLocality(locality: unknown): string | undefined {
  if (typeof locality !== "string") return undefined;
  const normalized = locality
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized === "mt airy") return "mount-airy";
  return REGION_TO_MUNICIPALITY[normalized];
}

// Category classification, two-stage. Visit Frederick's OWN category tags are
// the most reliable signal (a human curator chose them), so map those first;
// fall back to a conservative title-keyword pass only when no tag matches.
//
// The keyword pass deliberately mirrors the proven iCal classifier's PHILOSOPHY
// (src/lib/ingest/ical.ts CATEGORY_KEYWORDS): first match wins; "pub"/"trivia"
// is a BAR, not a brewery; "tasting"/"wine" is food/drink, not a guessed
// brewery; a bare "workshop" is NOT family (adult craft classes exist); only an
// explicit museum/gallery word maps to arts/museum (a heritage FESTIVAL is
// community, not a museum). Default is "community" — an honest catch-all, never
// a guessed specific. This replaces an earlier single-haystack rule set that
// mislabelled pub trivia, wine tastings, and craft workshops.
const TAG_CATEGORY: Array<[RegExp, string]> = [
  [/live music/, "music"],
  [/minor league baseball|sports & games|^sports/, "sports"],
  [/farmers'? *market/, "market"],
  [/winer|brewer|distiller/, "brewery"],
  [/food truck|foodie|culinary/, "food"],
  [/arts? - visual|visual art|gallery/, "arts"],
  [/arts? - perform|performances?|theat/, "theater"],
  [/history & heritage|civil war|\bhistory\b|heritage|museum/, "museum"],
  [/outdoor|recreation/, "outdoors"],
  [/family friendly|\bfamily\b/, "family"],
];
const TITLE_KEYWORDS: Array<[RegExp, string]> = [
  [/\btrivia\b|\bpub\b|happy hour/i, "bar"],
  [/\bconcert\b|live music|open mic|alive\s*@?\s*five|\bband\b|\bdj\b/i, "music"],
  [/\btheat|\bplay\b|\bstage\b|comedy|\bopera\b/i, "theater"],
  [/farmers?\b.*market|makers?\b.*market/i, "market"],
  [/brewer|winer|distiller|tap(room| takeover)|beer release/i, "brewery"],
  [/\bmuseum\b|\bexhibit\b|\bgallery\b/i, "arts"],
  [/\bkids?\b|children|story time|all ages|\bfamily\b/i, "family"],
  [/\bhike\b|\btrail\b|\bnature\b|\branger\b/i, "outdoors"],
  [/\bkeys\b|baseball|\b5k\b|\brace\b/i, "sports"],
  [/food truck|\bdinner\b|\bbrunch\b|tasting|\bwine\b/i, "food"],
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function firstMatch(block: string, re: RegExp): string | undefined {
  return re.exec(block)?.[1];
}

/**
 * Visit Frederick publishes event-specific artwork through its Simpleview
 * account. Keep the adapter boundary narrow: an unexpected URL in RSS or
 * JSON-LD is discarded rather than becoming an arbitrary remote image.
 */
function visitFrederickEventImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(decodeEntities(value.trim()));
    if (
      url.protocol !== "https:" ||
      url.hostname !== EVENT_IMAGE_HOST ||
      !url.pathname.startsWith("/sv-frederick-county/image/fetch/")
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function eventImageFromJsonLd(value: unknown): string | undefined {
  if (typeof value === "string") return visitFrederickEventImage(value);
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const image = eventImageFromJsonLd(candidate);
      if (image) return image;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const image = value as Record<string, unknown>;
  return (
    eventImageFromJsonLd(image.contentUrl) ??
    eventImageFromJsonLd(image.url)
  );
}

/** All category tag values in one item block, decoded + trimmed + lower-cased. */
function categoriesOf(block: string): string[] {
  const out: string[] = [];
  const re = /<category>([\s\S]*?)<\/category>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(decodeEntities(m[1]).trim().toLowerCase());
  return out;
}

function pickMunicipality(cats: string[]): string {
  for (const c of cats) {
    const hit = REGION_TO_MUNICIPALITY[c];
    if (hit) return hit;
  }
  return "frederick";
}

function pickCategory(cats: string[], title: string): string {
  const tagHay = cats.join(" | "); // cats are already lower-cased + trimmed
  for (const [re, slug] of TAG_CATEGORY) if (re.test(tagHay)) return slug;
  for (const [re, slug] of TITLE_KEYWORDS) if (re.test(title)) return slug;
  return "community";
}

/** [year, month, day] from an MM/DD/YYYY string. */
function ymd(date: string): [number, number, number] | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!m) return null;
  return [Number(m[3]), Number(m[1]), Number(m[2])];
}

/**
 * Pure: normalize the Visit Frederick events RSS into LiveEvent[]. Exported so
 * a unit test can run it against a captured feed fixture with no network.
 * `now` stamps last_verified_at (injectable for deterministic tests).
 */
export function normalizeVisitFrederickRss(xml: string, now: Date = new Date()): LiveEvent[] {
  if (!xml || !xml.includes("<item")) return [];
  const out: LiveEvent[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(xml))) {
    const block = im[1];
    const rawTitle = firstMatch(block, /<title>([\s\S]*?)<\/title>/);
    const link = firstMatch(block, /<link>([\s\S]*?)<\/link>/)?.trim();
    const descRaw = firstMatch(block, /<description>([\s\S]*?)<\/description>/) ?? "";
    if (!rawTitle || !link) continue;
    const title = decodeEntities(rawTitle).trim();
    if (!title) continue;

    // Dates live in the scaffold BEFORE the <p> blurb (the blurb can carry its
    // own MM/DD or times we must not mistake for the event's range). Scan only
    // the head; first date = start, last = end (single-day items repeat it).
    const head = descRaw.split(/<p[\s>]/i)[0] ?? descRaw;
    const dates = head.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
    const start = ymd(dates[0] ?? "");
    const end = ymd(dates[dates.length - 1] ?? "") ?? start;
    if (!start || !end) continue; // no honest time anchor -> skip

    const starts_at = easternWallToUtcISO(start[0], start[1], start[2], 12, 0, 0);
    const ends_at = easternWallToUtcISO(end[0], end[1], end[2], 23, 59, 59);

    // Blurb: inner text of the first <p>, tags stripped, entities decoded.
    const blurb = firstMatch(descRaw, /<p[^>]*>([\s\S]*?)<\/p>/i) ?? "";
    const description = decodeEntities(blurb.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const heroImage = visitFrederickEventImage(
      firstMatch(descRaw, /<img\b[^>]*\bsrc=["']([^"']+)["']/i),
    );

    const cats = categoriesOf(block);
    const municipality = pickMunicipality(cats);
    const centroid = MUNICIPALITY_BY_SLUG[municipality]?.centroid;
    if (!centroid) continue; // unmapped slug: skip rather than guess a coord
    const idNum = /\/(\d+)\/?$/.exec(link)?.[1] ?? link;

    out.push({
      id: `vf-${idNum}`,
      title,
      description,
      starts_at,
      ends_at,
      // No clean venue field in the feed; the title often carries "… at <venue>"
      // which normalizeTitle handles downstream. Leave blank rather than fabricate.
      venue_name: "",
      address: "",
      // Town centroid -> eventGeoConfidence resolves to "area": lists, never
      // claims a precise distance.
      geom: { lng: centroid.lng, lat: centroid.lat },
      municipality,
      category: pickCategory(cats, title),
      organizer: SOURCE_LABEL,
      source: "visit-frederick",
      source_label: SOURCE_LABEL,
      url: link,
      is_free: cats.includes("free"),
      hero_image: heroImage,
      status: "scheduled" as const,
      last_verified_at: now.toISOString(),
    });
  }
  return out;
}

/** What a detail page's schema.org Event JSON-LD adds over the RSS row. */
export type VfDetail = {
  venue_name: string;
  address: string;
  /** Exact known locality from the detail page, never a nearest-town guess. */
  municipality?: string;
  /** Precise venue coordinate, only when finite AND inside the county. */
  geom: { lng: number; lat: number } | null;
  description: string;
  /** Event artwork published by Visit Frederick in schema.org JSON-LD. */
  hero_image?: string;
};

const LD_JSON_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Find the schema.org Event node in a parsed JSON-LD value (handles a bare
 *  object, an array of nodes, or an `@graph` wrapper). */
function asEventNode(parsed: unknown): Record<string, unknown> | null {
  const consider = (v: unknown): Record<string, unknown> | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const t = o["@type"];
    const isEvent =
      t === "Event" ||
      (Array.isArray(t) && t.includes("Event")) ||
      (typeof t === "string" && /(^|\W)Event$/.test(t));
    return isEvent ? o : null;
  };
  if (Array.isArray(parsed)) {
    for (const n of parsed) {
      const hit = consider(n);
      if (hit) return hit;
    }
    return null;
  }
  if (parsed && typeof parsed === "object") {
    const graph = (parsed as Record<string, unknown>)["@graph"];
    if (Array.isArray(graph)) {
      for (const n of graph) {
        const hit = consider(n);
        if (hit) return hit;
      }
    }
    return consider(parsed);
  }
  return null;
}

/**
 * Pure: extract venue/address/geo/description from a Visit Frederick detail
 * page's schema.org Event JSON-LD. Returns null when no usable Event block is
 * found. Never throws (a malformed JSON block is skipped). Exported for unit
 * testing against a captured fixture with no network.
 */
export function parseVisitFrederickDetail(html: string): VfDetail | null {
  if (!html) return null;
  LD_JSON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LD_JSON_RE.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // a non-JSON or HTML-bearing block: skip, never throw
    }
    const ev = asEventNode(parsed);
    if (!ev) continue;
    const loc = (ev.location ?? {}) as Record<string, unknown>;
    const addr = (loc.address ?? {}) as Record<string, unknown>;
    const geoRaw = (loc.geo ?? {}) as Record<string, unknown>;
    const lat = Number(geoRaw.latitude);
    const lng = Number(geoRaw.longitude);
    // Only adopt a coordinate we can vouch for: finite AND inside the county.
    const geom =
      Number.isFinite(lat) && Number.isFinite(lng) && isInsideFrederickCounty(lat, lng)
        ? { lng, lat }
        : null;
    const region = [addr.addressRegion, addr.postalCode]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      .join(" ");
    const address = [addr.streetAddress, addr.addressLocality, region]
      .map((p) => (typeof p === "string" ? p.trim() : p === region ? region : ""))
      .filter(Boolean)
      .join(", ");
    return {
      venue_name: typeof loc.name === "string" ? loc.name.trim() : "",
      address,
      municipality: municipalityFromLocality(addr.addressLocality),
      geom,
      description: typeof ev.description === "string" ? ev.description.trim() : "",
      hero_image: eventImageFromJsonLd(ev.image),
    };
  }
  return null;
}

function isXmlContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/rss+xml" ||
    mediaType === "application/xml" ||
    mediaType === "text/xml"
  );
}

export function isVisitFrederickRss(xml: string): boolean {
  const start = xml.replace(/^\uFEFF/, "").trimStart().slice(0, 1_024);
  return (
    /^(?:<\?xml\b[^>]*>\s*)?<rss\b/i.test(start) &&
    /<channel\b/i.test(xml) &&
    /<\/channel>\s*<\/rss>\s*$/i.test(xml.trim())
  );
}

export function visitFrederickFeedPayloadIsValid(
  xml: string,
  contentType: string | null,
  finalUrl: string,
): boolean {
  return (
    new TextEncoder().encode(xml).byteLength <= MAX_FEED_BYTES &&
    isXmlContentType(contentType) &&
    isExactVisitFrederickFeedUrl(finalUrl) &&
    isVisitFrederickRss(xml)
  );
}

async function readNativeFeedBody(res: Response): Promise<string | null> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    return null;
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let xml = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_FEED_BYTES) {
      await reader.cancel();
      return null;
    }
    xml += decoder.decode(value, { stream: true });
  }
  return xml + decoder.decode();
}

export type VisitFrederickNativeFeedResult =
  | { state: "ok"; xml: string }
  | {
      state: "recoverable" | "not-found" | "rejected";
      reason: string;
    };

/**
 * One bounded native read used only by the background refresh. Firecrawl is
 * deliberately absent from this function: paid recovery belongs only in the
 * authenticated scheduled job.
 */
export async function fetchVisitFrederickNativeFeed(): Promise<
  VisitFrederickNativeFeedResult
> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status >= 300 && res.status < 400) {
      return {
        state: "rejected",
        reason: "the publisher redirect was not followed",
      };
    }
    const finalUrl = res.url;
    if (!isExactVisitFrederickFeedUrl(finalUrl)) {
      return {
        state: "rejected",
        reason: "the publisher response did not remain on the reviewed feed URL",
      };
    }
    if (res.status === 404 || res.status === 410) {
      return { state: "not-found", reason: `HTTP ${res.status}` };
    }
    if (!res.ok) {
      const recoverable =
        res.status === 403 ||
        res.status === 408 ||
        res.status === 429 ||
        res.status >= 500;
      return {
        state: recoverable ? "recoverable" : "rejected",
        reason: `HTTP ${res.status}`,
      };
    }
    const xml = await readNativeFeedBody(res);
    if (
      xml === null ||
      !visitFrederickFeedPayloadIsValid(
        xml,
        res.headers.get("content-type"),
        finalUrl,
      )
    ) {
      return {
        state: "recoverable",
        reason: "the publisher returned an invalid RSS response",
      };
    }
    return { state: "ok", xml };
  } catch (err) {
    const timedOut =
      ctrl.signal.aborted ||
      (err instanceof Error && err.name === "AbortError");
    return {
      state: "recoverable",
      reason: timedOut
        ? `timed out after ${FETCH_TIMEOUT_MS}ms`
        : "the publisher could not be reached",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip fields covered by the publisher's content/image permission language.
 * Dates, title, category, location facts, and the attributed source link stay.
 */
export function factualVisitFrederickEvents(
  events: readonly LiveEvent[],
): LiveEvent[] {
  return events.map((event) => {
    const facts = { ...event };
    delete facts.hero_image;
    return { ...facts, description: "" };
  });
}

/**
 * Read the durable snapshot first. A fresh successful snapshot is healthy; an
 * older or last-attempt-failed snapshot is deliberately partial so the board
 * can keep useful rows without presenting stale-good data as live. Production
 * visitor requests never invoke Firecrawl.
 */
async function fetchVisitFrederickResultUncached(): Promise<
  EventAdapterResult<LiveEvent>
> {
  if (!visitFrederickFactsReuseApproved()) {
    return eventAdapterFailed();
  }
  const snapshot = await readStoredVisitFrederickSnapshot({
    cacheMode: "cache-first",
    timeoutMs: 1_500,
  });
  if (snapshot) {
    if (
      snapshot.lastAttemptStatus === "not-found" &&
      snapshot.events.length === 0
    ) {
      return eventAdapterFailed();
    }
    const ageMs = visitFrederickSnapshotAgeMs(snapshot);
    if (ageMs <= VISIT_FREDERICK_SNAPSHOT_MAX_STALE_MS) {
      const healthy =
        ageMs <= VISIT_FREDERICK_SNAPSHOT_FRESH_MS &&
        (snapshot.lastAttemptStatus === "ok-native" ||
          snapshot.lastAttemptStatus === "ok-firecrawl");
      return healthy
        ? eventAdapterOk(snapshot.events)
        : eventAdapterFailed(snapshot.events);
    }
    if (!snapshot.sourceFetchedAt) return eventAdapterFailed();
  }
  return eventAdapterFailed();
}

// Cache the adapter result so Today, Events, Map, and event resolution share
// one bounded Blob read per five minutes. This window is short enough that
// cached partial data cannot materially outlive the hard 24-hour stale limit.
// The background refresh also invalidates this tag after a durable write.
const fetchVisitFrederickOnce = createSingleFlight<
  "current",
  EventAdapterResult<LiveEvent>
>();
const fetchVisitFrederickCached = unstable_cache(
  () =>
    fetchVisitFrederickOnce(
      "current",
      fetchVisitFrederickResultUncached,
    ),
  [
    "visit-frederick-adapter-v2",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    process.env.VISIT_FREDERICK_FACTS_REUSE_APPROVED ?? "0",
  ],
  { revalidate: 300, tags: ["events", "visit-frederick"] },
);

export function fetchVisitFrederickResult(): Promise<
  EventAdapterResult<LiveEvent>
> {
  if (process.env.NODE_ENV === "test") {
    return fetchVisitFrederickOnce(
      "current",
      fetchVisitFrederickResultUncached,
    );
  }
  return fetchVisitFrederickCached();
}

/** Legacy data-only facade. Health-aware callers should use the Result form. */
export async function fetchVisitFrederick(): Promise<LiveEvent[]> {
  return (await fetchVisitFrederickResult()).items;
}
