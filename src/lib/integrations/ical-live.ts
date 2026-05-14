/**
 * Runtime iCal feed fetcher — pulls live events from Frederick-county sources
 * WITHOUT a database. Used directly on the /events page server component
 * with an hour-long ISR cache.
 *
 * This is the no-DB path. Once Neon is wired, the cron-backed ingest job
 * (src/lib/ingest/ical.ts) takes over with deduplication + storage.
 */

import type { LngLat } from "@/lib/geo";
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

const FEEDS: Feed[] = [
  {
    source: "dfp",
    source_label: "Downtown Frederick Partnership",
    url: "https://downtownfrederick.org/upcoming-events?ical=1",
    default_venue: "Downtown Frederick",
    default_geom: { lng: -77.4109, lat: 39.4143 },
    default_municipality: "frederick",
    default_category: "arts",
  },
  {
    source: "celebrate",
    source_label: "Celebrate Frederick",
    url: "https://celebratefrederick.com/calendar-of-events?ical=1",
    default_venue: "City of Frederick",
    default_geom: { lng: -77.4109, lat: 39.4137 },
    default_municipality: "frederick",
    default_category: "arts",
  },
  {
    source: "county",
    source_label: "Frederick County Government",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
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

async function fetchFeed(feed: Feed, windowDays: number): Promise<LiveEvent[]> {
  try {
    const ical = await import("node-ical");
    const parsed = await ical.async.fromURL(feed.url);
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);

    const events: LiveEvent[] = [];
    for (const value of Object.values(parsed)) {
      const item = value as ICalEvent;
      if (item.type !== "VEVENT") continue;
      const start = toDate(item.start);
      if (!start || start < now || start > horizon) continue;
      const end = toDate(item.end) ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const title = (item.summary ?? "").trim();
      if (!title) continue;
      const description = (item.description ?? "").trim();
      const venue = (item.location ?? "").split(",")[0].trim() || feed.default_venue;
      const address = item.location ?? "";
      const inferredCategory = categoryExists(
        inferCategory(title, description, feed.default_category),
        feed.default_category,
      );

      events.push({
        id: item.uid ?? `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        description: description.replace(/<[^>]+>/g, "").slice(0, 300),
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
    return events;
  } catch {
    return [];
  }
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
