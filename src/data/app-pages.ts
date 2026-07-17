/**
 * App-page registry — the guide, tool, and directory surfaces the app
 * itself ships, made searchable. Typing what a page ANSWERS should find
 * the page: "public restroom" → Amenities, "post office" → Shipping,
 * "power outage" → Pulse, "brunch" → the brunch guide. Before this,
 * search knew places/events/towns/categories but not the app's own
 * best answers (only eight hand-picked overlay quick actions).
 *
 * Titles/blurbs mirror each page's own metadata (the shipped truth).
 * Keywords are the words residents type, kept tight — every keyword is a
 * claim that the page answers it, so no keyword rides on a page that
 * would disappoint. Pure data, client-safe.
 */

export type AppPage = {
  href: string;
  title: string;
  /** One line of what the page answers, in the page's own voice. */
  blurb: string;
  /** Words and short phrases that should find this page. */
  keywords: string[];
};

export const APP_PAGES: AppPage[] = [
  // ── Food & drink guides ──
  { href: "/brunch", title: "Brunch guide", blurb: "Every verified weekend brunch spot, with days and hours.", keywords: ["brunch", "mimosa", "bottomless"] },
  { href: "/happy-hour", title: "Happy hour guide", blurb: "Verified happy-hour schedules: the deal, the hours, the fine print.", keywords: ["happy hour", "drink specials", "drink deals"] },
  { href: "/deals", title: "Daily deals", blurb: "Taco Tuesdays, wing nights, verified daily specials by day.", keywords: ["deals", "specials", "taco tuesday", "wing night", "trivia night"] },
  { href: "/beer", title: "County pour book", blurb: "174 pours from 17 breweries; find your flavor, stamp your passport.", keywords: ["beer", "brewery", "breweries", "taproom", "pour"] },
  { href: "/food-trucks", title: "Food trucks", blurb: "Food trucks, coffee carts, and treat trucks, with each vendor's feed.", keywords: ["food truck", "food trucks"] },
  { href: "/live-music", title: "Live music", blurb: "Who's on stage: brewery, winery, and bar lineups plus ticketed shows.", keywords: ["live music", "bands", "who is playing", "lineup"] },

  // ── Practical tools ──
  { href: "/parking", title: "Parking guide", blurb: "Downtown garages, event parking, ParkMobile zones.", keywords: ["parking", "garage", "parkmobile"] },
  { href: "/transit", title: "Transit & buses", blurb: "County TransIT routes: where the local bus runs and when.", keywords: ["bus", "transit", "marc", "commuter"] },
  { href: "/shipping", title: "Shipping & post", blurb: "Every post office, UPS and FedEx point, and USPS box, by town.", keywords: ["post office", "usps", "ups", "fedex", "mail", "package", "drop box", "shipping"] },
  { href: "/contacts", title: "County & city services", blurb: "Who to call and how: permits, taxes, trash, every office with its number.", keywords: ["contacts", "who do i call", "county services", "city services", "government", "311"] },
  { href: "/amenities", title: "Public amenities", blurb: "Public restrooms, Wi-Fi, EV charging, bike racks, picnic tables, play areas.", keywords: ["restroom", "restrooms", "bathroom", "bathrooms", "toilet", "wifi", "ev charging", "charger", "bike rack", "picnic", "water fountain"] },
  { href: "/check-a-date", title: "Check a date", blurb: "Pick a date and see everything already scheduled before you set yours.", keywords: ["check a date", "date conflict", "schedule conflict"] },
  { href: "/plan", title: "Plan a day", blurb: "Give it time and a vibe, get a stitched itinerary of real stops.", keywords: ["itinerary", "plan my day", "day plan"] },
  { href: "/open-now", title: "Open right now", blurb: "What's open this minute, verified against live hours, ranked from your town.", keywords: ["open now", "open late", "still open", "whats open"] },

  // ── Live county status ──
  { href: "/pulse", title: "County pulse", blurb: "Live traffic, power outages, school status, and 311 on one screen.", keywords: ["traffic", "power outage", "outage", "school closings", "road conditions", "pulse"] },
  { href: "/rivers", title: "River levels", blurb: "Live USGS gauges: Monocacy, Catoctin, Linganore, the Potomac.", keywords: ["river", "rivers", "water level", "gauge", "fishing", "kayak"] },
  { href: "/overhead", title: "Overhead flights", blurb: "Live map of the planes over Frederick right now.", keywords: ["planes", "plane", "flight", "flights", "helicopter"] },
  { href: "/rhythm", title: "The county rhythm", blurb: "Watch 1,200 places wake and sleep; scrub the week hour by hour.", keywords: ["rhythm"] },
  { href: "/numbers", title: "The county, counted", blurb: "Every figure in the guide, computed from the live dataset.", keywords: ["numbers", "stats", "statistics", "how many", "almanac", "counted"] },

  // ── Directories & discovery ──
  { href: "/reserve", title: "Book a table", blurb: "Restaurants with verified reservation links, one tap to book.", keywords: ["reserve", "reservation", "reservations", "book a table", "opentable", "resy"] },
  { href: "/places", title: "Every place, A to Z", blurb: "The full directory, by category, town, or map.", keywords: ["directory", "all places", "a to z", "listings"] },
  { href: "/towns", title: "The twelve towns", blurb: "Pick a town to start: real place counts and what's on this week.", keywords: ["towns", "municipalities", "villages"] },
  { href: "/parks", title: "Parks & open space", blurb: "Every park: type, size, address, who maintains it.", keywords: ["parks", "playground", "playgrounds", "open space", "dog park"] },
  { href: "/trails", title: "Trails", blurb: "Every maintained trail: park, surface, length, what it's for.", keywords: ["trail", "trails", "hike", "hiking", "biking"] },
  { href: "/markers", title: "Historical markers", blurb: "Every roadside marker inscription, NRHP landmark, covered bridge.", keywords: ["historical markers", "covered bridge", "covered bridges", "landmark", "monument"] },
  { href: "/history", title: "County history", blurb: "Frederick County in moments and facts, tied to the places they happened.", keywords: ["history", "historic"] },
  { href: "/nonprofits", title: "Nonprofits", blurb: "Every registered county nonprofit by cause, from the IRS record.", keywords: ["nonprofit", "nonprofits", "charity", "charities", "volunteer"] },
  { href: "/collections", title: "Collections", blurb: "Editorial shortlists: date night, rainy day, kid energy, hidden gems.", keywords: ["collections", "shortlist", "curated", "lists"] },
  { href: "/emergency-vet", title: "Pet emergency care", blurb: "The two 24/7 animal ERs, urgent-care hours, poison hotlines.", keywords: ["emergency vet", "animal hospital", "pet emergency", "pet poison"] },

  // ── Yours ──
  { href: "/my-radius", title: "Saved", blurb: "Your saved places, events, and routes.", keywords: ["saved", "favorites", "bookmarks"] },
];
