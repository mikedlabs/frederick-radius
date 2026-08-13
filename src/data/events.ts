import type { LngLat } from "@/lib/geo";
import { easternWallToUtcISO } from "@/lib/tz";

export type EventHeroImageAttribution = {
  /** A place photograph documents the venue, not the event itself. */
  kind: "venue";
  venue_name: string;
  provider: "google_maps";
  /** Direct link to the individual source photo on Google Maps. */
  source_uri: string;
  flag_content_uri?: string;
  authors: Array<{
    display_name?: string;
    uri?: string;
    photo_uri?: string;
  }>;
};

export type Event = {
  slug: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: "America/New_York";
  is_all_day?: boolean;
  is_recurring?: boolean;
  recurrence_text?: string;
  venue_place_slug?: string;
  venue_name: string;
  address: string;
  geom: LngLat;
  municipality: string;
  category: string;
  audience: string[];
  is_free: boolean;
  price_text?: string;
  ticket_url?: string;
  rsvp_url?: string;
  /**
   * How a user can attend. Physical is the default for legacy/curated rows;
   * live adapters stamp online/mixed when the publisher exposes it or uses a
   * recognized title/venue convention.
   */
  attendance_mode?: "physical" | "online" | "mixed";
  /** Direct join, registration, or event page for online participation. */
  online_url?: string;
  organizer?: string;
  /**
   * Presenting organization extracted from an "Organization-Event Name"
   * feed title by the normalization layer (src/lib/events/normalize.ts).
   * Rendered as a small presenter chip so the title reads as the event,
   * not the org. Absent on titles with no org prefix.
   */
  presenter?: string;
  hero_image?: string;
  /**
   * Provenance for a venue photograph borrowed from the canonical place.
   * Event-specific provider images are governed by their source adapter;
   * Google venue photos must carry this record or visual surfaces fail closed.
   */
  hero_image_attribution?: EventHeroImageAttribution;
  /** Know-before-you-go: admission, what to drink, what to eat on site. */
  info?: { admission?: string; drinks?: string; food?: string };
  /**
   * Per-week food-truck lineup (just names — no addresses/menus). Used
   * for events that rotate trucks each week, e.g. Alive @ Five. When
   * present, the event detail page renders these as chips instead of
   * the generic "Food vendors" line. Hand-curated; no live ingest yet.
   */
  food_trucks?: string[];
  /**
   * Lifecycle status — scheduled (default), cancelled, or postponed.
   * Live feeds set this from the iCal STATUS property or a title
   * sniff; seed authors may set it by hand when an event is called
   * off. Absent is treated as "scheduled". See src/lib/event-status.ts.
   */
  status?: "scheduled" | "cancelled" | "postponed";
  /**
   * How this event's coordinates were resolved. The loader sets this
   * automatically; seed authors do not write it directly.
   *   - "venue":       inherited from a known venue (venue_place_slug
   *                    resolved to a real Place with a verified geom)
   *   - "geocoded":    standalone event with its own geom, validated
   *                    against the county bbox
   *   - "needs_review": geom failed the bbox check or geom is missing.
   *                    These rows are dropped from every public surface
   *                    and surfaced on /admin/data-health for human fix.
   * The brief's rule: a mispositioned marker breaks trust instantly,
   * so we never render a row we cannot vouch for the position of.
   */
  placement?: "venue" | "geocoded" | "needs_review";
  /**
   * Canonical source page for an event. Live rows use the feed item's own
   * URL; curated rows may use a direct organizer page when it corroborates
   * the specific event. Leave this unset when only a nearby or conflicting
   * page is available. The detail route surfaces it as an "Official page."
   */
  source_url?: string | null;
  source:
    | "dfp" | "celebrate" | "county" | "manual" | "seed"
    // Live feed sources flow through liveToCardEvent with their real
    // names now. They were all hardcoded "manual" at that boundary,
    // which let a Ticketmaster row claim first party curated trust.
    | "hood" | "visit-frederick" | "weinberg" | "delaplaine"
    | "fcpl" | "fcvfra" | "city-frederick" | "fair" | "mount-airy" | "thurmont" | "parks" | "heritage-frederick"
    | "monocacy" | "msd" | "mdcc" | "mount-st-marys" | "isf" | "elc" | "civil-war-med" | "maryland-ensemble" | "catoctin" | "fcc"
    | "ticketmaster" | "bandsintown" | "seatgeek" | "eventbrite" | "venue-extract" | "frederick-keys";
  is_verified: boolean;
  /**
   * ISO date for when this event was last editorially verified. Live
   * rows get the feed fetch time; seed/curated rows can set their own
   * date when an editor confirms them. When absent, the loader preserves
   * that absence rather than assigning a cohort-wide verification date.
   */
  last_verified_at?: string | null;
};

// Day 0 of the seed calendar is 2026-05-14, an Eastern civil date.
// Date math is done in UTC so it never depends on the server timezone.
const SEED_ANCHOR_UTC = Date.UTC(2026, 4, 14);
const iso = (s: string) => s;
// Returns the correct UTC ISO for an America/New_York wall-clock time,
// `offsetDays` from the anchor. Previously used server-local setHours,
// which rendered every seed event 4 to 5 hours early on UTC production.
const at = (offsetDays: number, hour: number, minute = 0): string => {
  const base = new Date(SEED_ANCHOR_UTC + offsetDays * 86_400_000);
  return easternWallToUtcISO(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    hour,
    minute,
  );
};

/**
 * Alive @ Five 2026 full lineup — May 7 through Sept 24, 21 Thursdays.
 * Hosted by Downtown Frederick Partnership at the Carroll Creek Amphitheater.
 * $5 cash admission, 21+ only, $7 drink tokens.
 *
 * Season lineup verified via maximumcountry.com (Maximum Country 93.5 FM,
 * the series' media partner). Same-week organizer changes override the season
 * announcement and carry their own verification date below.
 */
function aliveAtFiveSeason(): Event[] {
  // Per-week food-truck lineup goes in the optional `trucks` field on
  // each row. Update this list once a week as DFP announces who's at
  // Carroll Creek; the event detail page renders them as chips. Leave
  // the field omitted (or empty) for weeks that haven't been announced.
  const LINEUP: Array<{
    date: string;
    offset: number;
    band: string;
    trucks?: string[];
    sourceUrl?: string;
    verifiedAt?: string;
  }> = [
    { date: "2026-05-07", offset: -7,  band: "24K Event Band" },
    { date: "2026-05-14", offset: 0,   band: "The National Bohemians" },
    { date: "2026-05-21", offset: 7,   band: "Glamour Kitty" },
    { date: "2026-05-28", offset: 14,  band: "The Learned Doctors" },
    { date: "2026-06-04", offset: 21,  band: "Marshal Fuzz" },
    { date: "2026-06-11", offset: 28,  band: "Mack Berry Band" },
    { date: "2026-06-18", offset: 35,  band: "Ahzay & The Squad" },
    { date: "2026-06-25", offset: 42,  band: "Captain Electric" },
    { date: "2026-07-02", offset: 49,  band: "Freddie Long Band" },
    { date: "2026-07-09", offset: 56,  band: "Ben Flournoy" },
    { date: "2026-07-16", offset: 63,  band: "La Unica" },
    { date: "2026-07-23", offset: 70,  band: "Stitch Early" },
    { date: "2026-07-30", offset: 77,  band: "Reverend Smackmaster" },
    { date: "2026-08-06", offset: 84,  band: "Ballistic Berry" },
    {
      date: "2026-08-13",
      offset: 91,
      band: "Freddie Long",
      // DFP changed the published occurrence on Aug 12. The page slug still
      // names the originally announced act, but the organizer's current title
      // and lineup copy both name Freddie Long.
      sourceUrl:
        "https://downtownfrederick.org/vm-event/alive-five-conor-the-wild-hunt-americana-folk/",
      verifiedAt: "2026-08-13T20:38:00.000Z",
    },
    { date: "2026-08-20", offset: 98,  band: "My Chemical Bromance" },
    { date: "2026-08-27", offset: 105, band: "Kate Cosentino" },
    { date: "2026-09-03", offset: 112, band: "Pebble to Pearl" },
    { date: "2026-09-10", offset: 119, band: "Andy Shaw Band" },
    { date: "2026-09-17", offset: 126, band: "Costas Colectivo" },
    { date: "2026-09-24", offset: 133, band: "Special Delivery Band" },
  ];

  return LINEUP.map(({ date, offset, band, trucks, sourceUrl, verifiedAt }, idx) => {
    const isOpener = idx === 0;
    const isFinale = idx === LINEUP.length - 1;
    const title = isOpener
      ? `Alive @ Five: Opening Night · ${band}`
      : isFinale
      ? `Alive @ Five: Season Finale · ${band}`
      : `Alive @ Five · ${band}`;
    return {
      slug: `alive-at-five-${date}`,
      title,
      description:
        `${band} headlines Alive @ Five at the Carroll Creek Amphitheater. ` +
        `It is Downtown Frederick's outdoor happy hour, held every Thursday from May through September, 5 to 8pm. ` +
        `Admission is $5 cash for ages 21 and up. ` +
        `Drink tokens are $7 and cover beer or wine from local breweries and distilleries. ` +
        `Food vendors are on site each week. The series is hosted by the Downtown Frederick Partnership.`,
      starts_at: iso(at(offset, 17, 0)),
      ends_at: iso(at(offset, 20, 0)),
      timezone: "America/New_York",
      is_recurring: true,
      recurrence_text: "Every Thursday, May 7 – September 24, 2026",
      venue_place_slug: "carroll-creek-outdoor-amphitheater",
      venue_name: "Carroll Creek Amphitheater",
      address: "Carroll Creek Park, Frederick, MD 21701",
      // Exact coordinates of the Carroll Creek Outdoor Amphitheater
      // venue pin from places-client.json. Earlier passes used the
      // Linear Park centroid (-77.4084, 39.4128) which is in the
      // right neighborhood but still ~30m off the amphitheater's
      // actual stage. The new venue_place_slug also matches so the
      // event detail page's place lookup resolves cleanly.
      geom: { lng: -77.4087681, lat: 39.4126271 },
      municipality: "frederick",
      category: "music",
      audience: ["adults", "groups"],
      is_free: false,
      price_text: "$5 admission · $7 drink tokens · 21+",
      info: {
        admission: "$5 cash at the gate. 21 and over only, ID required.",
        drinks: "$7 tokens for beer and wine from local breweries and distilleries.",
        food: "Rotating food vendors on site each week.",
      },
      ticket_url: "https://downtownfrederick.org/aliveatfive/",
      source_url: sourceUrl ?? "https://downtownfrederick.org/aliveatfive/",
      organizer: "Downtown Frederick Partnership",
      source: "dfp",
      is_verified: true,
      ...(verifiedAt ? { last_verified_at: verifiedAt } : {}),
      // hero_image intentionally omitted. The earlier SUMMER FIREWORKS
      // pick was the wrong shot — fireworks-over-Carroll-Creek is a
      // 4th-of-July image, not Alive @ Five. Falling through to
      // withVenueThumbs() lets the Carroll Creek Outdoor Amphitheater's
      // venue photo carry the card, which IS an actual amphitheater
      // shot from Google. If we get a real Alive @ Five action shot
      // from DFP later, set hero_image here.
      // Only attach the lineup when we've actually entered it for this
      // week. Empty/undefined → the event detail falls back to the
      // generic "rotating food vendors" line.
      ...(trucks && trucks.length > 0 ? { food_trucks: trucks } : {}),
    };
  });
}

export const EVENTS: Event[] = [
  {
    slug: "great-frederick-fair-2026",
    title: "The Great Frederick Fair",
    description:
      "164th annual county fair. Nine days of livestock shows, agricultural exhibits, midway rides, concerts on the grandstand, and the demolition derby on closing Saturday.",
    // Fri Sep 18 through Sat Sep 26, 2026 per thegreatfrederickfair.com/past-future/
    // (164th edition; 2025 was the 163rd).
    starts_at: iso(at(127, 10, 0)),
    ends_at: iso(at(135, 23, 0)),
    timezone: "America/New_York",
    venue_name: "Frederick Fairgrounds",
    address: "797 E Patrick St, Frederick, MD 21701",
    geom: { lng: -77.3923, lat: 39.4147 },
    municipality: "frederick",
    category: "family",
    audience: ["adults", "kids-0-5", "kids-6-12", "groups"],
    is_free: false,
    price_text: "$10 adult / $5 kids 6–11 / free under 6",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "in-the-streets-frederick-2026",
    title: "In the Streets",
    description:
      "Downtown's signature one-day street festival: live music, food trucks, an art village, a kids' zone, and the Market Street Mile to start the day. The Up The Creek Party carries the evening to 9pm.",
    // Sat Sep 12, 2026 per celebratefrederick.com/events/in-the-street/
    // (festival 11am-5pm; Market Street Mile 9am; Up The Creek Party 5-9pm).
    starts_at: iso(at(121, 11, 0)),
    ends_at: iso(at(121, 21, 0)),
    timezone: "America/New_York",
    venue_name: "Downtown Frederick (Market St)",
    address: "N Market St, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4150 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "kids-0-5", "kids-6-12", "groups"],
    is_free: true,
    organizer: "Celebrate Frederick",
    source_url: "https://www.celebratefrederick.com/calendar-event/in-the-street/",
    source: "celebrate",
    is_verified: true,
  },
  {
    slug: "brunswick-railroad-days-2026",
    title: "Brunswick Railroad Days",
    description:
      "The town's signature heritage festival, 43rd annual. Locomotives on display, working steam, a parade down Potomac Street, C&O Canal walks, and the model railroad museum open both days.",
    // Sat-Sun Oct 3-4, 2026, 10am-5pm both days, per brunswickmd.gov and
    // brunswickrailroaddays.org ("Celebrating 43 years! October 3 & 4, 2026").
    starts_at: iso(at(142, 10, 0)),
    ends_at: iso(at(143, 17, 0)),
    timezone: "America/New_York",
    venue_name: "Downtown Brunswick",
    address: "W Potomac St, Brunswick, MD 21716",
    geom: { lng: -77.6296, lat: 39.3088 },
    municipality: "brunswick",
    category: "family",
    audience: ["adults", "kids-0-5", "kids-6-12"],
    is_free: true,
    source: "manual",
    is_verified: true,
  },
  {
    slug: "thurmont-mainstreet-stroll-2026-05-15",
    title: "Thurmont Main Street Stroll",
    description:
      "Shops open late, sidewalk music from the high-school jazz band, ice cream from the dairy bar, and a community mural reveal.",
    starts_at: iso(at(1, 17, 0)),
    ends_at: iso(at(1, 21, 0)),
    timezone: "America/New_York",
    venue_name: "Downtown Thurmont",
    address: "E Main St, Thurmont, MD 21788",
    geom: { lng: -77.4108, lat: 39.6231 },
    municipality: "thurmont",
    category: "arts",
    audience: ["adults", "kids-6-12"],
    is_free: true,
    source: "manual",
    is_verified: true,
  },
  {
    slug: "weinberg-summer-concert-2026-05-16",
    title: "Punch Brothers at the Weinberg Center",
    description:
      "Acoustic quintet led by Chris Thile in a single-night summer-tour stop at the Weinberg.",
    starts_at: iso(at(2, 20, 0)),
    ends_at: iso(at(2, 22, 30)),
    timezone: "America/New_York",
    venue_place_slug: "weinberg-center-for-the-arts-frederick",
    venue_name: "Weinberg Center for the Arts",
    address: "20 W Patrick St, Frederick, MD 21701",
    geom: { lng: -77.4124, lat: 39.4145 },
    municipality: "frederick",
    category: "music",
    audience: ["adults"],
    is_free: false,
    price_text: "$45–$85",
    ticket_url: "https://weinbergcenter.org",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "linganore-friday-night-2026-05-15",
    title: "Friday Night at Linganore",
    description:
      "Live local music on the lawn, wine by the glass, and the long ridge sunset behind the band shell.",
    starts_at: iso(at(1, 18, 0)),
    ends_at: iso(at(1, 21, 0)),
    timezone: "America/New_York",
    venue_place_slug: "linganore-winecellars-mount-airy",
    venue_name: "Linganore Winecellars",
    address: "13601 Glissans Mill Rd, Mount Airy, MD 21771",
    geom: { lng: -77.1813, lat: 39.4172 },
    municipality: "mount-airy",
    category: "music",
    audience: ["adults", "groups"],
    is_free: false,
    price_text: "$10 cover",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "burgers-and-bonfire-middletown-2026-05-17",
    title: "Burgers & Bonfire at South Mountain Creamery",
    description:
      "Spring evening on the farm. Wood-fired burgers, a bonfire, the herd grazing the back pasture, and live bluegrass.",
    starts_at: iso(at(3, 17, 0)),
    ends_at: iso(at(3, 21, 0)),
    timezone: "America/New_York",
    venue_place_slug: "south-mountain-creamery-middletown",
    venue_name: "South Mountain Creamery",
    address: "8305 Bolivar Rd, Middletown, MD 21769",
    geom: { lng: -77.5571, lat: 39.4787 },
    municipality: "middletown",
    category: "family",
    audience: ["adults", "kids-0-5", "kids-6-12", "groups"],
    is_free: false,
    price_text: "$15 adults / $8 kids",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "catoctin-ranger-hike-2026-05-18",
    title: "Catoctin Ranger Hike: Cunningham Falls",
    description:
      "Free 90-minute ranger-led hike to the 78-foot falls. Stroller- and dog-friendly for the first half; sturdy footwear for the rocky finish.",
    starts_at: iso(at(4, 10, 0)),
    ends_at: iso(at(4, 11, 30)),
    timezone: "America/New_York",
    venue_place_slug: "cunningham-falls-state-park-thurmont",
    venue_name: "Cunningham Falls State Park",
    address: "14039 Catoctin Hollow Rd, Thurmont, MD 21788",
    geom: { lng: -77.4612, lat: 39.6217 },
    municipality: "thurmont",
    category: "outdoors",
    audience: ["kids-6-12", "adults", "kids-0-5"],
    is_free: true,
    source: "manual",
    is_verified: true,
  },
  {
    slug: "delaplaine-first-friday-2026-06-05",
    title: "Delaplaine First Friday Reception",
    description:
      "Three new exhibitions open in the Delaplaine's main galleries. Reception, light bites, and the artist talk on the second floor at 7pm.",
    starts_at: iso(at(22, 17, 0)),
    ends_at: iso(at(22, 21, 0)),
    timezone: "America/New_York",
    venue_place_slug: "delaplaine-arts-center-frederick",
    venue_name: "Delaplaine Arts Center",
    address: "40 S Carroll St, Frederick, MD 21701",
    geom: { lng: -77.4117, lat: 39.4128 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "groups"],
    is_free: true,
    source: "manual",
    is_verified: true,
  },
  {
    slug: "rose-hill-storytime-2026-05-15",
    title: "Story Time at C. Burr Artz",
    description:
      "Free 30-minute story time with songs and movement, geared to kids 2–5. No registration required.",
    starts_at: iso(at(1, 10, 30)),
    ends_at: iso(at(1, 11, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Every Friday",
    venue_place_slug: "c-burr-artz-public-library-frederick",
    venue_name: "C. Burr Artz Public Library",
    address: "110 E Patrick St, Frederick, MD 21701",
    geom: { lng: -77.4083, lat: 39.4140 },
    municipality: "frederick",
    category: "family",
    audience: ["kids-0-5"],
    is_free: true,
    source: "manual",
    is_verified: true,
  },

  // ─── Tentpole recurring & annual Frederick events ──────────────────────────

  // Alive @ Five 2026 full lineup — May 7 through Sept 24, 21 weeks.
  // $5 cash admission, 21+ only, $7 drink tokens. Carroll Creek Amphitheater.
  // Hosted by Downtown Frederick Partnership.
  // Lineup verified May 2026 via maximumcountry.com.
  ...aliveAtFiveSeason(),
  {
    slug: "frederick-festival-of-the-arts-2026",
    title: "Frederick Festival of the Arts",
    description:
      "Annual juried fine art festival along Carroll Creek. 100+ artists from across the country, live music, food, hands-on demos. Saturday and Sunday, 10am–6pm.",
    starts_at: iso(at(23, 10, 0)),
    ends_at: iso(at(24, 18, 0)),
    timezone: "America/New_York",
    venue_place_slug: "carroll-creek-linear-park-frederick",
    venue_name: "Carroll Creek Linear Park",
    address: "Carroll Creek Linear Park, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4137 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "groups", "kids-6-12", "kids-0-5"],
    is_free: true,
    organizer: "Frederick Arts Council",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "baker-park-summer-concert-2026-06-07",
    title: "Sunday at the Bandshell: Summer Concert Series",
    description:
      "Free Sunday-evening concerts at the Joseph D. Baker Park bandshell. Curated by the Frederick Concert Band. Bring a blanket, picnic dinner.",
    starts_at: iso(at(24, 19, 0)),
    ends_at: iso(at(24, 21, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Sunday evenings, June through August",
    venue_place_slug: "baker-park-frederick",
    venue_name: "Joseph D. Baker Park Bandshell",
    address: "121 N Bentz St, Frederick, MD 21701",
    geom: { lng: -77.4194, lat: 39.4188 },
    municipality: "frederick",
    category: "music",
    audience: ["adults", "groups", "kids-6-12", "kids-0-5"],
    is_free: true,
    organizer: "City of Frederick",
    source_url: "https://www.celebratefrederick.com/calendar-event/summer-concert-series-twentydollarprophet/",
    source: "celebrate",
    is_verified: true,
  },
  // The Maryland Wine Festival seed was removed 2026-07-10: the festival is
  // held at the Carroll County Farm Museum in Westminster (Carroll County),
  // not at Linganore, and its 2026 edition ran June 6 (marylandwine.com,
  // carrollcountyfarmmuseum.org). Outside Frederick Radius coverage.
  {
    slug: "catoctin-colorfest-thurmont-2026",
    title: "Catoctin Colorfest",
    description:
      "Massive juried craft and art show in Thurmont, drawing 100,000+ visitors over the second weekend in October. 350+ vendors at Community Park, plus the Town Crafts Show, food and live music.",
    // Sat-Sun Oct 10-11, 2026 per thurmont.com/2236/Colorfest ("Colorfest
    // will be held October 10th & 11th, 2026"). colorfest.org's Oct 11-12
    // is a stale year-bump of the 2025 dates (Sun-Mon is implausible).
    starts_at: iso(at(149, 9, 0)),
    ends_at: iso(at(150, 17, 0)),
    timezone: "America/New_York",
    venue_name: "Thurmont Community Park",
    address: "615 E Main St, Thurmont, MD 21788",
    geom: { lng: -77.4081, lat: 39.6244 },
    municipality: "thurmont",
    category: "arts",
    audience: ["adults", "groups", "kids-6-12"],
    is_free: true,
    organizer: "Catoctin Colorfest, Inc.",
    source: "manual",
    is_verified: true,
  },
  // "Brunswick Heritage Days" was removed 2026-07-10: no such festival
  // exists. It duplicated Brunswick Railroad Days (the slug even said so)
  // under an invented name with contradictory August dates. Brunswick's one
  // heritage festival is Railroad Days, Oct 3-4, 2026 (seeded above).
  {
    slug: "fireworks-baker-park-2026-07-04",
    title: "Independence Day Fireworks at Baker Park",
    description:
      "Frederick's annual 4th of July fireworks display launched over Culler Lake. Pre-show entertainment and food trucks start at 6pm; fireworks at dusk.",
    starts_at: iso(at(51, 18, 0)),
    ends_at: iso(at(51, 22, 0)),
    timezone: "America/New_York",
    venue_place_slug: "baker-park-frederick",
    venue_name: "Joseph D. Baker Park",
    address: "121 N Bentz St, Frederick, MD 21701",
    geom: { lng: -77.4194, lat: 39.4188 },
    municipality: "frederick",
    category: "family",
    audience: ["adults", "groups", "kids-6-12", "kids-0-5"],
    is_free: true,
    organizer: "Celebrate Frederick",
    source_url: "https://www.celebratefrederick.com/calendar-event/fredericks-4th-an-independence-day-celebration-2/",
    source: "celebrate",
    is_verified: true,
  },
  {
    slug: "weinberg-cinema-series-2026-summer",
    title: "Classic Cinema at the Weinberg",
    description:
      "The Weinberg's $5 classic-movie series uses its big screen and historic theater. The June lineup includes North by Northwest, Casablanca, and Rear Window.",
    starts_at: iso(at(30, 19, 30)),
    ends_at: iso(at(30, 22, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Selected Saturday evenings",
    venue_place_slug: "weinberg-center-for-the-arts-frederick",
    venue_name: "Weinberg Center for the Arts",
    address: "20 W Patrick St, Frederick, MD 21701",
    geom: { lng: -77.4128, lat: 39.4147 },
    municipality: "frederick",
    category: "theater",
    audience: ["adults", "groups"],
    is_free: false,
    price_text: "$5 per seat",
    source: "manual",
    is_verified: true,
  },
  {
    slug: "sky-stage-summer-residency-2026",
    title: "Sky Stage: Open Mic Night",
    description:
      "Open mic in the ruins-turned-art-installation at Sky Stage downtown. Sign up at 6:30, performances start at 7. Bring an instrument or read original work.",
    starts_at: iso(at(7, 18, 30)),
    ends_at: iso(at(7, 21, 30)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Weekly through October",
    venue_name: "Sky Stage",
    address: "59 S Carroll St, Frederick, MD 21701",
    geom: { lng: -77.4118, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: ["adults", "groups"],
    is_free: true,
    organizer: "Frederick Arts Council",
    source: "manual",
    is_verified: true,
  },
];

// Event slugs are read from public detail/summary/calendar URLs. A normal
// object makes inherited keys such as `constructor` and `__proto__` look like
// events, which sends malformed links into the event decorator as if they were
// real rows. Use a dictionary with no prototype so unknown slugs stay absent.
export const EVENT_BY_SLUG: Record<string, Event> = Object.assign(
  Object.create(null) as Record<string, Event>,
  Object.fromEntries(EVENTS.map((e) => [e.slug, e])),
);

export function upcomingEvents(now: Date, limit?: number): Event[] {
  const future = EVENTS.filter((e) => new Date(e.ends_at) >= now).sort(
    (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)
  );
  return limit ? future.slice(0, limit) : future;
}

export function eventsToday(now: Date): Event[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return EVENTS.filter((e) => {
    const s = new Date(e.starts_at);
    return s >= start && s < end;
  }).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
}

export function eventsThisWeekend(now: Date): Event[] {
  const dow = now.getDay();
  const friday = new Date(now);
  friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
  friday.setHours(0, 0, 0, 0);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  return EVENTS.filter((e) => {
    const s = new Date(e.starts_at);
    return s >= friday && s < monday;
  }).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
}

export function eventsByMunicipality(slug: string): Event[] {
  return EVENTS.filter((e) => e.municipality === slug);
}

export function eventsAtVenue(placeSlug: string): Event[] {
  return EVENTS.filter((e) => e.venue_place_slug === placeSlug);
}
