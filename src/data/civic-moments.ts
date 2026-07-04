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

/** A plain-language question/answer for the hub's FAQ (also emitted as FAQPage
 *  JSON-LD). Keep answers to a sentence or two, sourced by the items above. */
export type MomentFaq = {
  q: string;
  a: string;
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
  /** Plain-language FAQ, rendered at the foot of the hub. */
  faq?: MomentFaq[];
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
    subtitle: "Where and when to watch the fireworks, town by town.",
    spotlightLead: "Fireworks over Baker Park on Saturday, plus shows all weekend.",
    // July 4, 2026 is a Saturday; the federal holiday is observed Friday the 3rd.
    // Shows spread across the week (Walkersville the 30th and 2nd, Mount Airy and
    // Brunswick on the 3rd, Frederick's big one on the 4th), so the hub runs the
    // whole window.
    starts: "2026-07-01",
    ends: "2026-07-05",
    accent: "var(--app-brand)",
    icon: "Sparkles",
    weatherSensitive: true,
    intro:
      "The county's marquee is Frederick's 4th at Baker Park on Saturday: a free noon-to-dusk festival with two music stages, food and drink gardens, a 1:30 flyover, and fireworks after dark. But the towns stagger their shows across the week, so there's a night for every part of the county. Here's what's on, with start times where the organizers published them.",
    note: "Most shows go off 'at dusk,' and community-run displays run a little loose, so the printed clock times are the organizers' best estimate. Confirm on the official page before you head out. This is America's 250th, so several shows are extra this year.",
    sections: [
      {
        heading: "Fireworks, town by town",
        items: [
          {
            kind: "fireworks",
            title: "Frederick's 4th",
            where: "City of Frederick · Baker Park",
            address: "Baker Park (fireworks launched from Parkway Elementary)",
            when: "Sat, July 4 · festival noon to dusk, fireworks at dusk (about 9:30 PM)",
            note: "Free. Two music stages, 30+ food vendors, three drink gardens, a 1:30 PM flyover. The official page lists only 'at dusk'; 9:30 is the usual read.",
            source_url: "https://www.celebratefrederick.com/events/fredericks-fourth/fireworks/",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Mount Airy fireworks",
            where: "Mount Airy · Fire Company carnival grounds",
            address: "1008 Twin Arch Rd, Mount Airy",
            when: "Fri, July 3 · gates 4 PM, band 5 to 9 PM, fireworks about 9:30 PM",
            note: "Free, free parking, and live-streamed. A reading of the Declaration comes right before the show.",
            source_url: "https://www.mtairyfireworks.com/home.html",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Brunswick Independence Day",
            where: "Brunswick · Municipal Pool",
            address: "99 Cummings Drive, Brunswick",
            when: "Fri, July 3 · free pool swim + vendors 5 to 8 PM, fireworks about 9 PM",
            note: "Live DJ, food, community tables. Rain date is Sunday, July 5 (fireworks only).",
            source_url: "https://brunswickmd.gov/specialevents",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Frederick Keys fireworks nights",
            where: "Nymeo Field at Harry Grove Stadium",
            address: "21 Stadium Drive, Frederick",
            when: "Fri, July 3 · 7 PM game, postgame fireworks · and Sun, July 5 · 6 PM game, postgame fireworks",
            note: "Two ballpark shows bookend the weekend. July 3 is billed as the biggest of the year. (The July 4 game is a 1 PM day game, no fireworks.)",
            source_url: "https://www.milb.com/frederick/news/frederick-keys-announce-2026-firework-nights",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Walkersville fire carnival",
            where: "Walkersville · Volunteer Fire Company grounds",
            address: "79 W. Frederick St, Walkersville",
            when: "Carnival June 29 to July 4 · fireworks Tue, June 30 at 10 PM (aerial) and Thu, July 2 at 10 PM (ground display)",
            note: "Free admission and parking. The July 2 ground display is a new America 250 show. No parade this year.",
            source_url: "https://www.walkersvillefire.com/apps/public/news/newsView.cfm?News_ID=169",
            confidence: "confirmed",
          },
          {
            kind: "fireworks",
            title: "Adventure Park USA (near New Market)",
            where: "New Market / Monrovia · Adventure Park USA",
            address: "9130 Old National Pike, Monrovia",
            when: "Thu, July 2 · fireworks in the evening (start time not published)",
            note: "A private park's show, two days early, that the Town of New Market points residents to. Confirm the time with the park.",
            source_url: "https://adventureparkusa.com/events-specials/",
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
            note: "All of Fleming Ave closes, plus stretches of W 2nd St, College Ave, Carroll Pkwy, and the College Terraces. Clock times aren't published.",
            source_url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=2487&ARC=2875",
            confidence: "confirmed",
          },
          {
            kind: "tip",
            title: "Park free in the decks, walk in",
            where: "City of Frederick",
            note: "City decks and on-street parking are free Friday, July 3 through Saturday, July 4. Park in a deck and walk over; leave a little early or wait out the 45 to 60 min exit crawl.",
            source_url: "https://www.cityoffrederickmd.gov/m/newsflash/home/detail/8208",
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
          {
            kind: "tip",
            title: "No pets in the park",
            where: "City of Frederick",
            note: "Pets are not permitted in Baker Park on the Fourth. Leave them home where it's quieter, too.",
            source_url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=2487&ARC=2875",
            confidence: "confirmed",
          },
        ],
      },
      {
        heading: "Around the county on the Fourth",
        items: [
          {
            kind: "activity",
            title: "Frederick Keys day game",
            where: "Nymeo Field at Harry Grove Stadium",
            when: "Sat, July 4 · 1 PM first pitch vs. Brooklyn",
            note: "An afternoon at the ballpark before the evening shows. Early fans get a 250th prize pack.",
            source_url: "https://www.visitfrederick.org/blog/stories/post/how-to-celebrate-july-4th-in-frederick/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "Barbara Fritchie Classic",
            where: "The Great Frederick Fairgrounds",
            address: "797 E. Patrick St, Frederick",
            when: "Sat, July 4 · gates 10 AM",
            note: "The 105th running of the country's longest continuously run half-mile dirt-track motorcycle race. Tickets via MDTix. No glass bottles.",
            source_url: "https://www.barbarafritchieclassic.com/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "West Frederick Farmers Market",
            where: "West Frederick · Baughmans Lane",
            when: "Sat, July 4 · 10 AM to 1 PM",
            note: "The Saturday market runs as usual on the holiday. Good for cookout produce and flowers.",
            source_url: "https://www.frederickfarmersmarket.com/",
            confidence: "pattern",
          },
          {
            kind: "activity",
            title: "Fourth at the Furnace",
            where: "Catoctin Furnace · north county",
            note: "Historic ironworking village programming near Thurmont: the Museum of the Ironworker, blacksmith shop, and cemetery trail. Confirm hours on their site.",
            source_url: "https://www.visitfrederick.org/blog/stories/post/how-to-celebrate-july-4th-in-frederick/",
            confidence: "pattern",
          },
        ],
      },
      {
        heading: "Closures and getting around",
        items: [
          {
            kind: "closure",
            title: "Offices closed Friday, July 3",
            where: "County-wide",
            note: "The holiday is observed Friday, July 3, so county and city offices, courts, banks, and post offices are closed. Most reopen Monday, July 6.",
            source_url: "https://www.frederickcountymd.gov/4367/County-Government-Holidays",
            confidence: "confirmed",
          },
          {
            kind: "closure",
            title: "Libraries closed the whole weekend",
            where: "Frederick County Public Libraries",
            note: "All FCPL branches are closed Friday, July 3 and Saturday, July 4. Curbside and phone reference are out both days too.",
            source_url: "https://www.fcpl.org/holiday-closings",
            confidence: "confirmed",
          },
          {
            kind: "closure",
            title: "No bus or train on Saturday",
            where: "TransIT + MARC Brunswick Line",
            note: "TransIT runs a weekday-holiday schedule Friday, July 3 and does not run Saturday, July 4. The MARC Brunswick Line runs Friday but not the holiday Saturday.",
            source_url: "https://www.mta.maryland.gov/marc-holiday-service",
            confidence: "confirmed",
          },
          {
            kind: "closure",
            title: "Trash and drop-off changes",
            where: "City of Frederick + county",
            note: "City residential pickup does not run Friday, July 3 (set out Sunday night for Monday). The county's Reichs Ford Road drop-off is closed Saturday, July 4; county curbside runs as scheduled.",
            source_url: "https://www.cityoffrederickmd.gov/m/newsflash/home/detail/8208",
            confidence: "confirmed",
          },
        ],
      },
    ],
    faq: [
      {
        q: "What time are the fireworks?",
        a: "Frederick's 4th at Baker Park goes off at dusk on Saturday, July 4, usually around 9:30 PM. On Friday the 3rd, Mount Airy is about 9:30 PM and Brunswick about 9 PM. The Keys shoot postgame on the 3rd and the 5th.",
      },
      {
        q: "Where's the best place to watch in Frederick?",
        a: "The Fleming Ave pool area, the Frederick High front lawn, and the Carillon side of Baker Park all have open sightlines. Skip the bandshell seating and anywhere behind the trees.",
      },
      {
        q: "Where do I park?",
        a: "City parking decks and on-street parking are free from Friday, July 3 through Saturday, July 4. Park in a deck downtown and walk over; it beats hunting for a spot near the park.",
      },
      {
        q: "Can I bring my dog?",
        a: "No. Pets aren't permitted in Baker Park on the Fourth, and the crowds and booms are hard on them anyway. Leave them home.",
      },
      {
        q: "What if it rains?",
        a: "Frederick's 4th is rain or shine with no rain date; activities just pause for storms and resume after. Brunswick's rain date is Sunday, July 5 (fireworks only).",
      },
      {
        q: "What should I bring?",
        a: "Chairs or a blanket, sunscreen and water for the afternoon, and some cash. The beer, wine, and spirits gardens have a one-time $5 cover for the day.",
      },
      {
        q: "How long does it take to leave?",
        a: "Expect the exit crawl to run 45 to 60 minutes after the finale. Leave a few minutes early, or settle in and wait it out.",
      },
      {
        q: "Is there a show on Saturday the 4th besides Frederick?",
        a: "Frederick's 4th is the main Saturday show. Most of the towns run earlier in the week: Walkersville on June 30 and July 2, Mount Airy and Brunswick on Friday the 3rd, and the Keys on the 3rd and 5th.",
      },
    ],
  },
  {
    slug: "great-frederick-fair-2026",
    title: "The Great Frederick Fair",
    subtitle: "Nine days of blue ribbons, midway lights, and grandstand nights.",
    spotlightLead: "The county fair is on at the fairgrounds this week.",
    starts: "2026-09-14",
    ends: "2026-09-26",
    accent: "var(--app-accent)",
    icon: "Tent",
    intro:
      "The county's biggest agricultural gathering takes over the East Patrick Street fairgrounds for nine days every September, and 2026 runs Friday the 18th through Saturday the 26th. Expect the full county-fair sweep: livestock barns and 4-H judging, a carnival midway, fair food, and a grandstand that swings from touring concerts to demolition derbies. Gate admission is modest and kids ten and under get in free.",
    note: "Times and prices are from the fair's official pages. Parking fees differed between two of those pages, so confirm at the gate.",
    sections: [
      {
        heading: "The nine days",
        items: [
          {
            kind: "activity",
            title: "Fair run: nine days",
            where: "The Great Frederick Fair",
            address: "797 E. Patrick St, Frederick",
            when: "Fri, Sept 18 to Sat, Sept 26",
            note: "Gates open 4 PM on opening Friday, then 9 AM to 10 PM every day through the 26th.",
            source_url: "https://thegreatfrederickfair.com/come-to-the-fair/",
            confidence: "confirmed",
          },
          {
            kind: "tip",
            title: "Admission",
            where: "Fairgrounds gates",
            note: "Adults 11 and over are $10 online or $15 at the gate; kids 10 and under are free. Advance grandstand tickets include gate admission. Senior, military, and kids' discount days are posted on the site.",
            source_url: "https://thegreatfrederickfair.com/come-to-the-fair/",
            confidence: "confirmed",
          },
          {
            kind: "tip",
            title: "Parking",
            where: "On-site fairgrounds lots",
            note: "Lots open 9 AM daily. Expect roughly $10 to $15 for the infield and $5 to $10 for the outer lots; the fair's two pages list different figures, so confirm the price at the gate.",
            source_url: "https://thegreatfrederickfair.com/come-to-the-fair/",
            confidence: "pattern",
          },
        ],
      },
      {
        heading: "Grandstand nights",
        items: [
          {
            kind: "activity",
            title: "Concerts",
            where: "The Grandstand",
            when: "Daughtry Fri 9/18, Pop 2000 Tour Sat 9/19, Neal McCoy Sun 9/20, Danny Gokey Thu 9/24, a Taylor Swift tribute Fri 9/25, Warren Zeiders Sat 9/26",
            note: "Ticketed. Advance tickets include gate admission; doors open two hours before showtime.",
            source_url: "https://thegreatfrederickfair.com/grandstand/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "Motorsports",
            where: "The Grandstand",
            when: "Truck & Tractor Pull Mon 9/21, Demolition Derby (cars) Tue 9/22, Demolition Derby (trucks & vans) Wed 9/23",
            note: "The ticketed grandstand nights between the concerts.",
            source_url: "https://thegreatfrederickfair.com/grandstand/",
            confidence: "confirmed",
          },
        ],
      },
      {
        heading: "On the grounds",
        items: [
          {
            kind: "activity",
            title: "Midway, livestock, and fair food",
            where: "Across the fairgrounds",
            when: "All nine days",
            note: "Carnival rides, agricultural exhibits, livestock judging, and the food. A Jack Pass ($35) bundles a day's gate admission with a ride-all-day wristband.",
            source_url: "https://thegreatfrederickfair.com/the-carnival/",
            confidence: "confirmed",
          },
        ],
      },
    ],
    faq: [
      {
        q: "When is the fair?",
        a: "Friday, September 18 through Saturday, September 26, 2026. It opens at 4 PM the first Friday, then runs 9 AM to 10 PM every day after.",
      },
      {
        q: "How much is admission?",
        a: "Adults are $10 online or $15 at the gate, and kids 10 and under are free. If you buy a grandstand concert ticket in advance, it includes gate admission.",
      },
      {
        q: "Is it good for kids?",
        a: "Yes. Kids 10 and under get in free, the midway and livestock barns are the heart of the day, and a Jack Pass bundles admission with a ride-all-day wristband.",
      },
      {
        q: "Where do I park?",
        a: "On-site lots open at 9 AM. Bring cash to be safe: the fair's pages quote different parking figures, so confirm the price at the gate.",
      },
    ],
  },
  {
    slug: "in-the-street-2026",
    title: "In The Streets",
    subtitle: "Downtown's free September street festival, forty-plus years running.",
    spotlightLead: "Market Street closes for In The Streets this Saturday.",
    starts: "2026-09-09",
    ends: "2026-09-12",
    accent: "var(--app-brand)",
    icon: "PartyPopper",
    weatherSensitive: true,
    intro:
      "For more than four decades, In The Streets has closed Market Street to traffic and filled it with stages, food, and crowds that now top seventy-five thousand. In 2026 it lands on Saturday, September 12: the festival core runs late morning to late afternoon, with a morning road race, a midday craft-beverage garden, and an evening party along Carroll Creek. It is Celebrate Frederick's signature end-of-summer day, and it's free.",
    note: "Times are from Celebrate Frederick's event page. Exact road-closure hours aren't published yet; check their parking and directions link closer to the day.",
    sections: [
      {
        heading: "The day",
        items: [
          {
            kind: "activity",
            title: "In The Streets festival",
            where: "Downtown Frederick, Market Street",
            address: "N. Market St, Frederick",
            when: "Sat, Sept 12 · 11 AM to 5 PM",
            note: "Free. Several entertainment stages, food from Frederick restaurants, and vendors down the length of the street.",
            source_url: "https://www.celebratefrederick.com/events/in-the-street/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "Market Street Mile",
            where: "Market Street",
            when: "Sat, Sept 12 · 9 AM",
            note: "The morning road race that kicks the day off before the festival opens.",
            source_url: "https://www.celebratefrederick.com/events/in-the-street/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "Craft Beverage Experience",
            where: "Downtown Frederick",
            when: "Sat, Sept 12 · noon to 5 PM",
            note: "A midday tasting garden of local breweries, distilleries, and wineries.",
            source_url: "https://www.celebratefrederick.com/events/in-the-street/",
            confidence: "confirmed",
          },
          {
            kind: "activity",
            title: "Up The Creek party",
            where: "Carroll Creek Urban Park",
            when: "Sat, Sept 12 · 5 to 9 PM",
            note: "The evening party along the creek that closes out the day.",
            source_url: "https://www.celebratefrederick.com/events/in-the-street/",
            confidence: "confirmed",
          },
        ],
      },
      {
        heading: "Getting there",
        items: [
          {
            kind: "closure",
            title: "Market Street is closed to traffic",
            where: "Downtown Frederick",
            note: "The festival is staged in the street, so Market Street closes for the day. The exact hours and block boundaries aren't posted yet; use the city decks and check the organizer's parking link before you head in.",
            source_url: "https://www.celebratefrederick.com/events/in-the-street/",
            confidence: "pattern",
          },
        ],
      },
    ],
    faq: [
      {
        q: "When is In The Streets?",
        a: "Saturday, September 12, 2026. The festival itself runs 11 AM to 5 PM, with the Market Street Mile at 9 AM and the Up The Creek party from 5 to 9 PM.",
      },
      {
        q: "Is it free?",
        a: "Yes, the street festival is free to walk. The craft-beverage tasting garden and the Market Street Mile are the ticketed add-ons.",
      },
      {
        q: "Where do I park?",
        a: "Market Street is closed for the festival, so park in a city deck and walk in. Check Celebrate Frederick's parking and directions link for the day's closures.",
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
 *   - Great Frederick Fair (Sept)   POPULATED (great-frederick-fair-2026).
 *   - In the Street (Sept)          POPULATED (in-the-street-2026).
 *   - Oktoberfest / harvest (Oct)   Schifferstadt Oktoberfest, orchards, foliage.
 *   - Halloween (late Oct)          Trick-or-treat times per town, downtown events.
 *   - Veterans Day (Nov 11)         Ceremonies + parades.
 *   - Kris Kringle / holiday (Dec)  Downtown Frederick holiday market, tree
 *                                   lighting, Sailing Through the Winter Solstice
 *                                   on Carroll Creek, per-town lightings.
 *   - New Year's Eve (Dec 31)       Downtown "key drop" + first-night events.
 */
