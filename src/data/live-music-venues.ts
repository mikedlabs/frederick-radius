/**
 * Curated live-music venues across Frederick County — the businesses
 * that regularly host bands, DJs, and acoustic sets. The place
 * directory's `music` category catches only ~5 rows (formal halls like
 * the Weinberg and Sky Stage); the vast majority of Frederick live
 * music happens at breweries, wineries, distilleries, and neighborhood
 * bars that are categorized by what they sell, not what they stage.
 *
 * Every `slug` below is VERIFIED present in the place dataset (checked
 * against places-client.json) and every venue was confirmed via its own
 * site/socials to host recurring live music. This is the honest answer
 * to "where is there live music?" — it does NOT claim music is on
 * tonight; per-show times come from the iCal/scrape layer (`ical`).
 *
 * `ical` is the venue's public calendar feed where one exists (most run
 * The Events Calendar / "Tribe" WordPress plugin, which exposes a
 * standard webcal/iCal export). These are the spine for per-event
 * ingestion — the brewery/bar/winery shows that Ticketmaster (ticketed
 * only) and Bandsintown (artist-scoped only) structurally never see.
 *
 * Sourced from the live-music research pass (June 2026). Closed venues
 * (Blue Side Tavern, Guido's) deliberately excluded.
 */

export type LiveMusicVenue = {
  /** Canonical place slug — verified to exist in the dataset. */
  slug: string;
  /** Public iCal/webcal feed for per-show ingestion, when one exists. */
  ical?: string;
  /** Squarespace events page URL (no `?format=json` suffix). Squarespace
   *  exposes a clean structured JSON of the events collection at
   *  `<url>?format=json` (an `upcoming` array of dated shows) — concrete
   *  dated events, not RRULE-recurring, so they ingest at RUNTIME via
   *  src/lib/integrations/squarespace-live.ts (no cron, kept fresh hourly
   *  by ISR), unlike the venue iCal exports that this parser can't expand. */
  squarespace?: string;
  /** How shows are published when there's no machine feed (honest note). */
  scheduleNote?: string;
};

export const LIVE_MUSIC_VENUES: LiveMusicVenue[] = [
  // ── Confirmed machine-readable iCal feeds (the wire-first tier) ──
  { slug: "tenth-ward-distilling-company", ical: "https://www.tenthwarddistilling.com/?post_type=tribe_events&ical=1&eventDisplay=list" },
  { slug: "monocacy-brewing-frederick",    ical: "https://monocacybrewing.com/?post_type=tribe_events&ical=1&eventDisplay=list" },
  { slug: "bentztown",                      ical: "https://bentztown.com/?post_type=tribe_events&ical=1&eventDisplay=list" },

  // ── Structured event pages (scrape-tier; per-event ICS, no master feed) ──
  { slug: "steinhardt-brewing-company-frederick", scheduleNote: "steinhardtbrewing.com/live-music-events" },
  { slug: "sandbox-brewhouse-frederick",          scheduleNote: "sandboxbrewhouse.com/calendar" },
  { slug: "rockwell-brewery-frederick",           scheduleNote: "rockwellbrewery.com/events" },
  { slug: "rockwell-brewery-frederick-2",         scheduleNote: "rockwellbrewery.com/events" },
  { slug: "loew-vineyards-mount-airy",            scheduleNote: "loewvineyards.net/upcoming-events" },
  { slug: "cafe-nola",                            scheduleNote: "cafe-nola.com/musicevents · Monday open mic" },

  // ── Ticketed / aggregator-listed (Ticketmaster · Bandsintown) ──
  { slug: "weinberg-center-for-the-arts-frederick", scheduleNote: "Ticketmaster venue 172220 · Bandsintown" },
  { slug: "new-spire-arts",                          scheduleNote: "Bandsintown venue 10208042 (under Weinberg)" },
  { slug: "cafe-611-restaurant",                     scheduleNote: "Bandsintown venue 10004683" },

  // ── Recurring series / seasonal stages ──
  { slug: "carroll-creek-outdoor-amphitheater", scheduleNote: "Alive @ Five — Thu 5–8pm, May–Sept (downtownfrederick.org)" },
  { slug: "baker-park-bandshell",               scheduleNote: "Summer Concert Series — Sun, Jun–Aug (celebratefrederick.com)" },
  { slug: "frederick-arts-council-sky-stage",   scheduleNote: "skystagefrederick.com/project/calendar · seasonal" },

  // ── Regular live music, Facebook/website-announced ──
  { slug: "brewers-alley-frederick",            scheduleNote: "brewers-alley.com/calendar" },
  { slug: "olde-mother-brewing-frederick",      scheduleNote: "oldemother.com/events" },
  { slug: "bushwaller-irish-pub-frederick",     scheduleNote: "Facebook events" },
  { slug: "jojos-restaurant-tap-house",         scheduleNote: "jojosrestauranttaphouse.com/events · Sat live music" },
  { slug: "pour-decisions-restaurant-bar-music-new-market", scheduleNote: "Facebook events" },
  { slug: "ott-house-emmitsburg",               scheduleNote: "Mon/Tue/Fri — Facebook" },
  { slug: "attaboy-beer-frederick",             scheduleNote: "attaboybeer.com" },
  { slug: "citizens-ballroom",                  scheduleNote: "Facebook events" },
  // Open downtown now; live music most Fri & Sat ~9 PM (cover bands + regional
  // acts) on a Squarespace events page. No master iCal, but the page exposes
  // a clean structured JSON (`?format=json` → `upcoming[]`), so the lineup
  // ingests at runtime (squarespace-live.ts) and stays fresh on its own.
  { slug: "the-banyan-frederick",               squarespace: "https://www.thebanyanmd.com/livemusic", scheduleNote: "Live music most Fri & Sat, 9 PM" },
  // Breweries with their lineup on a Squarespace events page (?format=json),
  // fetch-verified 2026-06-20. Steinhardt exposes `upcoming[]`; Rockwell only
  // `items[]` (the parser handles both). All shows are at the venue itself.
  { slug: "steinhardt-brewing-company-frederick", squarespace: "https://www.steinhardtbrewing.com/live-music-events", scheduleNote: "Live music, jazz jam & comedy on Carroll Creek" },
  { slug: "rockwell-brewery-frederick",           squarespace: "https://www.rockwellbrewery.com/events", scheduleNote: "Busy live-music calendar at the Riverside taproom" },

  // ── Wineries / farm breweries (weekend live music, seasonal) ──
  { slug: "linganore-winecellars-mount-airy",   scheduleNote: "Wine & music festivals (Mission Tix)" },
  { slug: "orchid-cellar-meadery-middletown",   scheduleNote: "orchidcellar.com/events" },
  { slug: "catoctin-breeze-vineyard-thurmont",  scheduleNote: "catoctinbreeze.com/events · weekend music" },
  { slug: "springfield-manor-thurmont",         scheduleNote: "Sat & Sun 2–5pm" },
  { slug: "milkhouse-brewery-mt-airy",          scheduleNote: "Sat 5–8pm, Sun 3–6pm — Facebook" },
  { slug: "red-shedman-farm-brewery-and-hop-yard-mount-airy", scheduleNote: "redshedman.com/events · irregular" },

  // ── Brunswick ──
  { slug: "cannons-events-brunswick",           scheduleNote: "upstairsatsmoketown.com/projects · Facebook" },
  { slug: "smoketown-brewing-brunswick",        scheduleNote: "Fri live music — Facebook" },
];

/** Fast membership test for "is this a live-music venue?" */
export const LIVE_MUSIC_VENUE_SLUGS: ReadonlySet<string> = new Set(
  LIVE_MUSIC_VENUES.map((v) => v.slug),
);

/** The subset with a machine-readable iCal feed — the per-show ingest spine. */
export const LIVE_MUSIC_ICAL_FEEDS = LIVE_MUSIC_VENUES.filter(
  (v): v is LiveMusicVenue & { ical: string } => Boolean(v.ical),
);

/** The subset with a Squarespace events page — ingested at runtime from the
 *  page's `?format=json` `upcoming[]` feed (see squarespace-live.ts). */
export const LIVE_MUSIC_SQUARESPACE_VENUES = LIVE_MUSIC_VENUES.filter(
  (v): v is LiveMusicVenue & { squarespace: string } => Boolean(v.squarespace),
);
