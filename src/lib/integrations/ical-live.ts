/**
 * Runtime iCal feed fetcher — pulls live events from Frederick-county sources
 * WITHOUT a database. Used directly on the /events page server component
 * with an hour-long ISR cache.
 *
 * This is the no-DB path. Once Neon is wired, the cron-backed ingest job
 * (src/lib/ingest/ical.ts) takes over with deduplication + storage.
 */

import type { LngLat } from "@/lib/geo";
import { easternWallToUtcISO } from "@/lib/tz";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";

export type LiveEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  geom: LngLat;
  municipality: string;
  category: string;
  organizer: string;
  source: "dfp" | "celebrate" | "county" | "visit-frederick" | "weinberg" | "delaplaine";
  source_label: string;
  url: string;
  is_free: boolean;
};

type Feed = {
  source: LiveEvent["source"];
  source_label: string;
  url: string;
  default_venue: string;
  default_geom: LngLat;
  default_municipality: string;
  default_category: string;
};

type FeedFormat = "ical" | "rss";

type FeedSpec = Feed & { format: FeedFormat };

const FEEDS: FeedSpec[] = [
  {
    source: "celebrate",
    source_label: "Celebrate Frederick",
    url: "https://www.celebratefrederick.com/events/?ical=1",
    format: "ical",
    default_venue: "City of Frederick",
    default_geom: { lng: -77.4109, lat: 39.4137 },
    default_municipality: "frederick",
    default_category: "arts",
  },
  {
    source: "county",
    source_label: "Frederick County Government",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "Frederick County",
    default_geom: { lng: -77.4109, lat: 39.4143 },
    default_municipality: "frederick",
    default_category: "civic",
  },
];

const CATEGORY_KEYWORDS: Array<{ slug: string; words: string[] }> = [
  { slug: "music", words: ["concert", "band", "music", "dj", "open mic", "acoustic", "punch brothers", "alive @ five"] },
  { slug: "theater", words: ["theater", "play", "stage", "broadway", "show", "comedy", "weinberg"] },
  { slug: "gallery", words: ["art", "exhibit", "gallery", "first saturday", "first friday", "mural", "delaplaine"] },
  { slug: "market", words: ["market", "vendor", "farmers", "makers", "fair"] },
  { slug: "family", words: ["kids", "family", "children", "story time", "all ages", "scout", "youth"] },
  { slug: "outdoors", words: ["hike", "trail", "outdoor", "park", "ranger", "nature", "catoctin", "cunningham"] },
  { slug: "brewery", words: ["brewery", "beer", "tasting", "tap"] },
  { slug: "winery", words: ["wine", "winery", "vineyard", "linganore"] },
  { slug: "food", words: ["food truck", "dinner", "brunch", "tasting", "in the streets"] },
  { slug: "bar", words: ["trivia", "pub", "bar"] },
  { slug: "civic", words: ["council", "meeting", "public hearing", "town hall", "voting", "planning commission"] },
];

function inferCategory(title: string, description: string, fallback: string): string {
  const text = `${title} ${description}`.toLowerCase();
  for (const { slug, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return slug;
  }
  return fallback;
}

function inferMunicipality(address: string | undefined, fallback: string): string {
  if (!address) return fallback;
  const lower = address.toLowerCase();
  for (const m of MUNICIPALITIES) {
    if (lower.includes(m.name.toLowerCase())) return m.slug;
  }
  return fallback;
}

function categoryExists(slug: string, fallback: string): string {
  return CATEGORIES.some((c) => c.slug === slug) ? slug : fallback;
}

/**
 * P0-5 Option A: the Frederick County feed's category bears no relation
 * to the event, so county events get no category (and render no badge)
 * rather than a wrong one. Other feeds keep the keyword inference.
 * Option B (an LLM classifier at ingest) is a separate, paid change and
 * is intentionally not done here.
 */
export function feedCategory(feed: FeedSpec, title: string, description: string): string {
  if (feed.source === "county") return "";
  return categoryExists(
    inferCategory(title, description, feed.default_category),
    feed.default_category,
  );
}

type ICalEvent = {
  type?: string;
  summary?: string;
  description?: string;
  start?: Date | string | { toISOString: () => string };
  end?: Date | string | { toISOString: () => string };
  location?: string;
  uid?: string;
  url?: string;
};

function toDate(d: ICalEvent["start"] | ICalEvent["end"]): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  try {
    return new Date(d.toISOString());
  } catch {
    return null;
  }
}

function dedupeKey(title: string, starts: Date, venue: string): string {
  const day = starts.toISOString().slice(0, 10);
  const time = starts.toISOString().slice(11, 16);
  const normTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const normVenue = venue.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  return `${normTitle}-${normVenue}-${day}-${time}`;
}

/**
 * Stable, URL-safe slug for a live-feed event. Built from the same
 * title/venue/start signature as the cross-feed dedupe key, so it is
 * deterministic across refetches: the event detail route resolves a
 * shared /events/<slug> link by recomputing this over the current feed
 * window and matching. The dedupe key carries an HH:MM colon, so the
 * result is reduced to [a-z0-9-] (no percent-encoding ever needed). The
 * `live-` prefix keeps it disjoint from hand-authored seed slugs, which
 * the detail route always resolves first regardless.
 */
export function liveEventSlug(
  e: Pick<LiveEvent, "title" | "starts_at" | "venue_name">,
): string {
  const key = dedupeKey(e.title, new Date(e.starts_at), e.venue_name)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `live-${key}`;
}

// ────────────────────────────────────────────────────────────────────────
// Minimal hand-rolled iCal VEVENT parser. node-ical errors under
// Next/Turbopack runtime ("e.BigInt is not a function"). node-ical stays
// in place for the cron-based ingest at src/lib/ingest/ical.ts.
// ────────────────────────────────────────────────────────────────────────

function unfoldIcalLines(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    if (out.length && (line.startsWith(" ") || line.startsWith("\t"))) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseICalDate(value: string, params: Record<string, string>): Date | null {
  if (!value) return null;
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  if (Z === "Z") return new Date(Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S));
  // TZID values from the Frederick feeds (DFP, Celebrate, County) are
  // America/New_York. Resolve to the correct UTC instant instead of
  // treating the wall numbers as the server's local time.
  return new Date(easternWallToUtcISO(+Y, +Mo, +D, +H, +Mi, +S));
}

function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * The Frederick County CivicEngage RSS feed entity-encodes its HTML
 * markup (e.g. `&lt;strong&gt;Event date:&lt;/strong&gt; … &lt;br&gt;`),
 * so a bare `<[^>]+>` strip misses every tag and the entities surface
 * as literal text on the explorer cards and the live-event detail page.
 * Decode entities FIRST — `&amp;` before `&lt;`/`&gt;` so a doubly
 * entity-encoded `&amp;lt;` still collapses to `<` in a single pass —
 * then strip the now-real tags and collapse whitespace. Callers still
 * apply the 300-char cap afterwards. Used by both feed paths since any
 * entity-encoded feed (RSS or iCal) hits the same failure mode.
 */
export function cleanFeedText(raw: string): string {
  const decoded = raw
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&[lr]squo;/gi, "'")
    .replace(/&[lr]dquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ParsedVEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  url?: string;
  start?: Date;
  end?: Date;
};

function parseICalEvents(text: string): ParsedVEvent[] {
  const lines = unfoldIcalLines(text);
  const out: ParsedVEvent[] = [];
  let cur: ParsedVEvent | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) out.push(cur);
      cur = null;
    } else if (cur) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const head = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      const [key, ...rest] = head.split(";");
      const params: Record<string, string> = {};
      for (const p of rest) {
        const eq = p.indexOf("=");
        if (eq > -1) params[p.slice(0, eq)] = p.slice(eq + 1);
      }
      switch (key) {
        case "UID": cur.uid = value; break;
        case "SUMMARY": cur.summary = unescapeIcalText(value); break;
        case "DESCRIPTION": cur.description = unescapeIcalText(value); break;
        case "LOCATION": cur.location = unescapeIcalText(value); break;
        case "URL": cur.url = value; break;
        case "DTSTART": cur.start = parseICalDate(value, params) ?? undefined; break;
        case "DTEND": cur.end = parseICalDate(value, params) ?? undefined; break;
      }
    }
  }
  return out;
}

async function fetchIcalFeed(feed: FeedSpec, windowDays: number): Promise<LiveEvent[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "text/calendar, text/plain",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
       
      console.error(`[ical-live] ${feed.source}: HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
       
      console.error(`[ical-live] ${feed.source}: not iCal`);
      return [];
    }
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);

    const events: LiveEvent[] = [];
    for (const item of parseICalEvents(text)) {
      const start = item.start;
      if (!start || start < now || start > horizon) continue;
      const end = item.end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const title = (item.summary ?? "").trim();
      if (!title) continue;
      const description = (item.description ?? "").trim();
      const venue = (item.location ?? "").split(",")[0].trim() || feed.default_venue;
      const address = item.location ?? "";
      const inferredCategory = feedCategory(feed, title, description);

      events.push({
        id: item.uid ?? `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        description: cleanFeedText(description).slice(0, 300),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        venue_name: venue,
        address,
        geom: feed.default_geom,
        municipality: inferMunicipality(address, feed.default_municipality),
        category: inferredCategory,
        organizer: feed.source_label,
        source: feed.source,
        source_label: feed.source_label,
        url: item.url ?? feed.url,
        is_free: !/\$|\bticket\b|\bpaid\b|\bcover\b/i.test(`${title} ${description}`),
      });
    }
     
    console.log(`[ical-live] ${feed.source}: parsed ${events.length} events in window`);
    return events;
  } catch (err) {
     
    console.error(`[ical-live] ${feed.source} failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchRssFeed(feed: FeedSpec, windowDays: number): Promise<LiveEvent[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
       
      console.error(`[ical-live] ${feed.source}: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);

    const events: LiveEvent[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const pick = (tag: string) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        if (!r) return "";
        return r[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
      };
      const title = pick("title").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      const link = pick("link");
      const description = cleanFeedText(pick("description"));
      if (!title) continue;

      // Frederick County CivicEngage uses:
      //   <calendarEvent:EventDates> May 14, 2026 </calendarEvent:EventDates>
      //   <calendarEvent:EventTimes>10:30 AM - 02:00 PM</calendarEvent:EventTimes>
      //   <calendarEvent:Location>...</calendarEvent:Location>
      const eventDate = pick("calendarEvent:EventDates");
      const eventTimes = pick("calendarEvent:EventTimes");
      let start: Date | null = null;
      let end: Date | null = null;
      if (eventDate && eventTimes) {
        const timeMatch = eventTimes.match(/^(\d{1,2}:\d{2}\s*[APap][Mm])\s*-\s*(\d{1,2}:\d{2}\s*[APap][Mm])/);
        if (timeMatch) {
          start = new Date(`${eventDate} ${timeMatch[1]}`);
          end = new Date(`${eventDate} ${timeMatch[2]}`);
        } else {
          start = new Date(eventDate);
        }
      }
      if (!start || isNaN(start.getTime())) continue;
      if (start < now || start > horizon) continue;
      if (!end || isNaN(end.getTime())) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const venue = pick("calendarEvent:Location")
        .replace(/<br\s*\/?>/gi, ", ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || feed.default_venue;
      const address = venue;
      const inferredCategory = feedCategory(feed, title, description);

      events.push({
        id: `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        description: description.slice(0, 300),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        venue_name: venue,
        address,
        geom: feed.default_geom,
        municipality: inferMunicipality(address, feed.default_municipality),
        category: inferredCategory,
        organizer: feed.source_label,
        source: feed.source,
        source_label: feed.source_label,
        url: link || feed.url,
        is_free: !/\$|\bticket\b|\bpaid\b/i.test(`${title} ${description}`),
      });
    }
     
    console.log(`[ical-live] ${feed.source}: parsed ${events.length} RSS events in window`);
    return events;
  } catch (err) {
     
    console.error(`[ical-live] ${feed.source} RSS failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchFeed(feed: FeedSpec, windowDays: number): Promise<LiveEvent[]> {
  if (feed.format === "rss") return fetchRssFeed(feed, windowDays);
  return fetchIcalFeed(feed, windowDays);
}

export async function getLiveEvents(windowDays = 60): Promise<{
  events: LiveEvent[];
  sources_succeeded: string[];
  sources_failed: string[];
}> {
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f, windowDays).then((evts) => ({ feed: f, evts }))));

  // Deduplicate by composite key — same title + day + time + venue across feeds
  // means the same event cross-promoted (e.g. DFP and Celebrate Frederick both
  // list First Saturday).
  const seen = new Map<string, LiveEvent>();
  for (const { evts } of results) {
    for (const e of evts) {
      const start = new Date(e.starts_at);
      const key = dedupeKey(e.title, start, e.venue_name);
      if (!seen.has(key)) {
        seen.set(key, e);
      }
    }
  }

  const events = [...seen.values()].sort(
    (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
  );

  return {
    events,
    sources_succeeded: results.filter((r) => r.evts.length > 0).map((r) => r.feed.source),
    sources_failed: results.filter((r) => r.evts.length === 0).map((r) => r.feed.source),
  };
}

export const LIVE_FEEDS = FEEDS.map((f) => ({
  source: f.source,
  label: f.source_label,
  url: f.url,
}));
