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
import { cutAtWordBoundary } from "@/lib/slug";
import { isVenueStatusNonEvent, isNonPublicListing } from "@/lib/event-noise";
import {
  validateLiveEvent,
  resetFeedMetrics,
} from "@/lib/integrations/event-schema";
import { recordSnapshot } from "@/lib/integrations/feed-snapshot";
import { fetchTicketmasterMusic } from "@/lib/integrations/ticketmaster";
import { deriveEventStatus, stripStatusMarker, type EventStatus } from "@/lib/event-status";

// Phase 1.6: drop venue open-status entries that are not events.
// Default ON by owner directive (2026-05-16: "ship everything"). The
// predicate is conservative and unit-tested. Set
// RADIUS_EVENT_NOISE_FILTER=0 to disable (instant rollback).
const EVENT_NOISE_FILTER = process.env.RADIUS_EVENT_NOISE_FILTER !== "0";
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
  source: "dfp" | "celebrate" | "county" | "hood" | "visit-frederick" | "weinberg" | "delaplaine" | "ticketmaster" | "bandsintown";
  source_label: string;
  url: string;
  is_free: boolean;
  /** Lifecycle status — scheduled / cancelled / postponed. Derived
   *  from the iCal STATUS property or a title sniff at parse time. */
  status: EventStatus;
  /**
   * ISO date marking when this row was last pulled from its upstream
   * source. UI surfaces it as a freshness chip ("Verified · 2d ago")
   * so users can judge data age. For live feeds this is the fetch
   * time; for curated rows it is the editorial verification date.
   */
  last_verified_at: string;
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
    // Celebrate Frederick runs festivals + city events, not strictly
    // arts. "Community" lets keyword-less items land honestly while
    // the inference path still tags real arts events as "arts".
    default_category: "community",
  },
  {
    source: "county",
    source_label: "Frederick County Government",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "Frederick County",
    default_geom: { lng: -77.4109, lat: 39.4143 },
    default_municipality: "frederick",
    // Source-based defaulting was the bug: a Hood College "Spring
    // Family Day" or a county "Pancake Breakfast" doesn't become
    // civic just because the feed is municipal. The keyword inference
    // (CATEGORY_KEYWORDS above) still catches genuinely civic-titled
    // entries; everything else falls through to the honest "community"
    // catch-all.
    default_category: "community",
  },
  {
    // Hood College public Trumba calendar (license: public calendar,
    // per data/sources.yaml). Clean structured iCal — the safe,
    // license-clear way to add real-time campus events, vs. scraping
    // a blog. URL overridable so a calendar move needs no deploy.
    source: "hood",
    source_label: "Hood College",
    url:
      process.env.HOOD_CALENDAR_URL ||
      "https://www.trumba.com/calendars/hood-college-events.ics",
    format: "ical",
    default_venue: "Hood College",
    default_geom: { lng: -77.3997, lat: 39.4246 },
    default_municipality: "frederick",
    // Source-based defaulting was the bug: a Hood College "Spring
    // Family Day" or a county "Pancake Breakfast" doesn't become
    // civic just because the feed is municipal. The keyword inference
    // (CATEGORY_KEYWORDS above) still catches genuinely civic-titled
    // entries; everything else falls through to the honest "community"
    // catch-all.
    default_category: "community",
  },
];

const CATEGORY_KEYWORDS: Array<{ slug: string; words: string[] }> = [
  { slug: "music", words: ["concert", "band", "music", "dj", "open mic", "acoustic", "punch brothers", "alive @ five"] },
  { slug: "theater", words: ["theater", "play", "stage", "broadway", "show", "comedy", "weinberg"] },
  // Sports is checked early so a game beats the family/outdoors/market
  // fallbacks ("youth soccer at the park" is sports, not outdoors).
  // Tight, low-noise terms only (no bare "game"/"match").
  { slug: "sports", words: ["baseball", "basketball", "soccer", "lacrosse", "softball", "volleyball", "frederick keys", "blazers", "athletics", "tournament", "playoff", "doubleheader", "scrimmage", " vs ", "vs."] },
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



function dedupeKey(title: string, starts: Date, venue: string): string {
  const day = starts.toISOString().slice(0, 10);
  const time = starts.toISOString().slice(11, 16);
  const normTitle = cutAtWordBoundary(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 60);
  const normVenue = cutAtWordBoundary(venue.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 40);
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

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse a Frederick County CivicEngage feed date ("May 14, 2026") plus
 * an optional clock time ("5:30 PM") into the correct UTC instant.
 *
 * The feed publishes Eastern wall-clock times with no zone marker. A
 * bare `new Date("May 14, 2026 5:30 PM")` reads them in the server's
 * local zone (UTC in production), so every county event rendered four
 * hours early: a 5:30 PM hearing showed as 1:30 PM. This resolves the
 * wall time through America/New_York instead, the same way the iCal
 * path does. A date with no time anchors at midday so it cannot slip
 * to the wrong calendar day.
 */
export function parseCountyDateTime(dateStr: string, timeStr?: string): Date | null {
  const dm = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(dateStr.trim());
  if (!dm) return null;
  const month = MONTHS[dm[1].toLowerCase()];
  if (!month) return null;
  const day = Number(dm[2]);
  const year = Number(dm[3]);
  let hour = 12;
  let minute = 0;
  if (timeStr) {
    const tm = /(\d{1,2}):(\d{2})\s*([AaPp])[Mm]/.exec(timeStr.trim());
    if (tm) {
      hour = Number(tm[1]) % 12;
      if (/[Pp]/.test(tm[3])) hour += 12;
      minute = Number(tm[2]);
    }
  }
  return new Date(easternWallToUtcISO(year, month, day, hour, minute));
}

function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Split a raw feed LOCATION into a clean { venue, address }.
 *
 * Feeds are messy: iCal LOCATION may be `Venue\nStreet\nCity, ST ZIP`
 * (newlines), or `Venue, Street, City, ST ZIP` (commas), or just an
 * address with no proper venue (`12 E Church St.Frederick, MD 21701`),
 * or a CivicEngage HTML blob with `<br>` and entities. Without this
 * helper, the previous implementation took `location.split(",")[0]` and
 * leaked artifacts like "Carroll Creek AmphitheaterFrederick" or showed
 * a postal code as the venue.
 *
 * Strategy:
 *   1. Decode HTML entities + tags (handles CivicEngage and any RSS).
 *   2. Re-insert a separator at the run-together `wordCity, ST` seam
 *      (e.g. "AmphitheaterFrederick, MD" → "Amphitheater | Frederick, MD").
 *   3. Split on newlines OR commas to get ordered segments.
 *   4. Treat segments matching `City, ST [ZIP]` as address tail; the
 *      remaining first segment is the venue.
 *   5. If the venue segment STARTS with a number, it is a street, not
 *      a name — surface it as the venue only if no real name exists.
 *
 * Returns the cleaned venue string and the full normalized address.
 */
export function splitLocation(
  raw: string | undefined,
  fallback: string,
): { venue: string; address: string } {
  const decoded = cleanFeedText(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Re-insert a separator at the "wordCity, ST" seam. The city can
    // be one word ("Frederick") or several ("Point of Rocks", "Mount
    // Airy"), joined by spaces and the connectors "of" / "and". Only
    // fires when the suffix is ", ST" so real CamelCase venue names
    // (e.g. "McDonald's") are left alone.
    .replace(
      /([a-z\.])([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|of|and))*,\s*[A-Z]{2})/g,
      "$1\n$2",
    )
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!decoded) return { venue: fallback, address: "" };

  const segments = decoded
    .split(/\s*[\n,]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  // A "city tail" segment looks like "ST" or "ST ZIP" or "City ST ZIP".
  const isCityTail = (s: string) => /^[A-Z]{2}\s*\d{0,5}$/.test(s);
  // A "city-ish" segment is a single capitalized word — "Frederick",
  // "Brunswick", "Mount Airy" — that should not be promoted as a
  // venue. A proper venue name has more than one capitalized token
  // ("Carroll Creek Amphitheater"), an apostrophe ("Brewer's Alley"),
  // or a descriptor noun ("Theater", "Center", "Hall", "Park", etc.).
  const VENUE_NOUN = /\b(Theat(re|er)|Center|Centre|Hall|Park|Stage|Library|Museum|Brewery|Tavern|Pub|Cafe|Lodge|Church|Pavilion|Amphitheat(re|er)|Plaza|Square|Market|Inn|Hotel|Field|Court|Arena|Gallery|Garden|Farm|Vineyard|Winery|Distillery|School|College)\b/i;
  const isCityish = (s: string) =>
    /^[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|of|and)){0,3}$/.test(s) &&
    !VENUE_NOUN.test(s);
  const meaningful = segments.filter(
    (s, i) => !(i > 0 && (isCityTail(s) || isCityish(s))),
  );

  let venue = meaningful[0] || fallback;
  // If the first meaningful segment is itself a street (starts with a
  // number) AND there's a second segment that looks like a proper venue
  // name, prefer that as the venue. Otherwise the street IS the venue
  // (more informative than the bare city name).
  if (
    /^\d/.test(venue) &&
    meaningful[1] &&
    !/^\d/.test(meaningful[1]) &&
    !isCityish(meaningful[1])
  ) {
    venue = meaningful[1];
  }
  // Trim a trailing period left by patterns like "12 E Church St."
  venue = venue
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .slice(0, 120)
    .trim() || fallback;

  // Address keeps the comma-joined sequence so map/geocode hints still
  // work; trim trailing duplicate of the venue if the city tail is bare.
  const address = segments.join(", ");

  return { venue, address };
}

/**
 * Conservative "is this event free" heuristic. We only mark Free when
 * the title or description explicitly says so. Previously the default
 * was Free unless `$`, "ticket", "paid", or "cover" appeared — which
 * over-claimed Free for nearly every event in the feed.
 */
function isExplicitlyFree(blob: string): boolean {
  return /\b(free\s+admission|no\s+cover|free\s+event|admission\s+free|complimentary|free\s+to\s+attend|free\s+for\b|free\b)/i.test(
    blob,
  );
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
  /** iCal STATUS property (CONFIRMED / TENTATIVE / CANCELLED). */
  status?: string;
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
        case "STATUS": cur.status = value.trim(); break;
      }
    }
  }
  return out;
}

async function fetchIcalFeed(feed: FeedSpec, windowDays: number): Promise<LiveEvent[]> {
  // Reset per-source counts at the start of every pull so the admin
  // dashboard reflects the current fetch, not lifetime aggregates.
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "text/calendar, text/plain",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      // 410 (Gone) and 404 (Not Found) signal the calendar was
      // retired upstream — not an app error. Log as info so the
      // feed can come back without a code change but the noise
      // stays out of the error stream.
      if (res.status === 410 || res.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${res.status})`);
      } else {
        console.error(`[ical-live] ${feed.source}: HTTP ${res.status}`);
      }
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
      const rawTitle = (item.summary ?? "").trim();
      if (!rawTitle) continue;
      // Cancellation can arrive two ways — the iCal STATUS property or
      // a publisher editing the title ("... - CANCELLED"). Derive the
      // status from both, then strip a trailing marker so the title
      // doesn't shout what the badge already says.
      const status = deriveEventStatus(rawTitle, item.status);
      const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
      const description = (item.description ?? "").trim();
      const { venue, address } = splitLocation(item.location, feed.default_venue);
      const cleanedDesc = cleanFeedText(description).slice(0, 300);
      const inferredCategory = feedCategory(feed, title, description);

      const candidate = {
        id: item.uid ?? `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        status,
        description: cleanedDesc,
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
        is_free: isExplicitlyFree(`${title} ${cleanedDesc}`),
        last_verified_at: fetchedAt,
      };
      const validated = validateLiveEvent(candidate, feed.source);
      if (validated) events.push(validated);
    }

    console.log(`[ical-live] ${feed.source}: parsed ${events.length} events in window`);
    recordSnapshot(feed.source, events);
    return events;
  } catch (err) {

    console.error(`[ical-live] ${feed.source} failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchRssFeed(feed: FeedSpec, windowDays: number): Promise<LiveEvent[]> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      if (res.status === 410 || res.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${res.status})`);
      } else {
        console.error(`[ical-live] ${feed.source}: HTTP ${res.status}`);
      }
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
      const rawTitle = pick("title").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      const link = pick("link");
      const description = cleanFeedText(pick("description"));
      if (!rawTitle) continue;
      // RSS carries no STATUS field, so cancellation is title-sniffed.
      const status = deriveEventStatus(rawTitle);
      const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);

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
          start = parseCountyDateTime(eventDate, timeMatch[1]);
          end = parseCountyDateTime(eventDate, timeMatch[2]);
        } else {
          start = parseCountyDateTime(eventDate);
        }
      }
      if (!start || isNaN(start.getTime())) continue;
      if (start < now || start > horizon) continue;
      if (!end || isNaN(end.getTime())) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      const { venue, address } = splitLocation(
        pick("calendarEvent:Location"),
        feed.default_venue,
      );
      const inferredCategory = feedCategory(feed, title, description);

      const candidate = {
        id: `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        status,
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
        is_free: isExplicitlyFree(`${title} ${description}`),
        last_verified_at: fetchedAt,
      };
      const validated = validateLiveEvent(candidate, feed.source);
      if (validated) events.push(validated);
    }

    console.log(`[ical-live] ${feed.source}: parsed ${events.length} RSS events in window`);
    recordSnapshot(feed.source, events);
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
  // iCal/RSS feeds plus Ticketmaster live-music discovery, fetched in
  // parallel. Ticketmaster is inert ([]) without TICKETMASTER_API_KEY,
  // so this path is unchanged until that key is set. Both yield the
  // same LiveEvent shape, so they share the dedupe/filter/sort below.
  const [feedResults, ticketmasterEvents] = await Promise.all([
    Promise.all(
      FEEDS.map((f) =>
        fetchFeed(f, windowDays).then((evts) => ({ source: f.source, evts })),
      ),
    ),
    fetchTicketmasterMusic(),
  ]);

  // Ticketmaster has no window parameter; clamp its results to the same
  // horizon the feed fetchers honor so getLiveEvents(7) cannot surface a
  // concert three months out.
  const horizonMs = Date.now() + windowDays * 86_400_000;
  const results: Array<{ source: LiveEvent["source"]; evts: LiveEvent[] }> = [
    ...feedResults,
    {
      source: "ticketmaster",
      evts: ticketmasterEvents.filter(
        (e) => +new Date(e.starts_at) <= horizonMs,
      ),
    },
  ];

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

  const events = [...seen.values()]
    .filter(
      (e) =>
        !EVENT_NOISE_FILTER ||
        (!isVenueStatusNonEvent(e.title) && !isNonPublicListing(e.title)),
    )
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  return {
    events,
    sources_succeeded: results.filter((r) => r.evts.length > 0).map((r) => r.source),
    sources_failed: results.filter((r) => r.evts.length === 0).map((r) => r.source),
  };
}

export const LIVE_FEEDS = FEEDS.map((f) => ({
  source: f.source,
  label: f.source_label,
  url: f.url,
}));
