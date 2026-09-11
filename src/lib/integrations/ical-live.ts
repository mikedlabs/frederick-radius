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
import { cleanFeedText } from "@/lib/format/text";
import { cutAtWordBoundary } from "@/lib/slug";
import { isVenueStatusNonEvent, isNonPublicListing } from "@/lib/event-noise";
import {
  validateLiveEvent,
  resetFeedMetrics,
} from "@/lib/integrations/event-schema";
import { recordSnapshot } from "@/lib/integrations/feed-snapshot";
import { normalizeTitle, cleanDescription, clampDescription } from "@/lib/events/normalize";
import { fetchTicketmasterMusicResult } from "@/lib/integrations/ticketmaster";
import {
  eventAdapterFailed,
  eventAdapterIsDegraded,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";
import { deriveEventStatus, stripStatusMarker, type EventStatus } from "@/lib/event-status";
import { createSingleFlight } from "@/lib/single-flight";
import { createAbortDeadline } from "@/lib/promise-deadline";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  mapEventSourcesWithConcurrency,
  publicEventSourceCircuits,
} from "@/lib/integrations/event-source-circuit";
import { isEventWithinReadWindow } from "@/lib/events/visible";

// Phase 1.6: drop venue open-status entries that are not events.
// Default ON by owner directive (2026-05-16: "ship everything"). The
// predicate is conservative and unit-tested. Set
// RADIUS_EVENT_NOISE_FILTER=0 to disable (instant rollback).
const EVENT_NOISE_FILTER = process.env.RADIUS_EVENT_NOISE_FILTER !== "0";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";
import { unstable_cache } from "next/cache";
import {
  buildLiveEventCachePage,
  inflateCachedLiveEvent,
  liveEventCacheSourceState,
  type LiveEventCacheSourceState,
} from "@/lib/integrations/live-event-cache";

// Hard ceiling on a single feed fetch. These feeds normally answer in
// ~1s, but the /events render awaits all of them in parallel, so one
// hung upstream must not be able to hold the page hostage. Mirrors the
// Ticketmaster/Bandsintown abort pattern; on timeout the fetch rejects,
// the per-feed try/catch swallows it, and that source degrades to [].
const FEED_FETCH_TIMEOUT_MS = 8_000;
// County's CivicPlus RSS host is usually quick but occasionally crosses the
// five-second visitor budget. Public reads keep the shorter cutoff so a slow
// municipal host cannot hold an event page open. The isolated health probe
// already owns a fifteen-second outer deadline, so it can use the normal
// source budget and avoid recording a false outage for a merely slow refresh.
const COUNTY_PUBLIC_FEED_TIMEOUT_MS = 5_000;
// Google Calendar's Frederick Fair feed is currently about 3.2 MB once
// decoded. Next's Data Cache rejects any item over 2 MB, so raw calendar
// bodies must never be stored there. Five MB leaves real headroom for that
// feed while placing a hard ceiling on an upstream response before parsing.
const MAX_ICAL_SOURCE_BYTES = 5_000_000;
// MDCC's first-party Wix page currently weighs about 1.4 MB. Bound the HTML
// independently so an upstream template regression cannot make an event
// request read an arbitrarily large document into memory.
const MAX_WIX_HTML_SOURCE_BYTES = 3_000_000;
// Event providers are external, burst-sensitive services. Four concurrent
// source pulls keeps a cold board quick without opening twenty-plus sockets at
// once. The same load-shedding ceiling applies to data-health probes, while
// their cancellation and recovery semantics remain isolated from public
// circuit state.
const PUBLIC_EVENT_SOURCE_CONCURRENCY = 4;
const PUBLIC_EVENT_FETCH_HORIZON_DAYS = 90;

/**
 * Public reads participate in the visitor-facing resilience contract:
 * bounded fanout, circuit breaking, and stale-good fallback. Probe reads are
 * operational checks owned by data-health; they deliberately bypass both the
 * public circuit and the request-scoped warm-fill session so their answer
 * reflects the provider itself.
 */
export type LiveEventReadMode = "public" | "probe";

type LiveEventReadOptions = {
  signal?: AbortSignal;
  readMode?: LiveEventReadMode;
};

export type LiveEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  /** True for VALUE=DATE iCal events. starts_at is anchored to ET noon so the
   *  row lands on the right Eastern day; surfaces show "All day", not a clock. */
  is_all_day?: boolean;
  venue_name: string;
  address: string;
  geom: LngLat;
  /** Optional positional-precision hint for eventGeoConfidence. ABSENT on every
   *  existing source, so behaviour is unchanged: a town-centroid coord → "area",
   *  a precise non-centroid coord → "unknown" (lists, no distance). Set to
   *  "geocoded" ONLY when a row carries a distinct, vouched-for per-event
   *  coordinate (e.g. Visit Frederick detail-page JSON-LD geo, Frederick Keys
   *  stadium) so the card can show a real distance. */
  placement?: "geocoded" | "venue";
  municipality: string;
  category: string;
  organizer: string;
  source: "dfp" | "celebrate" | "county" | "hood" | "visit-frederick" | "weinberg" | "delaplaine" | "ticketmaster" | "bandsintown" | "seatgeek" | "eventbrite" | "fcpl" | "city-frederick" | "fair" | "mount-airy" | "thurmont" | "parks" | "heritage-frederick" | "monocacy" | "msd" | "mdcc" | "mount-st-marys" | "frederick-keys" | "isf" | "elc" | "civil-war-med" | "maryland-ensemble" | "catoctin" | "fcc";
  source_label: string;
  url: string;
  is_free: boolean;
  /** Real ticket floor when the source publishes one ("From $28").
   *  Ticketed feeds (Ticketmaster, SeatGeek) fetch this and previously
   *  threw it away; EventCard already renders it. Never guessed. */
  price_text?: string;
  /** Structured attendance semantics. Physical is the legacy default. */
  attendance_mode?: "physical" | "online" | "mixed";
  /** Direct join/registration/event page for online participation. */
  online_url?: string;
  /** Promo/artist image from ticketed feeds. EventCard already renders
   *  hero images; only sources that vouch for one set it. */
  hero_image?: string;
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
  /** Publisher-owned record modification time when the source exposes one. */
  publisher_updated_at?: string;
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

type FeedFormat =
  | "ical"
  | "rss"
  | "tribe"
  | "moderncampus"
  | "presence"
  | "vibemap"
  | "wix-html";

export type FeedSpec = Feed & {
  format: FeedFormat;
  /** tribe only: drop events whose venue.state isn't this (e.g. "MD" to keep
   *  a museum's DC-satellite events out of the county set). */
  only_state?: string;
  /** tribe only: drop title~=online rows (venue-less livestreams). */
  skip_online?: boolean;
};

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
    // Hood's old Trumba calendar 410'd; the live calendar moved to Brightly
    // "Active Calendar" (fetch-verified 2026-07-12: go.activecalendar.com/hood
    // /page/ical/ returns real Coffman Chapel events). Sparse in summer, fills
    // in the fall term. HOOD_CALENDAR_URL still overrides if it moves again.
    url: process.env.HOOD_CALENDAR_URL ?? "https://go.activecalendar.com/hood/page/ical/",
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
  // FCPL — Frederick County Public Libraries (8 branches) is NOT live-fetched:
  // its lc_calendar iCal is unbounded (measured 1,736 VEVENTs / 1.3MB / 16-23s,
  // and the adjust_range/current_date params do NOT narrow it), so it blows the
  // 8s FEED_FETCH_TIMEOUT 100% of the time — it timed out on every render and
  // delivered nothing (the "~200 events" estimate that wired it in was wrong; I
  // didn't measure the response time). It now rides the DAILY CRON-INGEST path
  // instead: /api/ingest/fcpl (9:15 UTC) parses the lc_calendar JSON
  // (frederick.librarycalendar.com/events/feed/json) into the ingested store,
  // horizon-capped + time-budgeted after the feed outgrew the run budget and
  // the cron died silently for two months (Jul 2026). The "fcpl" source key
  // above is the one that cron path uses.
  {
    // City of Frederick — official all-calendar (CivicPlus RSS, fetch-verified).
    // Biggest civic + rec volume for the city itself.
    source: "city-frederick",
    source_label: "City of Frederick",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "City of Frederick",
    default_geom: { lng: -77.4109, lat: 39.4137 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // The Great Frederick Fair + year-round fairgrounds events (public Google
    // Calendar iCal, fetch-verified). Single-DTSTART events parse; RRULE ones
    // don't (parser limitation) — acceptable.
    source: "fair",
    source_label: "The Great Frederick Fair",
    url: "https://calendar.google.com/calendar/ical/gffcal%40gmail.com/public/basic.ics",
    format: "ical",
    default_venue: "Frederick Fairgrounds",
    default_geom: { lng: -77.3884, lat: 39.4186 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Mount Airy — town calendar (CivicPlus RSS, fetch-verified). Festival /
    // community-rich gap-town win.
    source: "mount-airy",
    source_label: "Town of Mount Airy",
    url: "https://www.mountairymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "Mount Airy",
    default_geom: { lng: -77.1547, lat: 39.3762 },
    default_municipality: "mount-airy",
    default_category: "community",
  },
  {
    // Thurmont — town calendar (CivicPlus RSS, fetch-verified). NOTE: the
    // all-calendar mixes private pavilion rentals + trash/recycling notices in
    // with public events; the assembly's isPublicEvent / isUtilityEvent noise
    // gates must suppress those (verified after wiring).
    source: "thurmont",
    source_label: "Town of Thurmont",
    url: "https://www.thurmont.com/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "Thurmont",
    default_geom: { lng: -77.4108, lat: 39.6237 },
    default_municipality: "thurmont",
    default_category: "community",
  },
  {
    // Heritage Frederick (the Historical Society of Frederick County, 24 E Church
    // St) — its own Tribe iCal of history talks, walking tours, lectures, and
    // exhibit openings: ~20 future events, fetch-verified (200, text/calendar,
    // 0.2s, all at the downtown society building so the geo is honest). The
    // history-talk / insider-tour layer no aggregator carries. Single-DTSTART
    // events parse; RRULE ones don't (parser limit) — acceptable.
    source: "heritage-frederick",
    source_label: "Heritage Frederick",
    url: "https://frederickhistory.org/events/?ical=1",
    format: "ical",
    default_venue: "Heritage Frederick",
    default_geom: { lng: -77.4096, lat: 39.4146 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Monocacy Brewing (1781 N Market St) — its own Tribe iCal of taproom
    // happenings: the free "Fridays at the Fountain" summer live-music series,
    // food-truck nights, and beer releases. Fetch-verified (200, text/calendar,
    // real future SUMMARY/DTSTART). First-party brewery live-music wedge content.
    source: "monocacy",
    source_label: "Monocacy Brewing",
    url: "https://monocacybrewing.com/events/?ical=1",
    format: "ical",
    default_venue: "Monocacy Brewing",
    default_geom: { lng: -77.4093, lat: 39.4447 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Maryland School for the Deaf (101 Clarke Pl) — Edlio iCal, fetch-verified
    // (200, text/calendar, 105 VEVENTs with real 2026 dates). A Frederick-city
    // institution on no other municipal feed; robots allows the events feed.
    // Internal meetings lane to civic via classifyEvent; public events surface.
    source: "msd",
    source_label: "Maryland School for the Deaf",
    url: "https://www.msd.edu/apps/events/ical/",
    format: "ical",
    default_venue: "Maryland School for the Deaf",
    default_geom: { lng: -77.4180, lat: 39.4084 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Maryland Deaf Community Center — first-party Wix Events calendar.
    // Wix does not expose a stable public iCal/JSON endpoint here, but its
    // server-rendered events page includes the organizer-published event
    // records in wix-warmup-data. The parser retains the first-party event
    // links and media, and never infers a specific accessibility service.
    source: "mdcc",
    source_label: "Maryland Deaf Community Center",
    url: "https://www.deafmdcc.org/events",
    format: "wix-html",
    default_venue: "Maryland Deaf Community Center",
    default_geom: { lng: -77.4025511, lat: 39.4238076 },
    default_municipality: "frederick",
    default_category: "community",
  },
  // Mount St. Mary's University (Emmitsburg, calendar.msmary.edu campus-activities
  // .ics) is HELD: the calendar returns 200 to a plain curl but 403s the app's
  // server fetch (bot-blocked), so it would log a 403 and contribute nothing on
  // every render. The "mount-st-marys" source is kept in the enums for when a
  // reachable feed (or a proxy/UA fix) is found. Would fill the Emmitsburg gap.
  {
    // Frederick County Parks & Recreation (recreater.com, CivicPlus RSS,
    // fetch-verified). Ranger programs, rec classes, outdoor events; keyword
    // inference tags hikes/trails -> outdoors.
    source: "parks",
    source_label: "Frederick County Parks & Recreation",
    url: "https://www.recreater.com/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    format: "rss",
    default_venue: "Frederick County Parks & Recreation",
    default_geom: { lng: -77.4109, lat: 39.4143 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Delaplaine Arts Center (The Events Calendar / Tribe iCal, fetch-verified)
    // — downtown arts classes + exhibits.
    source: "delaplaine",
    source_label: "Delaplaine Arts Center",
    url: "https://delaplaine.org/events/?ical=1",
    format: "ical",
    default_venue: "Delaplaine Arts Center",
    default_geom: { lng: -77.4118, lat: 39.4146 },
    default_municipality: "frederick",
    default_category: "gallery",
  },
  {
    // Islamic Society of Frederick — public Google Calendar (fetch-verified
    // 2026-07-12: 147 VEVENTs incl. Juma, Eid festival, youth groups, full
    // LOCATION+DESCRIPTION). The county has 168 worship places and had ~zero
    // worship events; this is the first faith-community event feed.
    source: "isf",
    source_label: "Islamic Society of Frederick",
    url: "https://calendar.google.com/calendar/ical/c_c6114ad8fc9e85edfd02c33a366bc2b049ef9b8c41d8ddad0274956761a4a59f%40group.calendar.google.com/public/basic.ics",
    format: "ical",
    default_venue: "Islamic Society of Frederick",
    default_geom: { lng: -77.4432, lat: 39.4293 }, // 1250 Key Parkway
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Evangelical Lutheran Church (the downtown twin-spire landmark, 35 E
    // Church St) — FaithConnector iCal (fetch-verified 2026-07-12). Broad feed
    // (2011->2027); the in-window filter keeps only upcoming, and the parser
    // drops the RRULE-recurring internal meetings, leaving the dated public
    // events (book sale, VBS, concerts). Thin fields, so default_geom carries
    // the venue.
    source: "elc",
    source_label: "Evangelical Lutheran Church",
    url: "https://www.twinspires.org/gencal.cfm?event_category=All",
    format: "ical",
    default_venue: "Evangelical Lutheran Church",
    default_geom: { lng: -77.4099, lat: 39.4145 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // National Museum of Civil War Medicine (The Events Calendar REST,
    // fetch-verified 2026-07-12: 65 events, walking tours + living history).
    // The org runs a DC satellite (Clara Barton Missing Soldiers Office) whose
    // events share the feed, so only_state:"MD" keeps the county set clean.
    source: "civil-war-med",
    source_label: "National Museum of Civil War Medicine",
    url: "https://www.civilwarmed.org/wp-json/tribe/events/v1/events",
    format: "tribe",
    only_state: "MD",
    default_venue: "National Museum of Civil War Medicine",
    default_geom: { lng: -77.4088, lat: 39.4141 }, // 48 E Patrick St
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Maryland Ensemble Theatre (The Events Calendar REST, fetch-verified).
    // The feed leaves venue empty, so default_venue/geom carry the MET address;
    // skip_online drops its recurring venue-less Twitch comedy streams.
    source: "maryland-ensemble",
    source_label: "Maryland Ensemble Theatre",
    url: "https://marylandensemble.org/wp-json/tribe/events/v1/events",
    format: "tribe",
    skip_online: true,
    default_venue: "Maryland Ensemble Theatre",
    default_geom: { lng: -77.411, lat: 39.4146 }, // 31 W Patrick St
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Catoctin Land Trust (The Events Calendar REST, fetch-verified). Low
    // volume; events are the org's regardless of venue town, so no state
    // filter (an outing may meet at a partner site just over the county line).
    source: "catoctin",
    source_label: "Catoctin Land Trust",
    url: "https://catoctinlandtrust.org/wp-json/tribe/events/v1/events",
    format: "tribe",
    default_venue: "Catoctin Land Trust",
    default_geom: { lng: -77.4105, lat: 39.4143 },
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Frederick Community College — Modern Campus (Localist) public calendar
    // (fetch-verified 2026-07-12). The classic calendar.frederick.edu host is
    // dead (302 -> not-found); this pubcalendar API is the live replacement.
    // startDatetime is zone-less ET; the fetcher appends the ?start&end window.
    source: "fcc",
    source_label: "Frederick Community College",
    url: "https://api.calendar.moderncampus.net/pubcalendar/edb420ae-0d61-4c0c-90af-26e2dfad9adf/events",
    format: "moderncampus",
    default_venue: "Frederick Community College",
    default_geom: { lng: -77.4392, lat: 39.4568 }, // 7932 Opossumtown Pike
    default_municipality: "frederick",
    default_category: "community",
  },
  {
    // Mount St. Mary's University — Presence student-engagement API
    // (fetch-verified 2026-07-12: 68 events). The Mount's own
    // calendar.msmary.edu is static HTML with no export; this is the live
    // machine-readable source. startDateTimeUtc is absolute UTC. A few org
    // bus trips depart campus for off-county destinations; the Emmitsburg
    // default_geom is the honest "where you set out from."
    source: "mount-st-marys",
    source_label: "Mount St. Mary's University",
    url: "https://api.presence.io/msmary/v1/events",
    format: "presence",
    default_venue: "Mount St. Mary's University",
    default_geom: { lng: -77.3236, lat: 39.6473 }, // 16300 Old Emmitsburg Rd
    default_municipality: "emmitsburg",
    default_category: "community",
  },
  {
    // Downtown Frederick Partnership — the street-level downtown calendar
    // (owner ask 2026-07-19: "as i walk around downtown frederick, i see a
    // lot of events and things going on that arent mentioned on the app").
    // DFP's WordPress runs Vibemap: the vibemap_event post type is exposed
    // through the standard wp/v2 REST (fetch-verified 2026-07-19: 383 rows,
    // 153 in the 30-day window, per-event venue name + address + lat/lng +
    // real clock times; robots.txt allows). Their old Tribe iCal export is
    // dead — the site's page cache serves HTML for any ?ical=1 query — so
    // this REST read replaced it. The rows are DFP's curated downtown slice
    // synced from Visit Frederick, which also brings the tourism calendar's
    // downtown listings (Baker Park concerts, walking tours, taproom nights)
    // that no other wired feed carries.
    //
    // Placed LAST in the registry on purpose: many downtown venues (MET,
    // Delaplaine, Civil War Med) also publish first-party feeds above with
    // richer descriptions, and the cross-feed dedupe keeps the FIRST copy
    // it sees — specialist feeds should win those ties.
    source: "dfp",
    source_label: "Downtown Frederick Partnership",
    url: process.env.DFP_VIBEMAP_URL ?? "https://downtownfrederick.org/wp-json/wp/v2/vibemap_event",
    format: "vibemap",
    default_venue: "Downtown Frederick",
    default_geom: { lng: -77.4109, lat: 39.4137 },
    default_municipality: "frederick",
    // DFP events span community / arts / market / food across the year.
    // "community" is the honest fallback; the keyword inference tags
    // Alive @ Five → music, First Saturday → arts, etc.
    default_category: "community",
  },
  // NOTE on live-music venues (Tenth Ward, Monocacy, Bentztown, …):
  // their public Tribe iCal exports were evaluated here and rejected —
  // the shows are almost all RRULE-recurring (weekly trivia/music) and
  // this lightweight parser does not expand recurrence, so they resolve
  // to 0 in-window. Live-music venue events instead flow through the
  // working daily scraper (ingest-venues.yml → venue-events.json), which
  // reads the rendered calendars. The curated venue set lives in
  // src/data/live-music-venues.ts and is the source of truth for which
  // venues that scraper should target.
];

const CATEGORY_KEYWORDS: Array<{ slug: string; words: string[] }> = [
  // Fitness/recreation classes FIRST (first match wins): a rec-center
  // description like "a great workout with diverse music" or "utilizing
  // bands, light weights" otherwise substring-matches the music words, and
  // "Cardio Sculpt" rendered on the live-music radar (2026-07-17 review).
  { slug: "community", words: ["cardio", "zumba", "fitness class", "exercise", "workout", "pilates", "barre", "aerobics", "sculpt", "learn to"] },
  { slug: "music", words: ["concert", "band", "music", "dj", "open mic", "acoustic", "punch brothers", "alive @ five"] },
  // Sports is checked early so a game beats the family/outdoors/market
  // fallbacks ("youth soccer at the park" is sports, not outdoors).
  // Tight, low-noise terms only (no bare "game"/"match"/"play").
  { slug: "sports", words: ["baseball", "basketball", "soccer", "lacrosse", "softball", "volleyball", "tennis", "pickleball", "football", "golf tournament", "frederick keys", "blazers", "athletics", "tournament", "playoff", "doubleheader", "scrimmage", " vs ", "vs."] },
  // Bare "play", "stage", and "show" are intentionally excluded. They
  // misclassified phrases such as "tennis match play" as theater.
  { slug: "theater", words: ["theater", "theatre", "stage play", "stage production", "playwright", "broadway", "performing arts", "comedy", "weinberg"] },
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

function containsCategoryKeyword(text: string, keyword: string): boolean {
  const escaped = keyword
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!escaped) return false;
  // Category words describe concepts, not arbitrary substrings. The previous
  // `includes("art")` classified "Partner Hours" as a gallery event and
  // `includes("bar")` could classify "library" as nightlife. Word-aware
  // matching keeps phrases such as "first Saturday" while refusing those
  // accidental fragments.
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

function inferCategory(title: string, description: string, fallback: string): string {
  const text = `${title} ${description}`.toLowerCase();
  // Stage credits are stronger evidence than the generic word "music".
  // Do not promote every concert hosted at a theater into this category.
  if (/\bmusic\s+and\s+lyrics\s+by\b/.test(text) && /\bbook\s+by\b/.test(text)) {
    return "theater";
  }
  for (const { slug, words } of CATEGORY_KEYWORDS) {
    if (words.some((word) => containsCategoryKeyword(text, word))) return slug;
  }
  return fallback;
}

const RECURRING_WEEKDAY_RE =
  /\b(?:every|each|(?:the\s+)?(?:first|second|third|fourth|last|1st|2nd|3rd|4th))\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i;

const CADENCE_TITLE_STOP_WORDS = new Set([
  "about",
  "county",
  "frederick",
  "maryland",
  "event",
  "program",
  "the",
  "with",
]);

function cadenceSentenceBelongsToEvent(title: string, sentence: string): boolean {
  const titleTokens = title
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length >= 4 && !CADENCE_TITLE_STOP_WORDS.has(token)) ?? [];
  const sentenceTokens = new Set(sentence.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  if (titleTokens.some((token) => sentenceTokens.has(token))) return true;

  // "Partner Hours at Centro Hispano" is described as the team being "in
  // office on third Thursdays." The wording differs, but both clauses plainly
  // describe an office-hours program. Keep this semantic bridge narrow so a
  // festival description that merely mentions a venue's Tuesday office hours
  // cannot make the Saturday festival disappear.
  const titleIsHoursProgram =
    /\b(?:partner|office|service|business|drop-?in|walk-?in)\s+hours?\b|\bhours?\s+(?:at|with)\b/i.test(
      title,
    );
  const sentenceDescribesHoursProgram =
    /\b(?:office|hours?|walk-?ins?|availability|team\s+will\s+be)\b/i.test(
      sentence,
    );
  return titleIsHoursProgram && sentenceDescribesHoursProgram;
}

function statedRecurringWeekday(title: string, description: string): string | null {
  const titleWeekday = title.match(RECURRING_WEEKDAY_RE)?.[1];
  if (titleWeekday) return titleWeekday.toLowerCase();

  // Descriptions often contain unrelated venue schedules. Only trust a
  // cadence from the sentence that can be tied back to the event title.
  const sentences = description.split(/(?:\r?\n)+|(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const weekday = sentence.match(RECURRING_WEEKDAY_RE)?.[1];
    if (weekday && cadenceSentenceBelongsToEvent(title, sentence)) {
      return weekday.toLowerCase();
    }
  }
  return null;
}

/**
 * Some CivicPlus rows publish a concrete date that contradicts the cadence in
 * their own description (for example, a Tuesday date followed by "third
 * Thursdays"). Radius cannot choose which half is true, so the safest public
 * behavior is to quarantine that occurrence until the publisher corrects it.
 */
export function hasPublishedWeekdayConflict(
  title: string,
  description: string,
  startsAt: Date,
): boolean {
  const expected = statedRecurringWeekday(title, description);
  if (!expected || Number.isNaN(startsAt.getTime())) return false;
  const actual = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  })
    .format(startsAt)
    .toLowerCase();
  return actual !== expected;
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

type EventVenue = { venue: string; address: string };

/**
 * Correct narrow, first-party venue omissions without pretending a feed's
 * town-centroid coordinate is a precise event pin. CivicPlus sometimes sends
 * only "Frederick" in RSS even when the official event detail names a venue.
 */
export function resolveKnownEventVenue(
  source: FeedSpec["source"],
  title: string,
  location: EventVenue,
): EventVenue {
  if (
    source === "city-frederick" &&
    /^Friday Night Lights(?: Tennis)?(?:\s*[-:|].*)?$/i.test(title.trim())
  ) {
    // Official City event detail and court directory:
    // cityoffrederickmd.gov/Calendar.aspx?EID=22216
    // cityoffrederickmd.gov/675/Tennis-Court-Information
    return {
      venue: "Fleming Avenue Courts",
      address: "500 Fleming Avenue, Frederick, MD 21701",
    };
  }

  return location;
}



function dedupeKey(title: string, starts: Date, venue: string): string {
  const day = starts.toISOString().slice(0, 10);
  const time = starts.toISOString().slice(11, 16);
  const normTitle = cutAtWordBoundary(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 60);
  const normVenue = cutAtWordBoundary(venue.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 40);
  return `${normTitle}-${normVenue}-${day}-${time}`;
}

/**
 * Cross-feed dedupe key for a LIVE event, computed on the NORMALIZED title.
 * A feed often lists the same event both bare and org-prefixed (county RSS:
 * "Asia On The Creek" + "Asian American Center of Frederick-Asia on the
 * Creek"). normalizeTitle strips the "Org-Event" prefix and decodes/cleans —
 * the exact transform the card displays — so the two variants resolve to one
 * key and collapse. Exported so the behavior is unit-tested directly.
 */
export function liveEventDedupeKey(rawTitle: string, starts: Date, venue: string): string {
  return dedupeKey(normalizeTitle(rawTitle).title, starts, venue);
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
// Minimal hand-rolled iCal VEVENT parser. The old node-ical dependency failed
// under the bundled serverless runtime ("e.BigInt is not a function"), so both
// request-time and scheduled calendar reads now use runtime-safe parsers.
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

  // A location field that's actually a description dump must never become a
  // venue ("Description: Did you know…?" — the Bee City subcommittee leaked
  // exactly this). A real venue carries neither a metadata/content label nor
  // a question mark, so reject those and fall back to the feed's default.
  if (
    /\b(?:description|details|event\s+date|event\s+time)\s*:/i.test(venue) ||
    venue.includes("?")
  ) {
    return { venue: fallback, address: "" };
  }

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

// cleanFeedText moved to @/lib/format/text so the event normalization
// layer can reuse it without importing this network-heavy module.
// Imported locally for this module's own callers AND re-exported so
// existing importers and the feed-sanitize test keep resolving it here.
export { cleanFeedText };

type ParsedVEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  url?: string;
  start?: Date;
  end?: Date;
  /** True when DTSTART is a VALUE=DATE / 8-digit (date-only) value. */
  allDay?: boolean;
  /** iCal STATUS property (CONFIRMED / TENTATIVE / CANCELLED). */
  status?: string;
  /** iCal CATEGORIES values (comma-separated per line, may repeat). The
   *  publisher's own topical/audience words — feed them to the category
   *  keyword inference and the audience signals instead of dropping them. */
  categories?: string[];
  /** iCal GEO ("lat;lon") — a per-event coordinate. Rare, but when a feed
   *  publishes one it is more precise than the venue centroid. */
  geo?: { lat: number; lng: number };
};

/** Parse an iCal GEO value ("39.41;-77.41"). Null on anything malformed or
 *  outside plausible Frederick County bounds — a bad GEO must never move an
 *  event off its venue centroid. */
function parseICalGeo(value: string): { lat: number; lng: number } | null {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  // Frederick County envelope (same bounds the ticketed adapters enforce).
  if (lat < 39.2 || lat > 39.75 || lng < -77.75 || lng > -77.05) return null;
  return { lat, lng };
}

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
        case "DTSTART":
          cur.start = parseICalDate(value, params) ?? undefined;
          // VALUE=DATE / YYYYMMDD = all-day. Remember it: the candidate will
          // anchor to ET noon (UTC midnight is the prior evening in ET, which
          // listed the row a day early with a fabricated ~8 PM time).
          cur.allDay = params.VALUE === "DATE" || /^\d{8}$/.test(value);
          break;
        case "DTEND": cur.end = parseICalDate(value, params) ?? undefined; break;
        case "STATUS": cur.status = value.trim(); break;
        case "CATEGORIES":
          cur.categories = [
            ...(cur.categories ?? []),
            ...value
              .split(",")
              .map((part) => unescapeIcalText(part).trim())
              .filter(Boolean),
          ];
          break;
        case "GEO":
          cur.geo = parseICalGeo(value) ?? undefined;
          break;
      }
    }
  }
  return out;
}

type FeedFetchResult = {
  events: LiveEvent[];
  ok: boolean;
  /** Caller-owned cancellation is not evidence that the provider failed. */
  aborted?: boolean;
};
type RawIcalResponse = {
  ok: boolean;
  status: number;
  text: string;
};

function reportFeedUnavailable(
  feed: FeedSpec,
  detail: string,
): void {
  const message = `[ical-live] ${feed.source}: unavailable this refresh (${detail}; fail-soft)`;
  // The County CivicPlus host regularly refuses or times out on server-side
  // connections. That is an upstream availability state, not an application
  // exception. `sources_failed` remains the authoritative health signal and
  // the data-health cron turns it into an owner alert; keep the runtime line
  // informational so expected unavailability does not bury real errors.
  if (feed.source === "county") {
    console.info(message);
    return;
  }
  console.warn(message);
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`calendar body exceeded ${maxBytes} bytes`);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`calendar body exceeded ${maxBytes} bytes`);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }

  return text + decoder.decode();
}

// Coalesce concurrent cold event-cache fills inside one worker. The raw body
// is intentionally short-lived:
// only the compact parsed event arrays are persisted by the surrounding
// unstable_cache wrappers.
const fetchRawIcalOnce = createSingleFlight<string, RawIcalResponse>();

async function fetchRawIcalWork(
  feed: FeedSpec,
  parentSignal?: AbortSignal,
): Promise<RawIcalResponse> {
  const deadline = createAbortDeadline(
    FEED_FETCH_TIMEOUT_MS,
    parentSignal,
  );
  try {
    const response = await fetch(feed.url, {
      signal: deadline.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "text/calendar, text/plain",
      },
      // Raw public calendars can exceed Vercel/Next's 2 MB Data Cache item
      // ceiling. Cache the parsed, windowed result instead of this body.
      cache: "no-store",
    });
    return {
      ok: response.ok,
      status: response.status,
      text: response.ok
        ? await readBoundedText(response, MAX_ICAL_SOURCE_BYTES)
        : "",
    };
  } finally {
    deadline.dispose();
  }
}

async function fetchRawIcal(
  feed: FeedSpec,
  parentSignal?: AbortSignal,
): Promise<RawIcalResponse> {
  // An abortable operational probe must own its request. Sharing it with a
  // public/cache fill would let the health route cancel an unrelated caller.
  // Ordinary non-abortable callers retain the cold-fill single-flight.
  if (parentSignal) {
    return fetchRawIcalWork(feed, parentSignal);
  }
  return fetchRawIcalOnce(feed.url, () => fetchRawIcalWork(feed));
}

async function fetchIcalFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
): Promise<FeedFetchResult> {
  // Reset per-source counts at the start of every pull so the admin
  // dashboard reflects the current fetch, not lifetime aggregates.
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  try {
    const raw = await fetchRawIcal(feed, parentSignal);
    if (!raw.ok) {
      // 410 (Gone) and 404 (Not Found) signal the calendar was
      // retired upstream — not an app error. Log as info so the
      // feed can come back without a code change but the noise
      // stays out of the error stream.
      if (raw.status === 410 || raw.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${raw.status})`);
      } else {
        console.warn(`[ical-live] ${feed.source}: HTTP ${raw.status} (fail-soft, skipped)`);
      }
      return { events: [], ok: false };
    }
    const text = raw.text;
    if (!text.includes("BEGIN:VCALENDAR")) {

      console.warn(`[ical-live] ${feed.source}: not iCal (fail-soft, skipped)`);
      return { events: [], ok: false };
    }
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);

    const events: LiveEvent[] = [];
    for (const item of parseICalEvents(text)) {
      const start = item.start;
      if (!start) continue;
      const allDay = item.allDay === true;
      // All-day VEVENTs parse to UTC midnight = the prior evening in ET, so
      // they listed a day early with a fabricated ~8 PM time. Re-anchor to ET
      // NOON of the date's Y/M/D so the row lands on the correct Eastern day
      // with no misleading clock; the window filter uses that real instant.
      const startsAtISO = allDay
        ? easternWallToUtcISO(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 12, 0)
        : start.toISOString();
      const effectiveStart = new Date(startsAtISO);
      const endsAtISO = allDay
        ? easternWallToUtcISO(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 23, 59)
        : (item.end ?? new Date(effectiveStart.getTime() + 2 * 60 * 60 * 1000)).toISOString();
      if (!isEventWithinReadWindow(
        { starts_at: startsAtISO, ends_at: endsAtISO, is_all_day: allDay },
        now,
        horizon,
      )) continue;
      const rawTitle = (item.summary ?? "").trim();
      if (!rawTitle) continue;
      // Cancellation can arrive two ways — the iCal STATUS property or
      // a publisher editing the title ("... - CANCELLED"). Derive the
      // status from both, then strip a trailing marker so the title
      // doesn't shout what the badge already says.
      const status = deriveEventStatus(rawTitle, item.status);
      const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
      const description = (item.description ?? "").trim();
      const { venue, address } = resolveKnownEventVenue(
        feed.source,
        title,
        splitLocation(item.location, feed.default_venue),
      );
      // cleanDescription runs cleanFeedText AND strips dumped "Event date:
      // … Time: … Location:" metadata at the live source (see normalize.ts).
      const cleanedDesc = clampDescription(cleanDescription(description), 300);
      // The publisher's own CATEGORIES words join the keyword inference input
      // (same mechanism, one more honest signal) — a "Music" or "Kids" tag a
      // feed took the trouble to publish should count.
      const categoriesText = (item.categories ?? []).join(" ");
      const inferredCategory = feedCategory(
        feed,
        title,
        categoriesText ? `${description} ${categoriesText}` : description,
      );

      const candidate = {
        id: item.uid ?? `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        status,
        description: cleanedDesc,
        starts_at: startsAtISO,
        ends_at: endsAtISO,
        is_all_day: allDay,
        venue_name: venue,
        address,
        // A published per-event GEO (bounds-checked) beats the venue
        // centroid and earns the "geocoded" placement so cards may show a
        // real distance; absent one, behaviour is unchanged.
        geom: item.geo ? { lng: item.geo.lng, lat: item.geo.lat } : feed.default_geom,
        ...(item.geo ? { placement: "geocoded" as const } : {}),
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
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    // Expected fail-soft: an unreliable upstream feed timed out / refused. We
    // return [] and the page degrades gracefully, so this is a WARNING, not an
    // error — logging it as error drowned real errors in the Vercel dashboard
    // (~1,400 of these in 7 days). Keep it visible, just not as an "error".
    console.warn(
      `[ical-live] ${feed.source} ${aborted ? `timed out (>${FEED_FETCH_TIMEOUT_MS}ms)` : "failed"} (fail-soft, skipped):`,
      err instanceof Error ? err.message : err,
    );
    return { events: [], ok: false };
  }
}

async function fetchRssFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
  timeoutOverrideMs?: number,
): Promise<FeedFetchResult> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  // CivicPlus' county host has produced 10-second connect timeouts in
  // production. Stop before the platform socket timeout so the caught,
  // health-aware fallback wins and no RSC request inherits a runtime error.
  const timeoutMs =
    timeoutOverrideMs ??
    (feed.source === "county"
      ? COUNTY_PUBLIC_FEED_TIMEOUT_MS
      : FEED_FETCH_TIMEOUT_MS);
  const deadline = createAbortDeadline(timeoutMs, parentSignal);
  try {
    const res = await fetch(feed.url, {
      signal: deadline.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)" },
      // Cache the parsed event set at the source-page/unified boundary below.
      // A second fetch-level SWR cache can return a stale body while its hidden
      // refresh outlives the route; a connection failure then rejects Next's
      // response waitUntil after the handler has already produced a 200.
      cache: "no-store",
    });
    if (!res.ok) {
      reportFeedUnavailable(feed, `HTTP ${res.status}`);
      return { events: [], ok: false };
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
      if (hasPublishedWeekdayConflict(title, description, start)) {
        console.warn(
          `[ical-live] ${feed.source}: skipped an event whose published date conflicts with its stated weekday (${title})`,
        );
        continue;
      }
      if (!end || isNaN(end.getTime())) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      if (!isEventWithinReadWindow(
        { starts_at: start.toISOString(), ends_at: end.toISOString() },
        now,
        horizon,
      )) continue;

      const { venue, address } = resolveKnownEventVenue(
        feed.source,
        title,
        splitLocation(
          pick("calendarEvent:Location"),
          feed.default_venue,
        ),
      );
      const inferredCategory = feedCategory(feed, title, description);

      const candidate = {
        id: `${feed.source}:${dedupeKey(title, start, venue)}`,
        title,
        status,
        // This path previously stored the RAW description (no clean at all);
        // route it through the same boundary strip as path 1.
        description: clampDescription(cleanDescription(description), 300),
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
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    reportFeedUnavailable(
      feed,
      aborted
        ? `RSS timed out after ${timeoutMs}ms`
        : `RSS ${err instanceof Error ? err.message : String(err)}`,
    );
    return { events: [], ok: false };
  } finally {
    deadline.dispose();
  }
}

// Cache the COUNTY ADAPTER RESULT, including a timeout/failure. Next's fetch
// cache retains successful bodies but not connection failures, so the same
// unavailable CivicPlus host was retried independently from the unified
// assembly and event-detail windows. The explicit result cache keeps one
// named `sources_failed` signal per window/refresh and prevents a thundering
// herd of identical 10-second connections. An `events` tag invalidation still
// causes an immediate retry; single-flight coalesces concurrent cold misses in
// one worker.
const fetchCountyRssOnce = createSingleFlight<number, FeedFetchResult>();
const fetchCountyRssCached = unstable_cache(
  (windowDays: number) => {
    const county = FEEDS.find((candidate) => candidate.source === "county");
    if (!county) return Promise.resolve({ events: [], ok: false });
    return fetchCountyRssOnce(
      windowDays,
      () => fetchRssFeed(county, windowDays),
    );
  },
  [
    "county-events-adapter-v1",
    process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  ],
  { revalidate: 3600, tags: ["events", "county-events"] },
);

/** One event in a WordPress "The Events Calendar" REST v1 payload. Only the
 *  fields we read are typed; the payload carries far more. */
type TribeEvent = {
  title?: string;
  description?: string;
  start_date?: string; // "2026-07-11 10:30:00" (venue-local ET)
  end_date?: string;
  utc_start_date?: string; // "2026-07-11 14:30:00" (UTC)
  utc_end_date?: string;
  url?: string;
  venue?: { venue?: string; address?: string; city?: string; state?: string } | unknown[];
};

/** Parse a JSON-feed date. Prefer an absolute UTC/offset field (append Z only
 *  if the string carries no zone), else read a zone-less local wall time as
 *  Eastern. Shared by every JSON feed format (tribe / moderncampus / presence).
 *  Returns an ISO string or null. */
function jsonEventDateToISO(utc?: string, local?: string): string | null {
  if (utc && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(utc)) {
    const s = utc.replace(" ", "T");
    const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
    const d = new Date(zoned ? s : s + "Z");
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return easternWallToUtcISO(+m[1], +m[2], +m[3], +m[4], +m[5]);
  return null;
}

/**
 * Fetch a WordPress "The Events Calendar" REST v1 feed
 * (wp-json/tribe/events/v1/events) and map it to the shared LiveEvent shape —
 * same window + fail-soft + validate contract as the iCal path. Used by
 * museum / theater / land-trust nonprofits whose sites run the plugin
 * (civilwarmed.org, marylandensemble.org, catoctinlandtrust.org).
 */
async function fetchTribeFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
): Promise<FeedFetchResult> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  const deadline = createAbortDeadline(
    FEED_FETCH_TIMEOUT_MS,
    parentSignal,
  );
  try {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);
    const sep = feed.url.includes("?") ? "&" : "?";
    const url = `${feed.url}${sep}per_page=50&start_date=${now.toISOString().slice(0, 10)}`;
    const res = await fetch(url, {
      signal: deadline.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 410 || res.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${res.status})`);
      } else {
        console.warn(`[ical-live] ${feed.source}: HTTP ${res.status} (fail-soft, skipped)`);
      }
      return { events: [], ok: false };
    }
    const data = (await res.json()) as { events?: TribeEvent[] };
    const items = Array.isArray(data.events) ? data.events : [];
    const events: LiveEvent[] = [];
    for (const item of items) {
      const rawTitle = (item.title ?? "").trim();
      if (!rawTitle) continue;
      if (feed.skip_online && /\bonline\b/i.test(rawTitle)) continue;
      const v =
        item.venue && !Array.isArray(item.venue)
          ? (item.venue as { venue?: string; address?: string; state?: string })
          : undefined;
      // Drop satellite events (e.g. the Civil War Medicine museum's DC location).
      if (feed.only_state && v?.state && v.state.trim().toUpperCase() !== feed.only_state) continue;
      const startsAtISO = jsonEventDateToISO(item.utc_start_date, item.start_date);
      if (!startsAtISO) continue;
      const effectiveStart = new Date(startsAtISO);
      const endsAtISO =
        jsonEventDateToISO(item.utc_end_date, item.end_date) ??
        new Date(effectiveStart.getTime() + 2 * 60 * 60 * 1000).toISOString();
      if (!isEventWithinReadWindow(
        { starts_at: startsAtISO, ends_at: endsAtISO },
        now,
        horizon,
      )) continue;
      const status = deriveEventStatus(rawTitle, undefined);
      const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
      // Tribe descriptions are HTML; strip tags before the shared cleaner.
      const description = (item.description ?? "").replace(/<[^>]+>/g, " ").trim();
      const cleanedDesc = clampDescription(cleanDescription(description), 300);
      const venue = (v?.venue ?? "").trim() || feed.default_venue;
      const address = (v?.address ?? "").trim();
      const candidate = {
        id: `${feed.source}:${dedupeKey(title, effectiveStart, venue)}`,
        title,
        status,
        description: cleanedDesc,
        starts_at: startsAtISO,
        ends_at: endsAtISO,
        is_all_day: false,
        venue_name: venue,
        address,
        geom: feed.default_geom,
        municipality: inferMunicipality(address, feed.default_municipality),
        category: feedCategory(feed, title, description),
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
    console.log(`[ical-live] ${feed.source}: parsed ${events.length} tribe events in window`);
    recordSnapshot(feed.source, events);
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[ical-live] ${feed.source} ${aborted ? `timed out (>${FEED_FETCH_TIMEOUT_MS}ms)` : "failed"} (fail-soft, skipped):`,
      err instanceof Error ? err.message : err,
    );
    return { events: [], ok: false };
  } finally {
    deadline.dispose();
  }
}

type WixEventRow = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  slug?: unknown;
  status?: unknown;
  scheduling?: unknown;
  location?: unknown;
  mainImage?: unknown;
  registration?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordString(
  record: Record<string, unknown> | null,
  key: string,
): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function wixWarmupJson(html: string): unknown {
  // Attribute order is not stable on Wix deploys. The lookahead finds the
  // id regardless of whether type or id is emitted first.
  const match = html.match(
    /<script\b(?=[^>]*\bid=["']wix-warmup-data["'])[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) {
    throw new Error("wix-warmup-data script missing");
  }
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    throw new Error("wix-warmup-data script contained invalid JSON");
  }
}

/**
 * Wix places event arrays at `object.events.events` in more than one widget
 * payload (the current list and calendar/history views). Walk the warmup tree
 * rather than depending on generated component ids, then dedupe the overlap by
 * the publisher's stable event id.
 */
export function collectWixEventRows(warmupData: unknown): WixEventRow[] {
  const byId = new Map<string, WixEventRow>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    const object = asRecord(value);
    if (!object) return;

    const eventsContainer = asRecord(object.events);
    const rows = eventsContainer?.events;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const event = asRecord(row) as WixEventRow | null;
        if (!event) continue;
        const id = typeof event.id === "string" ? event.id.trim() : "";
        if (id && !byId.has(id)) byId.set(id, event);
      }
    }

    for (const child of Object.values(object)) visit(child);
  };

  visit(warmupData);
  return [...byId.values()];
}

function wixEventPrice(registrationValue: unknown): string | undefined {
  const registration = asRecord(registrationValue);
  const ticketing = asRecord(registration?.ticketing);
  const direct = recordString(ticketing, "lowestPrice");
  if (direct) return direct;
  const formatted = recordString(ticketing, "lowestTicketPriceFormatted");
  if (formatted) return formatted;
  const structured = asRecord(ticketing?.lowestTicketPrice);
  const amount = recordString(structured, "amount") || recordString(structured, "value");
  if (!amount) return undefined;
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return undefined;
  return `$${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}`;
}

function isZeroPrice(price: string | undefined): boolean {
  if (!price || !/\d/.test(price)) return false;
  const numeric = Number(price.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) && numeric === 0;
}

function approvedWixEventImage(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "static.wixstatic.com" ||
      parsed.port !== "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      !parsed.pathname.startsWith("/media/")
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function wixLifecycleStatus(value: unknown): "active" | "ended" | "cancelled" {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : value;
  if (normalized === 2 || normalized === "2" || normalized === "ENDED") {
    return "ended";
  }
  if (
    normalized === 3
    || normalized === "3"
    || normalized === "CANCELED"
    || normalized === "CANCELLED"
  ) {
    return "cancelled";
  }
  return "active";
}

/**
 * Parse the Maryland Deaf Community Center's first-party Wix Events page.
 *
 * Wix `status` is a lifecycle enum (0 upcoming, 1 started, 2 ended,
 * 3 cancelled). Ended rows are rejected; cancellation maps to the shared
 * LiveEvent status. A postponed state still requires an explicit publisher
 * marker in the title because Wix does not publish one in this payload.
 */
export function parseWixEventsHtml(
  html: string,
  feed: FeedSpec,
  now: Date,
  horizon: Date,
  fetchedAt: string,
): LiveEvent[] {
  const rows = collectWixEventRows(wixWarmupJson(html));
  const events: LiveEvent[] = [];

  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const rawTitle = typeof row.title === "string" ? cleanFeedText(row.title).trim() : "";
    if (!id || !rawTitle) continue;

    const scheduling = asRecord(row.scheduling);
    const config = asRecord(scheduling?.config);
    const startValue = recordString(config, "startDate");
    const endValue = recordString(config, "endDate");
    const startMs = Date.parse(startValue);
    if (!Number.isFinite(startMs)) continue;
    const start = new Date(startMs);
    const parsedEndMs = Date.parse(endValue);
    const end = Number.isFinite(parsedEndMs)
      ? new Date(parsedEndMs)
      : new Date(startMs + 2 * 60 * 60 * 1000);
    if (end < start) continue;

    // Keep a multi-day/current series while its publisher-supplied end is in
    // the future, plus ordinary future events inside the requested horizon.
    const wixStatus = wixLifecycleStatus(row.status);
    if (
      wixStatus === "ended" ||
      !isEventWithinReadWindow(
        { starts_at: start.toISOString(), ends_at: end.toISOString() },
        now,
        horizon,
      )
    ) continue;

    const location = asRecord(row.location);
    const coordinates = asRecord(location?.coordinates);
    const lat = coordinates?.lat;
    const lng = coordinates?.lng;
    const hasCoordinates =
      typeof lat === "number"
      && Number.isFinite(lat)
      && typeof lng === "number"
      && Number.isFinite(lng);
    const geom = hasCoordinates ? { lat, lng } : feed.default_geom;
    const fullAddress = asRecord(location?.fullAddress);
    const address =
      recordString(location, "address")
      || recordString(fullAddress, "formattedAddress");
    const venue = recordString(location, "name") || feed.default_venue;

    const rawDescription =
      typeof row.description === "string"
        ? row.description.replace(/<[^>]+>/g, " ")
        : "";
    const description = clampDescription(
      cleanDescription(rawDescription),
      300,
    );
    const rawStatus = deriveEventStatus(
      rawTitle,
      wixStatus === "cancelled" ? "CANCELLED" : undefined,
    );
    const title =
      rawStatus === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    const detailUrl = slug
      ? new URL(
          `/event-details-registration/${encodeURIComponent(slug)}`,
          feed.url,
        ).toString()
      : feed.url;
    const image = asRecord(row.mainImage);
    const heroImage = approvedWixEventImage(recordString(image, "url"));
    const priceText = wixEventPrice(row.registration);

    const candidate = {
      id: `${feed.source}:${id}`,
      title,
      status: rawStatus,
      description,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      is_all_day: false,
      venue_name: venue,
      address,
      geom,
      placement: hasCoordinates ? ("geocoded" as const) : undefined,
      municipality: inferMunicipality(address, feed.default_municipality),
      category: feedCategory(feed, title, description),
      organizer: feed.source_label,
      source: feed.source,
      source_label: feed.source_label,
      url: detailUrl,
      is_free:
        isZeroPrice(priceText)
        || isExplicitlyFree(`${title} ${description}`),
      price_text: priceText,
      hero_image: heroImage,
      last_verified_at: fetchedAt,
    };
    const validated = validateLiveEvent(candidate, feed.source);
    if (validated) events.push(validated);
  }

  return events.sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
}

async function fetchWixHtmlFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
): Promise<FeedFetchResult> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  const deadline = createAbortDeadline(
    FEED_FETCH_TIMEOUT_MS,
    parentSignal,
  );
  try {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);
    const response = await fetch(feed.url, {
      signal: deadline.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(
        `[ical-live] ${feed.source}: HTTP ${response.status} (fail-soft, skipped)`,
      );
      return { events: [], ok: false };
    }
    const html = await readBoundedText(
      response,
      MAX_WIX_HTML_SOURCE_BYTES,
    );
    const events = parseWixEventsHtml(
      html,
      feed,
      now,
      horizon,
      fetchedAt,
    );
    console.log(
      `[ical-live] ${feed.source}: parsed ${events.length} Wix events in window`,
    );
    recordSnapshot(feed.source, events);
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[ical-live] ${feed.source} ${
        aborted
          ? `timed out (>${FEED_FETCH_TIMEOUT_MS}ms)`
          : "failed"
      } (fail-soft, skipped):`,
      err instanceof Error ? err.message : err,
    );
    return { events: [], ok: false };
  } finally {
    deadline.dispose();
  }
}

/**
 * Fetch a JSON events feed that returns a flat array (no VCALENDAR/XML) and
 * map it with a per-format field adapter. Covers the college calendars:
 *   - "moderncampus" — Frederick Community College's Modern Campus / Localist
 *     pubcalendar API (startDatetime is zone-less ET; needs ?start&end).
 *   - "presence" — Mount St. Mary's Presence student-engagement API
 *     (startDateTimeUtc is absolute UTC).
 * Same window + fail-soft + validate contract as the iCal/tribe paths.
 */
async function fetchJsonArrayFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
): Promise<FeedFetchResult> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  const deadline = createAbortDeadline(
    FEED_FETCH_TIMEOUT_MS,
    parentSignal,
  );
  try {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);
    // Modern Campus requires an explicit date window; Presence takes none.
    let url = feed.url;
    if (feed.format === "moderncampus") {
      const end = new Date(now);
      end.setDate(end.getDate() + windowDays);
      const sep = feed.url.includes("?") ? "&" : "?";
      url = `${feed.url}${sep}start=${now.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}`;
    }
    const res = await fetch(url, {
      signal: deadline.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 410 || res.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${res.status})`);
      } else {
        console.warn(`[ical-live] ${feed.source}: HTTP ${res.status} (fail-soft, skipped)`);
      }
      return { events: [], ok: false };
    }
    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const events: LiveEvent[] = [];
    for (const raw of items) {
      const str = (k: string): string => (typeof raw[k] === "string" ? (raw[k] as string) : "");
      const isPresence = feed.format === "presence";
      const rawTitle = (isPresence ? str("eventName") : str("title")).trim();
      if (!rawTitle) continue;
      const startsAtISO = isPresence
        ? jsonEventDateToISO(str("startDateTimeUtc"), undefined)
        : jsonEventDateToISO(undefined, str("startDatetime"));
      if (!startsAtISO) continue;
      const effectiveStart = new Date(startsAtISO);
      const rawEndsAtISO = isPresence
        ? jsonEventDateToISO(str("endDateTimeUtc"), undefined)
        : jsonEventDateToISO(undefined, str("endDatetime"));
      const endsAtISO =
        rawEndsAtISO && Date.parse(rawEndsAtISO) > effectiveStart.getTime()
          ? rawEndsAtISO
          : new Date(effectiveStart.getTime() + 2 * 60 * 60 * 1000).toISOString();
      if (!isEventWithinReadWindow(
        { starts_at: startsAtISO, ends_at: endsAtISO },
        now,
        horizon,
      )) continue;
      const status = deriveEventStatus(rawTitle, undefined);
      const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
      const description = str("description").replace(/<[^>]+>/g, " ").trim();
      const cleanedDesc = clampDescription(cleanDescription(description), 300);
      const room = str("locationRoom");
      const venue = str("location").trim() || feed.default_venue;
      const address = isPresence ? "" : room ? `${venue}, ${room}` : "";
      // Resolve a real event URL: Presence gives a bare slug ("senior-formal-4")
      // → build <subdomain>.presence.io/event/<slug>; Modern Campus gives a
      // ticketUrl that may be blank/relative. Anything not http(s) → the feed
      // URL, so the schema's url() check never rejects a real event.
      const uri = str("uri");
      const sub = str("subdomain");
      const eventUrl = isPresence
        ? uri && sub
          ? `https://${sub}.presence.io/event/${uri}`
          : feed.url
        : /^https?:\/\//i.test(str("ticketUrl"))
          ? str("ticketUrl")
          : feed.url;
      const candidate = {
        id: `${feed.source}:${dedupeKey(title, effectiveStart, venue)}`,
        title,
        status,
        description: cleanedDesc,
        starts_at: startsAtISO,
        ends_at: endsAtISO,
        is_all_day: false,
        venue_name: venue,
        address,
        geom: feed.default_geom,
        municipality: feed.default_municipality,
        category: feedCategory(feed, title, description),
        organizer: feed.source_label,
        source: feed.source,
        source_label: feed.source_label,
        url: eventUrl,
        is_free: isExplicitlyFree(`${title} ${cleanedDesc}`),
        last_verified_at: fetchedAt,
      };
      const validated = validateLiveEvent(candidate, feed.source);
      if (validated) events.push(validated);
    }
    console.log(`[ical-live] ${feed.source}: parsed ${events.length} ${feed.format} events in window`);
    recordSnapshot(feed.source, events);
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[ical-live] ${feed.source} ${aborted ? `timed out (>${FEED_FETCH_TIMEOUT_MS}ms)` : "failed"} (fail-soft, skipped):`,
      err instanceof Error ? err.message : err,
    );
    return { events: [], ok: false };
  } finally {
    deadline.dispose();
  }
}

/** One row of a Vibemap-for-WordPress wp/v2/vibemap_event payload. Only the
 *  fields we read are typed; `meta` carries ~80 vibemap_* keys. */
export type VibemapRow = {
  /** WordPress exposes this as a UTC wall-clock value without a suffix. */
  modified_gmt?: string;
  title?: { rendered?: string };
  link?: string;
  excerpt?: { rendered?: string };
  meta?: Record<string, unknown>;
  /** WordPress/Yoast exposes the event's own social image when the Vibemap
   *  image array is empty. It is still publisher-provided event art. */
  yoast_head_json?: { twitter_image?: unknown };
};

const VIBEMAP_IMAGE_HOST = "ik.imagekit.io";
const VIBEMAP_IMAGE_PATH_PREFIX = "/vibemap/";

function approvedVibemapImage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = approvedVibemapImage(item);
      if (image) return image;
    }
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;

  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      return approvedVibemapImage(JSON.parse(trimmed) as unknown);
    } catch {
      return undefined;
    }
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.hostname !== VIBEMAP_IMAGE_HOST ||
      !url.pathname.startsWith(VIBEMAP_IMAGE_PATH_PREFIX)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function vibemapEventImage(row: VibemapRow): string | undefined {
  const meta = row.meta ?? {};
  return (
    approvedVibemapImage(meta["vibemap_event_images"]) ??
    approvedVibemapImage(meta["vibemap_event_original_images"]) ??
    approvedVibemapImage(row.yoast_head_json?.twitter_image)
  );
}

function samePublisherHttpsUrl(
  candidate: string | undefined,
  feedUrl: string,
): string | undefined {
  if (!candidate) return undefined;
  try {
    const value = new URL(candidate);
    const feed = new URL(feedUrl);
    return value.protocol === "https:" && value.hostname === feed.hostname
      ? value.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function wordpressGmtIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const candidate = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
    ? trimmed
    : `${trimmed}Z`;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

/**
 * Map raw vibemap_event rows to validated LiveEvents. Pure — exported for
 * tests. Honesty rules specific to this source:
 *   - Vibemap expands recurring series into per-instance rows, and some
 *     predicted instances lose their clock time (start "…00:00:00" with
 *     is_all_day false). A midnight stamp on an evening game night is a
 *     fabricated time, and calling it "All day" would be a different
 *     fabrication — those rows are DROPPED (~1/4 of the feed; the rest
 *     carry real venue-local times).
 *   - Per-event venue lat/lng from the feed is a vouched, distinct
 *     coordinate, so placement:"geocoded" lets cards show a real distance
 *     (same contract as the Visit Frederick JSON-LD note on LiveEvent).
 */
export function parseVibemapEvents(
  rows: VibemapRow[],
  feed: FeedSpec,
  now: Date,
  horizon: Date,
  fetchedAt: string,
): LiveEvent[] {
  const events: LiveEvent[] = [];
  for (const row of rows) {
    const m = row.meta ?? {};
    const str = (k: string): string => (typeof m[k] === "string" ? (m[k] as string) : "");
    const rawTitle = cleanFeedText(row.title?.rendered ?? "").trim();
    if (!rawTitle) continue;
    if (m["vibemap_event_is_online"] === true) continue;
    const startRaw = str("vibemap_event_start_date");
    const allDay = m["vibemap_event_is_all_day"] === true;
    // Predicted recurring instances arrive date-only ("… 00:00:00",
    // is_all_day false): the real clock time was lost upstream. Drop.
    if (!allDay && /[T ]00:00(:00)?$/.test(startRaw.trim())) continue;
    // All-day rows anchor to ET noon / end 23:59, same as the iCal path,
    // so the row lands on the right Eastern day with no fabricated clock.
    const dm = startRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const startsAtISO = allDay
      ? dm
        ? easternWallToUtcISO(+dm[1], +dm[2], +dm[3], 12, 0)
        : null
      : jsonEventDateToISO(undefined, startRaw);
    if (!startsAtISO) continue;
    const effectiveStart = new Date(startsAtISO);
    const endISO = allDay ? null : jsonEventDateToISO(undefined, str("vibemap_event_end_date"));
    const endsAtISO = allDay
      ? easternWallToUtcISO(+dm![1], +dm![2], +dm![3], 23, 59)
      : endISO && Date.parse(endISO) > effectiveStart.getTime()
        ? endISO
        : new Date(effectiveStart.getTime() + 2 * 60 * 60 * 1000).toISOString();
    if (!isEventWithinReadWindow(
      { starts_at: startsAtISO, ends_at: endsAtISO, is_all_day: allDay },
      now,
      horizon,
    )) continue;
    // Cancellation is a first-class flag here, not a title sniff.
    const status: EventStatus =
      m["vibemap_event_is_canceled"] === true ? "cancelled" : deriveEventStatus(rawTitle);
    const title = status === "scheduled" ? rawTitle : stripStatusMarker(rawTitle);
    const description = (row.excerpt?.rendered ?? "").replace(/<[^>]+>/g, " ").trim();
    const cleanedDesc = clampDescription(cleanDescription(description), 300);
    const venue = str("vibemap_event_venue_name").trim() || feed.default_venue;
    const address = str("vibemap_event_venue_address").trim();
    const lat = Number(m["vibemap_event_venue_latitude"]);
    const lng = Number(m["vibemap_event_venue_longitude"]);
    const hasGeo =
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
    const metaUrl = str("vibemap_event_url");
    const publisherRecordUrl = samePublisherHttpsUrl(row.link, feed.url);
    const candidate = {
      // Preserve the existing source identity during this rollout. Switching
      // every archived DFP row to WordPress IDs without an alias migration can
      // create duplicate canonical records when a title changes.
      id: `${feed.source}:${dedupeKey(title, effectiveStart, venue)}`,
      title,
      status,
      description: cleanedDesc,
      starts_at: startsAtISO,
      ends_at: endsAtISO,
      is_all_day: allDay,
      venue_name: venue,
      address,
      geom: hasGeo ? { lat, lng } : feed.default_geom,
      ...(hasGeo ? { placement: "geocoded" as const } : {}),
      municipality: inferMunicipality(address, feed.default_municipality),
      category: feedCategory(feed, title, description),
      organizer: str("vibemap_event_organizer").trim() || feed.source_label,
      source: feed.source,
      source_label: feed.source_label,
      // The WordPress record is the first-party source of this exact row and
      // remains stable when its title changes. A downstream/meta action URL is
      // useful content, but it is not the evidence identity.
      url: publisherRecordUrl ?? (/^https?:\/\//i.test(metaUrl) ? metaUrl : feed.url),
      is_free: isExplicitlyFree(`${title} ${cleanedDesc}`),
      hero_image: vibemapEventImage(row),
      last_verified_at: fetchedAt,
      publisher_updated_at: wordpressGmtIso(row.modified_gmt),
    };
    const validated = validateLiveEvent(candidate, feed.source);
    if (validated) events.push(validated);
  }
  return events;
}

// wp/v2 cannot filter or sort by the event-start meta field, so the whole
// registry is paged through and windowed client-side. 4 pages × 100 rows
// covers the full registry today (383) with headroom; a growth past the cap
// is logged so it never truncates silently.
const VIBEMAP_MAX_PAGES = 4;
const VIBEMAP_FIELDS = [
  "modified_gmt", "title", "link", "excerpt",
  "meta.vibemap_event_start_date", "meta.vibemap_event_end_date",
  "meta.vibemap_event_is_all_day", "meta.vibemap_event_is_canceled",
  "meta.vibemap_event_is_online", "meta.vibemap_event_organizer",
  "meta.vibemap_event_url", "meta.vibemap_event_venue_name",
  "meta.vibemap_event_venue_address", "meta.vibemap_event_venue_latitude",
  "meta.vibemap_event_venue_longitude",
  "meta.vibemap_event_images", "meta.vibemap_event_original_images",
  "yoast_head_json.twitter_image",
].join(",");

/** Fetch a Vibemap-for-WordPress events registry (wp/v2/vibemap_event).
 *  Same window + fail-soft + validate contract as the other paths. */
async function fetchVibemapFeed(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
): Promise<FeedFetchResult> {
  resetFeedMetrics(feed.source);
  const fetchedAt = new Date().toISOString();
  const deadline = createAbortDeadline(
    FEED_FETCH_TIMEOUT_MS,
    parentSignal,
  );
  try {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);
    const sep = feed.url.includes("?") ? "&" : "?";
    const pageUrl = (page: number) =>
      `${feed.url}${sep}per_page=100&page=${page}&_fields=${VIBEMAP_FIELDS}`;
    const headers = {
      "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
      Accept: "application/json",
    };
    const first = await fetch(pageUrl(1), {
      signal: deadline.signal,
      headers,
      cache: "no-store",
    });
    if (!first.ok) {
      if (first.status === 410 || first.status === 404) {
        console.info(`[ical-live] ${feed.source}: feed retired (HTTP ${first.status})`);
      } else {
        console.warn(`[ical-live] ${feed.source}: HTTP ${first.status} (fail-soft, skipped)`);
      }
      return { events: [], ok: false };
    }
    const totalPages = Number(first.headers.get("x-wp-totalpages") ?? "1");
    if (totalPages > VIBEMAP_MAX_PAGES) {
      console.warn(`[ical-live] ${feed.source}: ${totalPages} pages upstream, reading first ${VIBEMAP_MAX_PAGES}`);
    }
    const firstRows = (await first.json()) as VibemapRow[];
    const restPages = Math.min(totalPages, VIBEMAP_MAX_PAGES);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, restPages - 1) }, (_, i) =>
        fetch(pageUrl(i + 2), {
          signal: deadline.signal,
          headers,
          cache: "no-store",
        })
          .then((r) => (r.ok ? (r.json() as Promise<VibemapRow[]>) : []))
          .catch((error) => {
            // A single later page may fail soft, but a parent/deadline abort
            // must reach the adapter catch so this source is not reported
            // healthy with a silently truncated payload.
            if (
              deadline.signal.aborted
              || (error instanceof Error && error.name === "AbortError")
            ) {
              throw error;
            }
            return [] as VibemapRow[];
          }),
      ),
    );
    const rows = [firstRows, ...rest].flat().filter((r) => r && typeof r === "object");
    const events = parseVibemapEvents(rows, feed, now, horizon, fetchedAt);
    console.log(`[ical-live] ${feed.source}: parsed ${events.length} vibemap events in window`);
    recordSnapshot(feed.source, events);
    return { events, ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[ical-live] ${feed.source} ${aborted ? `timed out (>${FEED_FETCH_TIMEOUT_MS}ms)` : "failed"} (fail-soft, skipped):`,
      err instanceof Error ? err.message : err,
    );
    return { events: [], ok: false };
  } finally {
    deadline.dispose();
  }
}

async function fetchFeedOnce(
  feed: FeedSpec,
  windowDays: number,
  parentSignal?: AbortSignal,
  readMode: LiveEventReadMode = "public",
): Promise<FeedFetchResult> {
  if (feed.source === "county") {
    // A cancelable read cannot enter the persistent county cache fill.
    // Otherwise a caller-owned deadline could cancel work shared by a later
    // event-page render.
    if (parentSignal) {
      return fetchRssFeed(
        feed,
        windowDays,
        parentSignal,
        readMode === "probe" ? FEED_FETCH_TIMEOUT_MS : undefined,
      );
    }
    // Vitest calls the raw integration outside Next's request/cache context.
    // Keep that diagnostic path real rather than throwing Next's
    // "incrementalCache missing" invariant before the mocked fetch runs.
    if (process.env.NODE_ENV === "test") {
      return fetchCountyRssOnce(
        windowDays,
        () => fetchRssFeed(feed, windowDays),
      );
    }
    return fetchCountyRssCached(windowDays);
  }
  if (feed.format === "tribe") {
    return fetchTribeFeed(feed, windowDays, parentSignal);
  }
  if (feed.format === "wix-html") {
    return fetchWixHtmlFeed(feed, windowDays, parentSignal);
  }
  if (feed.format === "moderncampus" || feed.format === "presence") {
    return fetchJsonArrayFeed(feed, windowDays, parentSignal);
  }
  if (feed.format === "rss") {
    return fetchRssFeed(feed, windowDays, parentSignal);
  }
  if (feed.format === "vibemap") {
    return fetchVibemapFeed(feed, windowDays, parentSignal);
  }
  return fetchIcalFeed(feed, windowDays, parentSignal);
}

type LiveEventFetchSession = {
  startedAtMs: number;
  feeds: Map<string, Promise<FeedFetchResult>>;
  ticketmasterMusic?: ReturnType<
    typeof fetchTicketmasterMusicResult
  >;
};

// warm-events fills two different durable cache products: the unified
// 60-day board plus the 90-day source-page view. Next deliberately
// bypasses nested unstable_cache reads, so those products cannot safely share
// one persistent wrapper. They can, however, share the same upstream pull
// inside this one request. Fetch the widest requested horizon once per source,
// then derive narrower views without dropping anything from the 90-day result.
//
// AsyncLocalStorage keeps the sharing scoped to the cron invocation. A user
// request running in the same warm Lambda never inherits this request's
// in-memory state, and ordinary callers retain their existing fetch behavior.
// The 90-day base is the explicit contract of warm-events today (unified 60 +
// detail 90). If that route adds a horizon above 90, raise this base with it so
// a single session does not legitimately need a second, wider source pull.
const WARM_EVENT_FETCH_HORIZON_DAYS = 90;
const liveEventFetchSession =
  new AsyncLocalStorage<LiveEventFetchSession>();

export function withLiveEventFetchSession<T>(
  work: () => Promise<T>,
): Promise<T> {
  return liveEventFetchSession.run(
    {
      startedAtMs: Date.now(),
      feeds: new Map<string, Promise<FeedFetchResult>>(),
    },
    work,
  );
}

/**
 * Ticketmaster music participates in both event cache products but does not
 * flow through FEEDS. Keep it in the same request-scoped session so the cron
 * cannot trade duplicate iCal pulls for duplicate Ticketmaster requests.
 */
export function fetchLiveTicketmasterMusicResult(): ReturnType<
  typeof fetchTicketmasterMusicResult
> {
  const session = liveEventFetchSession.getStore();
  if (!session) return fetchTicketmasterMusicResult();
  session.ticketmasterMusic ??= fetchTicketmasterMusicResult();
  return session.ticketmasterMusic;
}

/**
 * Public event adapters share the same in-process failure contract as the
 * municipal feeds. Disabled integrations are neutral; failed/partial
 * integrations open the circuit. When a previous successful value exists, a
 * failed refresh returns those rows as partial so the board can use them while
 * still reporting degraded source coverage.
 */
export async function runPublicEventAdapter<T>(
  source: string,
  work: () => Promise<EventAdapterResult<T>>,
): Promise<EventAdapterResult<T>> {
  const outcome = await publicEventSourceCircuits.run(
    `adapter:${source}`,
    work,
    {
      classify: (result) =>
        result.state === "disabled"
          ? "neutral"
          : eventAdapterIsDegraded(result)
            ? "failure"
            : "success",
      fallback: () => eventAdapterFailed<T>(),
    },
  );
  return outcome.degraded
    ? eventAdapterFailed(outcome.value.items)
    : outcome.value;
}

function trimFeedResultToWindow(
  result: FeedFetchResult,
  startedAtMs: number,
  windowDays: number,
): FeedFetchResult {
  // Match the source adapters' calendar-day horizon exactly. Fixed
  // 24-hour multiplication drifts by an hour when a window crosses a DST
  // boundary, which can change membership for an event at the cutoff.
  const horizon = new Date(startedAtMs);
  horizon.setDate(horizon.getDate() + windowDays);
  const horizonMs = horizon.getTime();
  return {
    ok: result.ok,
    events: result.events.filter(
      (event) => Date.parse(event.starts_at) <= horizonMs,
    ),
  };
}

async function fetchFeed(
  feed: FeedSpec,
  windowDays: number,
  options: LiveEventReadOptions = {},
): Promise<FeedFetchResult> {
  const readMode = options.readMode ?? "public";

  // A probe owns its work. It bypasses both public circuit state and the
  // request-scoped session map, where an operational deadline could otherwise
  // cancel or reuse a visitor-facing fill.
  if (readMode === "probe") {
    return fetchFeedOnce(feed, windowDays, options.signal, readMode);
  }

  const publicFetch = async (
    sharedWindowDays: number,
    signal?: AbortSignal,
  ) => {
    const circuitKey =
      sharedWindowDays <= PUBLIC_EVENT_FETCH_HORIZON_DAYS
        ? `feed:${feed.source}`
        : `feed:${feed.source}:h${sharedWindowDays}`;
    const outcome = await publicEventSourceCircuits.run(
      circuitKey,
      async () => {
        const result = await fetchFeedOnce(
          feed,
          sharedWindowDays,
          signal,
          readMode,
        );
        return signal?.aborted
          ? { ...result, ok: false, aborted: true }
          : result;
      },
      {
        classify: (result) =>
          result.aborted
            ? "cancelled"
            : result.ok
              ? "success"
              : "failure",
        fallback: (): FeedFetchResult => ({
          events: [],
          ok: false,
          ...(signal?.aborted ? { aborted: true } : {}),
        }),
        // A caller-owned deadline must remain abortable without becoming the
        // global single-flight promise. Otherwise an ordinary visitor arriving
        // moments later could inherit this caller's cancellation.
        shareInFlight: signal === undefined,
      },
    );
    // A stale-good value remains useful, but it must never make the source look
    // freshly healthy to the coverage ledger.
    return outcome.degraded
      ? { ...outcome.value, ok: false }
      : outcome.value;
  };

  const publicWindowDays = Math.max(
    PUBLIC_EVENT_FETCH_HORIZON_DAYS,
    windowDays,
  );
  // A cancellable public caller must still use the public circuit and its
  // stale-good value, but it must not publish abortable work into the warm-fill
  // session where another consumer could inherit the caller's deadline.
  if (options.signal) {
    const startedAtMs = Date.now();
    const result = await publicFetch(publicWindowDays, options.signal);
    return windowDays >= publicWindowDays
      ? result
      : trimFeedResultToWindow(result, startedAtMs, windowDays);
  }

  const session = liveEventFetchSession.getStore();
  if (!session) {
    const result = await publicFetch(publicWindowDays);
    return windowDays >= publicWindowDays
      ? result
      : trimFeedResultToWindow(result, Date.now(), windowDays);
  }

  const sharedWindowDays = Math.max(
    WARM_EVENT_FETCH_HORIZON_DAYS,
    windowDays,
  );
  const key = `${feed.source}:${sharedWindowDays}`;
  let shared = session.feeds.get(key);
  if (!shared) {
    shared = publicFetch(sharedWindowDays);
    session.feeds.set(key, shared);
  }

  const result = await shared;
  if (windowDays >= sharedWindowDays) return result;
  return trimFeedResultToWindow(result, session.startedAtMs, windowDays);
}

/** Fetch a deliberately small subset of the live-feed registry. Feature pages
 * can use this instead of paying for the countywide fanout when their scope is
 * known in advance (for example, /beer only needs brewery-owned calendars). */
export async function getLiveEventsForSources(
  sources: readonly LiveEvent["source"][],
  windowDays = 60,
  options: LiveEventReadOptions = {},
): Promise<{
  events: LiveEvent[];
  sources_succeeded: string[];
  sources_failed: string[];
}> {
  const wanted = new Set(sources);
  const feeds = FEEDS.filter(
    (feed) => feed.url && wanted.has(feed.source),
  );
  const read = (feed: FeedSpec) =>
    (options.signal?.aborted
      ? Promise.resolve<FeedFetchResult>({
          events: [],
          ok: false,
          aborted: true,
        })
      : fetchFeed(feed, windowDays, options)).then((result) => ({
      source: feed.source,
      evts: result.events,
      ok: result.ok,
    }));
  const results = await mapEventSourcesWithConcurrency(
    feeds,
    PUBLIC_EVENT_SOURCE_CONCURRENCY,
    read,
  );

  const seen = new Map<string, LiveEvent>();
  for (const { evts } of results) {
    for (const event of evts) {
      const key = liveEventDedupeKey(
        event.title,
        new Date(event.starts_at),
        event.venue_name,
      );
      if (!seen.has(key)) seen.set(key, event);
    }
  }

  return {
    events: [...seen.values()]
      .filter(
        (event) =>
          !EVENT_NOISE_FILTER
          || (!isVenueStatusNonEvent(event.title) && !isNonPublicListing(event.title)),
      )
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    sources_succeeded: results.filter((result) => result.ok).map((result) => result.source),
    sources_failed: results.filter((result) => !result.ok).map((result) => result.source),
  };
}

export function getCachedLiveEventsForSources(
  sources: readonly LiveEvent["source"][],
  windowDays = 60,
): ReturnType<typeof getLiveEventsForSources> {
  const stableSources = [...new Set(sources)].sort();
  return readCachedEventSources(stableSources, windowDays);
}

export async function getLiveEvents(
  windowDays = 60,
  options: {
    includeTicketmaster?: boolean;
    signal?: AbortSignal;
    readMode?: LiveEventReadMode;
  } = {},
): Promise<{
  events: LiveEvent[];
  sources_succeeded: string[];
  sources_failed: string[];
}> {
  // iCal/RSS feeds plus Ticketmaster live-music discovery, fetched in
  // parallel. Ticketmaster is inert ([]) without TICKETMASTER_API_KEY,
  // so this path is unchanged until that key is set. Both yield the
  // same LiveEvent shape, so they share the dedupe/filter/sort below.
  const includeTicketmaster = options.includeTicketmaster !== false;
  const readMode = options.readMode ?? "public";
  const feeds = FEEDS.filter((feed) => feed.url);
  const read = (feed: FeedSpec) =>
    (options.signal?.aborted
      ? Promise.resolve<FeedFetchResult>({
          events: [],
          ok: false,
          aborted: true,
        })
      : fetchFeed(feed, windowDays, {
          signal: options.signal,
          readMode,
        })).then((result) => ({
      source: feed.source,
      evts: result.events,
      ok: result.ok,
    }));
  const [feedResults, ticketmasterResult] = await Promise.all([
    // Public and probe reads share the same load-shedding ceiling. Their
    // resilience state remains intentionally separate inside fetchFeed.
    mapEventSourcesWithConcurrency(
      feeds,
      PUBLIC_EVENT_SOURCE_CONCURRENCY,
      read,
    ),
    includeTicketmaster
      ? readMode === "probe"
        ? fetchLiveTicketmasterMusicResult()
        : runPublicEventAdapter(
            "ticketmaster-music",
            fetchLiveTicketmasterMusicResult,
          )
      : Promise.resolve({ items: [], state: "disabled" as const }),
  ]);

  // Ticketmaster has no window parameter; clamp its results to the same
  // horizon the feed fetchers honor so getLiveEvents(7) cannot surface a
  // concert three months out.
  const horizonMs = Date.now() + windowDays * 86_400_000;
  const results: Array<{ source: LiveEvent["source"]; evts: LiveEvent[]; ok: boolean }> = [
    ...feedResults,
    ...(ticketmasterResult.state === "disabled"
      ? []
      : [{
          source: "ticketmaster" as const,
          evts: ticketmasterResult.items.filter(
            (e) => +new Date(e.starts_at) <= horizonMs,
          ),
          ok: !eventAdapterIsDegraded(ticketmasterResult),
        }]),
  ];

  // Deduplicate by composite key — same title + day + time + venue across feeds
  // means the same event cross-promoted (e.g. DFP and Celebrate Frederick both
  // list First Saturday).
  //
  // Key on the NORMALIZED title, not the raw feed title. A feed often lists
  // the same event both bare and org-prefixed — the county RSS carries both
  // "Asia On The Creek" and "Asian American Center of Frederick-Asia on the
  // Creek". Display strips the "Org-Event" prefix via normalizeTitle, so both
  // render identically; keying on the raw title left them with different keys
  // and both survived. Normalizing here (same strip + case-fold the display
  // uses) collapses them at the source, so every downstream surface — /events
  // AND /map — sees one row.
  const seen = new Map<string, LiveEvent>();
  for (const { evts } of results) {
    for (const e of evts) {
      const start = new Date(e.starts_at);
      const key = liveEventDedupeKey(e.title, start, e.venue_name);
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
    sources_succeeded: results.filter((r) => r.ok).map((r) => r.source),
    sources_failed: results.filter((r) => !r.ok).map((r) => r.source),
  };
}

type CachedEventSourceResult = {
  events: LiveEvent[];
  state: LiveEventCacheSourceState;
};

type CachedEventSourceMemo = {
  expiresAt: number;
  promise: Promise<CachedEventSourceResult>;
};

// A large source can span several persistent cache pages. Keep its parsed
// result in process briefly so those sequential page fills share one upstream
// request and one parse. This is only an assembly memo, never a second durable
// cache; expired entries are pruned on the next read.
const EVENT_SOURCE_ASSEMBLY_MEMO_MS = 30_000;
const eventSourceAssemblyMemo = new Map<string, CachedEventSourceMemo>();

function eventSourceLabel(source: LiveEvent["source"]): string {
  if (source === "ticketmaster") return "Ticketmaster";
  return FEEDS.find((feed) => feed.source === source)?.source_label ?? source;
}

async function fetchEventSourceForCache(
  source: LiveEvent["source"],
  windowDays: number,
): Promise<CachedEventSourceResult> {
  const key = `${source}:${windowDays}`;
  const now = Date.now();
  for (const [candidate, memo] of eventSourceAssemblyMemo) {
    if (memo.expiresAt <= now) eventSourceAssemblyMemo.delete(candidate);
  }
  const existing = eventSourceAssemblyMemo.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = (async (): Promise<CachedEventSourceResult> => {
    if (source === "ticketmaster") {
      const result = await runPublicEventAdapter(
        "ticketmaster-music",
        fetchLiveTicketmasterMusicResult,
      );
      const horizonMs = Date.now() + windowDays * 86_400_000;
      return {
        events: result.items.filter(
          (event) => Date.parse(event.starts_at) <= horizonMs,
        ),
        state:
          result.state === "disabled"
            ? "disabled"
            : eventAdapterIsDegraded(result)
              ? "failed"
              : "ok",
      };
    }

    const feed = FEEDS.find(
      (candidate) => candidate.source === source && Boolean(candidate.url),
    );
    if (!feed) return { events: [], state: "disabled" };
    const result = await fetchFeed(feed, windowDays);
    return {
      events: result.events,
      state: result.ok ? "ok" : "failed",
    };
  })();

  eventSourceAssemblyMemo.set(key, {
    expiresAt: now + EVENT_SOURCE_ASSEMBLY_MEMO_MS,
    promise,
  });
  void promise.catch(() => {
    const current = eventSourceAssemblyMemo.get(key);
    if (current?.promise === promise) eventSourceAssemblyMemo.delete(key);
  });
  return promise;
}

function getCachedEventSourcePage(
  source: LiveEvent["source"],
  windowDays: number,
  afterCursor: string | null,
) {
  return unstable_cache(
    async () => {
      const result = await fetchEventSourceForCache(source, windowDays);
      return buildLiveEventCachePage(
        result.events,
        result.state,
        afterCursor,
      );
    },
    [
      // v3 adds the publisher-owned modification timestamp used to settle
      // first-party event changes. Keep old cache tuples out of this shape.
      "live-event-source-page-v4",
      source,
      String(windowDays),
      afterCursor ?? "first",
    ],
    {
      revalidate: 840,
      tags: ["events", `events-source-${source}`],
    },
  )();
}

async function readCachedEventSource(
  source: LiveEvent["source"],
  windowDays: number,
): Promise<CachedEventSourceResult> {
  const events: LiveEvent[] = [];
  const seenCursors = new Set<string>();
  let afterCursor: string | null = null;
  let state: LiveEventCacheSourceState = "disabled";

  while (true) {
    const page = await getCachedEventSourcePage(
      source,
      windowDays,
      afterCursor,
    );
    const pageState = liveEventCacheSourceState(page);
    // A partial/failed refresh may still contain useful rows. Preserve them,
    // while retaining the failed state for the UI/source-health ledger.
    if (pageState === "failed") state = "failed";
    else if (pageState === "ok" && state !== "failed") state = "ok";

    const label = eventSourceLabel(source);
    events.push(
      ...page.e.map((record) =>
        inflateCachedLiveEvent(record, source, label),
      ),
    );

    if (page.n === null) break;
    if (seenCursors.has(page.n)) {
      throw new Error(`live event cache cursor repeated for ${source}`);
    }
    seenCursors.add(page.n);
    afterCursor = page.n;
  }

  return { events, state };
}

async function readCachedEventSources(
  sources: readonly LiveEvent["source"][],
  windowDays: number,
): ReturnType<typeof getLiveEvents> {
  const results = await mapEventSourcesWithConcurrency(
    sources,
    PUBLIC_EVENT_SOURCE_CONCURRENCY,
    async (source) => {
      try {
        return {
          source,
          ...(await readCachedEventSource(source, windowDays)),
        };
      } catch (error) {
        console.warn(
          `[ical-live] ${source}: bounded cache page failed (fail-soft, skipped):`,
          error instanceof Error ? error.message : error,
        );
        return {
          source,
          events: [] as LiveEvent[],
          state: "failed" as const,
        };
      }
    },
  );

  const seen = new Map<string, LiveEvent>();
  for (const result of results) {
    for (const event of result.events) {
      const key = liveEventDedupeKey(
        event.title,
        new Date(event.starts_at),
        event.venue_name,
      );
      if (!seen.has(key)) seen.set(key, event);
    }
  }

  return {
    events: [...seen.values()]
      .filter(
        (event) =>
          !EVENT_NOISE_FILTER
          || (!isVenueStatusNonEvent(event.title)
            && !isNonPublicListing(event.title)),
      )
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    sources_succeeded: results
      .filter((result) => result.state === "ok")
      .map((result) => result.source),
    sources_failed: results
      .filter((result) => result.state === "failed")
      .map((result) => result.source),
  };
}

/**
 * Cached wrapper around getLiveEvents. Event data is stored as compact,
 * byte-measured pages per source rather than one countywide value.
 *
 * The old assembled 60/90-day entry crossed Next's roughly 2 MB Data Cache
 * limit, so the write failed and the next visitor paid for every feed again.
 * Each new page has a conservative 1.5 MB ceiling and carries a continuation
 * cursor; an unusually large source gets another page instead of losing
 * events. Per-source isolation also means one failed feed cannot evict healthy
 * sources from cache.
 *
 * The fourteen-minute TTL remains shorter than the fifteen-minute warm cron.
 * Cache keys are shape-versioned and stable across ordinary deploys. Raw
 * getLiveEvents stays separate for data-health workers that must measure live
 * upstream state.
 */
export function getCachedLiveEvents(
  windowDays = 60,
): ReturnType<typeof getLiveEvents> {
  const sources: LiveEvent["source"][] = [
    ...new Set(
      FEEDS.filter((feed) => Boolean(feed.url)).map((feed) => feed.source),
    ),
    "ticketmaster",
  ];
  return readCachedEventSources(sources, windowDays);
}

export const LIVE_FEEDS = FEEDS.map((f) => ({
  source: f.source,
  label: f.source_label,
  url: f.url,
}));
