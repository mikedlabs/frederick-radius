/**
 * Civic moments — the county's big shared occasions, as curated hubs.
 *
 * `holidays.ts` answers "what's closed today"; `seasonal-notes.ts` gives a
 * one-line almanac beat. A CIVIC MOMENT is the richer thing above them: a
 * hand-curated guide to a weekend the whole county turns out for (the Fourth of
 * July fireworks, First Saturday's gallery walk, the Great Frederick Fair,
 * In the Street, the holiday markets). During its date window it surfaces as a
 * festive spotlight on /today and a full hub at /moments/[slug].
 *
 * Honesty rules, same as every curated surface: every claim carries a real
 * `source_url`, times a publisher confirmed are `confirmed` while annual
 * patterns are `pattern` (rendered with an "approximate, confirm on the day"
 * hedge), and the window self-hides the moment outside its dates. Editable by
 * hand (owner adds next year's dates); no fabrication.
 *
 * Dates are Eastern civil dates (YYYY-MM-DD). `starts` is when the spotlight
 * begins showing (usually a few days before), `ends` its last day inclusive.
 */

export type MomentItemKind = "fireworks" | "parade" | "activity" | "closure" | "tip";

export type MomentItem = {
  kind: MomentItemKind;
  title: string;
  /** Town/place label ("City of Frederick", "Thurmont"). */
  where?: string;
  address?: string;
  /** Human when-line ("July 4 · fireworks at dusk, ~9:15 PM"). */
  when?: string;
  /** One-line detail. */
  note?: string;
  /** The official page this came from (required for anything sourced). */
  source_url?: string;
  /** confirmed = a publisher stated it for this year; pattern = reliable annual
   *  recurrence (render with a "confirm on the day" hedge). */
  confidence?: "confirmed" | "pattern";
};

export type MomentSection = {
  heading: string;
  items: MomentItem[];
};

export type CivicMoment = {
  slug: string;
  /** Big serif hub title ("The Fourth in Frederick County"). */
  title: string;
  /** One-line standfirst. */
  subtitle: string;
  /** Spotlight lead — the single most useful line ("Fireworks over Baker Park tonight"). */
  spotlightLead: string;
  /** Eastern window the moment is live (inclusive). */
  starts: string;
  ends: string;
  /** Palette accent token + a lucide icon name for the spotlight/hub. */
  accent: string;
  icon: string;
  /** Editorial intro paragraph for the hub. */
  intro: string;
  /** True for outdoor moments — the hub shows a weather-check line. */
  weatherSensitive?: boolean;
  sections: MomentSection[];
  /** A "these dates are approximate" footnote when items lean on patterns. */
  note?: string;
};

/**
 * The curated moment registry. Add next year's dates by editing the `starts`/
 * `ends` and confirming item times. Populated from sourced research; see each
 * item's source_url. The Fourth is the first; the moments CALENDAR below lists
 * the others to fill in as their seasons approach.
 */
export const CIVIC_MOMENTS: CivicMoment[] = [
  {
    slug: "fourth-of-july-2026",
    title: "The Fourth in Frederick County",
    subtitle: "Where to watch the fireworks, town by town.",
    spotlightLead: "Fireworks over Baker Park this weekend.",
    // July 4, 2026 is a Saturday; the shows spread across the week (Mount Airy /
    // Brunswick on the 3rd, Brunswick's rain date the 5th), so the hub runs the
    // whole window.
    starts: "2026-07-01",
    ends: "2026-07-05",
    accent: "var(--app-brand)",
    icon: "Sparkles",
    weatherSensitive: true,
    intro:
      "Frederick's marquee is Frederick's 4th at Baker Park: a free noon-to-dusk festival with two music stages, food and drink gardens, a flyover, and fireworks at dark. But the towns spread their shows across the whole week, so you can catch several nights. Here's the county, town by town.",
    note: "Most shows go off 'at dusk,' and they're community-run, so the printed times are approximate. Confirm on the organizer's page before you head out.",
    sections: [
      {
        heading: "Fireworks, town by town",
        items: [
          {
            kind: "fireworks",
            title: "Frederick's 4th",
            where: "City of Frederick · Baker Park",
            address: "Baker Park (fireworks launched from Parkway Elementary)",
            when: "Sat, July 4 · festival noon to dusk, fireworks ~9:30 PM",
            note: "Free. Two music stages, 30+ food vendors, three drink gardens, a patriotic flyover.",
            source_url: "https://www.celebratefrederick.com/events/fredericks-fourth/",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Mount Airy fireworks",
            where: "Mount Airy · Fire Company carnival grounds",
            address: "1008 Twin Arch Rd, Mount Airy",
            when: "Fri, July 3 · gates 4 PM, music 5 PM, fireworks ~9:30 PM",
            note: "Free. Bring chairs and coolers; food trucks on site.",
            source_url: "https://mountairyfireworks.com/",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Brunswick Independence Day",
            where: "Brunswick · Municipal Pool",
            address: "99 Cummings Drive, Brunswick",
            when: "Fri, July 3 · free pool + vendors 5 to 8 PM, fireworks ~9 PM (rain date Sun, July 5)",
            source_url: "https://brunswickmd.gov/specialevents",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Walkersville fire carnival",
            where: "Walkersville · Volunteer Fire Company grounds",
            when: "Carnival week (late June to July 4) with multiple fireworks nights",
            note: "The nights vary year to year. Check the carnival page for this year's schedule.",
            source_url: "https://www.walkersvillefire.com/content/carnival/",
            confidence: "pattern",
          },
          {
            kind: "fireworks",
            title: "Emmitsburg Community Heritage Day",
            where: "Emmitsburg · Community Park",
            when: "Late June (the Saturday before the 4th) · fireworks at dark",
            note: "North county's big one, with a parade earlier in the day. Runs before the holiday weekend.",
            source_url: "https://www.emmitsburgevents.com/",
            confidence: "pattern",
          },
        ],
      },
      {
        heading: "Parades",
        items: [
          {
            kind: "parade",
            title: "Middletown July 4th",
            where: "Middletown · Community Park",
            when: "July 4 · all-day festival, parade late afternoon, fireworks at dusk",
            note: "The valley's classic Fourth: parade, food, kids' games, live music, fireworks. Confirm the step-off time with the town.",
            source_url: "https://www.middletown.md.us/",
            confidence: "pattern",
          },
        ],
      },
      {
        heading: "Getting to Baker Park",
        items: [
          {
            kind: "closure",
            title: "Road closures around the park",
            where: "City of Frederick",
            note: "Fleming Ave and the streets ringing Baker Park (parts of W 2nd, College Ave, Carroll Pkwy) close for the festival.",
            source_url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=2487&ARC=2875",
            confidence: "confirmed",
          },
          {
            kind: "tip",
            title: "Park free in the decks, walk in",
            where: "City of Frederick",
            note: "City parking decks are free on the Fourth. Park downtown and walk over; leave early or wait out the 45 to 60 min exit crawl. No pets in the park that day.",
            source_url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=2487&ARC=2875",
            confidence: "confirmed",
          },
          {
            kind: "tip",
            title: "Best places to watch",
            where: "City of Frederick",
            note: "Fleming Ave pool area, Frederick High front lawn, and the Carillon side of Baker Park. Skip the bandshell seating and spots behind trees.",
            source_url: "https://www.celebratefrederick.com/events/fredericks-fourth/fireworks/",
            confidence: "confirmed",
          },
        ],
      },
      {
        heading: "Also on the Fourth",
        items: [
          {
            kind: "activity",
            title: "Frederick Keys baseball",
            where: "Nymeo Field at Harry Grove Stadium",
            note: "The Keys often play home on or around the Fourth, sometimes with post-game fireworks. Check tonight's score card.",
            source_url: "https://www.milb.com/frederick/schedule",
            confidence: "pattern",
          },
          {
            kind: "closure",
            title: "Holiday hours",
            where: "County-wide",
            note: "The Fourth lands on a Saturday, so the federal holiday is observed Friday, July 3. Expect banks, libraries, and government offices closed; trash and transit may run holiday schedules.",
            confidence: "confirmed",
          },
        ],
      },
    ],
  },
];

/** en-CA gives a lexicographically-sortable Eastern YYYY-MM-DD. */
function easternDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The civic moment live on `now` (Eastern, inclusive window), or null. When two
 *  overlap, the one that started most recently wins. Pure. */
export function activeMoment(now: Date): CivicMoment | null {
  const today = easternDay(now);
  const live = CIVIC_MOMENTS.filter((m) => m.starts <= today && today <= m.ends);
  if (live.length === 0) return null;
  return live.sort((a, b) => (a.starts < b.starts ? 1 : -1))[0];
}

export function momentBySlug(slug: string): CivicMoment | null {
  return CIVIC_MOMENTS.find((m) => m.slug === slug) ?? null;
}

/**
 * MOMENTS CALENDAR — the year's other connected occasions worth a hub, in the
 * order they land. Kept as a comment so the intent is documented without
 * shipping empty stubs:
 *
 *   - First Saturday (monthly)      Downtown gallery walk + late shops. Computable.
 *   - Memorial Day (late May)       Parades (Middletown, Thurmont), pools open.
 *   - Fourth of July (this hub)     County-wide fireworks + parades.
 *   - Alive @ Five season (May–Sep) Thursday concerts — already an event series.
 *   - Great Frederick Fair (Sept)   The county's marquee week at the fairgrounds.
 *   - In the Street (Sept)          Downtown Frederick's street festival.
 *   - Oktoberfest / harvest (Oct)   Schifferstadt Oktoberfest, orchards, foliage.
 *   - Halloween (late Oct)          Trick-or-treat times per town, downtown events.
 *   - Veterans Day (Nov 11)         Ceremonies + parades.
 *   - Kris Kringle / holiday (Dec)  Downtown Frederick holiday market, tree
 *                                   lighting, Sailing Through the Winter Solstice
 *                                   on Carroll Creek, per-town lightings.
 *   - New Year's Eve (Dec 31)       Downtown "key drop" + first-night events.
 */
