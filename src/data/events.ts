import type { LngLat } from "@/lib/geo";

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
  organizer?: string;
  hero_image?: string;
  source: "dfp" | "celebrate" | "county" | "manual" | "seed";
  is_verified: boolean;
};

const today = new Date("2026-05-14T00:00:00-04:00");
const iso = (date: Date) => date.toISOString();
const at = (offsetDays: number, hour: number, minute = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
};

export const EVENTS: Event[] = [
  {
    slug: "first-friday-may-2026-frederick",
    title: "First Friday — June Art Walk",
    description:
      "Downtown Frederick's monthly evening street festival. Galleries open late, sidewalks programmed with music, restaurants spill onto the patios. The Delaplaine and dozens of N Market shops host the headline openings.",
    starts_at: iso(at(22, 17, 0)),
    ends_at: iso(at(22, 21, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "First Friday of every month",
    venue_name: "Downtown Frederick",
    address: "N Market St, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4165 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "groups", "kids-6-12"],
    is_free: true,
    organizer: "Downtown Frederick Partnership",
    source: "dfp",
    is_verified: true,
  },
  {
    slug: "carroll-creek-color-launch-2026",
    title: "Color on the Creek — Opening Weekend",
    description:
      "The annual sailboat installation returns to Carroll Creek. 100+ illuminated mini sailboats designed by local artists and community groups float the linear park from June to September.",
    starts_at: iso(at(18, 18, 0)),
    ends_at: iso(at(20, 22, 0)),
    timezone: "America/New_York",
    venue_place_slug: "carroll-creek-linear-park-frederick",
    venue_name: "Carroll Creek Linear Park",
    address: "Carroll Creek, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4137 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "groups", "kids-0-5", "kids-6-12"],
    is_free: true,
    organizer: "Color on the Creek",
    source: "celebrate",
    is_verified: true,
  },
  {
    slug: "saturday-farmers-market-frederick-2026-05-17",
    title: "West Frederick Farmers Market",
    description:
      "Year-round Saturday market with 60+ vendors: produce, breads, flowers, ferments, and coffee. Rain or shine; pets welcome.",
    starts_at: iso(at(3, 10, 0)),
    ends_at: iso(at(3, 13, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Every Saturday, year-round",
    venue_name: "Frederick Fairgrounds",
    address: "797 E Patrick St, Frederick, MD 21701",
    geom: { lng: -77.3923, lat: 39.4147 },
    municipality: "frederick",
    category: "market",
    audience: ["adults", "kids-0-5", "kids-6-12"],
    is_free: true,
    source: "celebrate",
    is_verified: true,
  },
  {
    slug: "great-frederick-fair-2026",
    title: "The Great Frederick Fair",
    description:
      "152nd annual county fair. Ten days of livestock shows, agricultural exhibits, midway rides, concerts on the grandstand, and the demolition derby on closing Saturday.",
    starts_at: iso(at(125, 10, 0)),
    ends_at: iso(at(134, 23, 0)),
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
      "Downtown's signature one-day street festival: live music on six stages, food trucks, an art village, a kids' zone on Baker Park, and a 5K to start the day.",
    starts_at: iso(at(110, 11, 0)),
    ends_at: iso(at(110, 21, 0)),
    timezone: "America/New_York",
    venue_name: "Downtown Frederick (Market St)",
    address: "N Market St, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4150 },
    municipality: "frederick",
    category: "arts",
    audience: ["adults", "kids-0-5", "kids-6-12", "groups"],
    is_free: true,
    organizer: "Celebrate Frederick",
    source: "celebrate",
    is_verified: true,
  },
  {
    slug: "brunswick-railroad-days-2026",
    title: "Brunswick Railroad Days",
    description:
      "The town's signature heritage festival. Locomotives on display, working steam, a parade, the C&O Canal stretch lit up after dark, and the model railroad museum open late.",
    starts_at: iso(at(140, 10, 0)),
    ends_at: iso(at(141, 21, 0)),
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
    title: "Punch Brothers — Weinberg Center",
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
    title: "Catoctin Ranger Hike — Cunningham Falls",
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
    slug: "idiom-trivia-night-2026-05-14",
    title: "Trivia Night at Idiom Brewing",
    description:
      "Free pub trivia, six rounds, food truck out back, gift-card prizes for the top three teams.",
    starts_at: iso(at(0, 19, 0)),
    ends_at: iso(at(0, 22, 0)),
    timezone: "America/New_York",
    is_recurring: true,
    recurrence_text: "Every Thursday",
    venue_place_slug: "idiom-brewing-frederick",
    venue_name: "Idiom Brewing Co.",
    address: "340 E Patrick St, Frederick, MD 21701",
    geom: { lng: -77.4044, lat: 39.4137 },
    municipality: "frederick",
    category: "bar",
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
];

export const EVENT_BY_SLUG = Object.fromEntries(
  EVENTS.map((e) => [e.slug, e])
) as Record<string, Event>;

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
