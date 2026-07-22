import { PRODUCT_NAMES } from "@/lib/product-names";

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
  { href: "/brunch", title: "Brunch guide", blurb: "Browse weekend brunch listings with posted days and hours.", keywords: ["brunch", "mimosa", "bottomless"] },
  { href: "/happy-hour", title: "Happy hour guide", blurb: "See checked happy-hour schedules, including deal details and fine print.", keywords: ["happy hour", "drink specials", "drink deals"] },
  { href: "/deals", title: "Daily deals", blurb: "Browse checked daily specials by day, including taco and wing nights.", keywords: ["deals", "specials", "taco tuesday", "wing night", "trivia night"] },
  { href: "/beer", title: PRODUCT_NAMES.beer.pageTitle, blurb: PRODUCT_NAMES.beer.description, keywords: ["beer", "brewery", "breweries", "taproom", "pour"] },
  { href: "/food-trucks", title: "Food trucks", blurb: "Find mobile food vendors and open a vendor feed when one is available.", keywords: ["food truck", "food trucks"] },
  { href: "/live-music", title: "Live music", blurb: "See published venue lineups and ticketed shows.", keywords: ["live music", "bands", "who is playing", "lineup"] },

  // ── Practical tools ──
  { href: "/parking", title: "Parking guide", blurb: "Find downtown garages and event parking, including ParkMobile zones.", keywords: ["parking", "garage", "parkmobile"] },
  { href: "/transit", title: "Transit & buses", blurb: "See where county TransIT routes run and when.", keywords: ["bus", "transit", "marc", "commuter"] },
  { href: "/shipping", title: "Shipping & post", blurb: "Find listed postal and shipping locations by town.", keywords: ["post office", "usps", "ups", "fedex", "mail", "package", "drop box", "shipping"] },
  { href: "/contacts", title: "County & city services", blurb: "Find phone numbers for county and city services.", keywords: ["contacts", "who do i call", "county services", "city services", "government", "311"] },
  { href: "/amenities", title: "Public amenities", blurb: "Find mapped restrooms and other public amenities.", keywords: ["restroom", "restrooms", "bathroom", "bathrooms", "toilet", "wifi", "ev charging", "charger", "bike rack", "picnic", "water fountain"] },
  { href: "/check-a-date", title: "Check a date", blurb: "Pick a date and review listed events before scheduling yours.", keywords: ["check a date", "date conflict", "schedule conflict"] },
  { href: "/ask", title: PRODUCT_NAMES.ask.pageTitle, blurb: PRODUCT_NAMES.ask.description, keywords: ["ask radius", "help me decide", "recommendation", "what should i do", "plan something"] },
  { href: "/plan", title: PRODUCT_NAMES.outingPlanner.pageTitle, blurb: PRODUCT_NAMES.outingPlanner.description, keywords: ["itinerary", "plan my day", "day plan", "outing planner"] },
  { href: "/open-now", title: "Open right now", blurb: "Find places whose posted hours indicate they are open, ranked from your selected town.", keywords: ["open now", "open late", "still open", "whats open"] },
  { href: "/nearby", title: "Nearby", blurb: "Rank useful places from a real location or a chosen town.", keywords: ["near me", "closest", "around me", "nearby"] },

  // ── Live county status ──
  { href: "/pulse", title: PRODUCT_NAMES.liveConditions.pageTitle, blurb: PRODUCT_NAMES.liveConditions.description, keywords: ["traffic", "power outage", "outage", "school closings", "road conditions", "live conditions", "pulse"] },
  { href: "/rivers", title: "River levels", blurb: "Read current USGS gauge data for Frederick County waterways.", keywords: ["river", "rivers", "water level", "gauge", "fishing", "kayak"] },
  { href: "/overhead", title: "Overhead flights", blurb: "See aircraft currently transmitting near Frederick on a live map.", keywords: ["planes", "plane", "flight", "flights", "helicopter"] },
  { href: "/rhythm", title: "The county rhythm", blurb: "See how places with posted hours open and close throughout the week.", keywords: ["rhythm"] },
  { href: "/numbers", title: PRODUCT_NAMES.countyNumbers.pageTitle, blurb: PRODUCT_NAMES.countyNumbers.description, keywords: ["numbers", "stats", "statistics", "how many", "almanac", "counted"] },

  // ── Directories & discovery ──
  { href: "/reserve", title: "Book a table", blurb: "Find restaurants with checked reservation links.", keywords: ["reserve", "reservation", "reservations", "book a table", "opentable", "resy"] },
  { href: "/places", title: "Places, A to Z", blurb: "Browse the place index and switch between list and map views.", keywords: ["directory", "all places", "a to z", "listings"] },
  { href: "/towns", title: "Towns and communities", blurb: "Choose an area to see place counts and upcoming events.", keywords: ["towns", "municipalities", "villages"] },
  { href: "/parks", title: "Parks & open space", blurb: "Browse parks returned by Frederick County GIS, with available maintenance details.", keywords: ["parks", "playground", "playgrounds", "open space", "dog park"] },
  { href: "/sports", title: "Sports", blurb: "Follow pro, college, and high-school teams across Frederick County, then find a place to play.", keywords: ["sports", "frederick keys", "keys game", "flying cows", "cows game", "hood blazers", "mount st marys", "mountaineers", "fcc cougars", "high school sports", "fcps athletics", "basketball", "baseball", "golf", "pickleball", "swimming pool"] },
  { href: "/trails", title: "Trails", blurb: "Browse trails returned by Frederick County GIS, with surface and length where available.", keywords: ["trail", "trails", "hike", "hiking", "biking"] },
  { href: "/markers", title: "Historical markers", blurb: "Read state roadside marker text and browse federal register sites.", keywords: ["historical markers", "covered bridge", "covered bridges", "landmark", "monument"] },
  { href: "/history", title: "County history", blurb: "Review Frederick County history through dated moments tied to local places.", keywords: ["history", "historic"] },
  { href: "/nonprofits", title: "Nonprofits", blurb: "Browse county nonprofit records from the IRS dataset.", keywords: ["nonprofit", "nonprofits", "charity", "charities", "volunteer"] },
  { href: "/collections", title: PRODUCT_NAMES.localLists.pageTitle, blurb: PRODUCT_NAMES.localLists.description, keywords: ["collections", "shortlist", "lists", "local lists"] },
  { href: "/archive", title: "Archive Lens", blurb: "Archive Lens shows curated Frederick maps, surveys, newspaper pages, and documentary photographs.", keywords: ["archive", "old maps", "newspapers", "historic photos", "library of congress"] },
  { href: "/dear-frederick", title: "Dear Frederick", blurb: "Read handwritten letters mailed to Frederick and gathered here.", keywords: ["dear frederick", "letters", "community letters"] },
  { href: "/from-above/preview", title: "From Above", blurb: "See Frederick County through Mike's drone archive.", keywords: ["from above", "aerial", "drone", "photography"] },
  { href: "/emergency", title: "Emergency & urgent care", blurb: "Call 911, the county ER, urgent care, and the poison and crisis lines.", keywords: ["emergency", "911", "hospital", "emergency room", "er", "urgent care", "poison control", "frederick health hospital", "ambulance", "crisis line"] },
  { href: "/scanner", title: PRODUCT_NAMES.publicDispatch.pageTitle, blurb: PRODUCT_NAMES.publicDispatch.description, keywords: ["scanner", "police scanner", "fire scanner", "dispatch", "911 calls", "incidents", "crashes", "fires", "wires down", "frederick scanner"] },
  { href: "/emergency-vet", title: "Pet emergency care", blurb: "Find listed emergency animal care and poison-help contacts.", keywords: ["emergency vet", "animal hospital", "pet emergency", "pet poison"] },
  { href: "/submit/event", title: "Add an event", blurb: "Submit a local event for review.", keywords: ["add event", "submit event", "post an event"] },

  // ── Yours ──
  { href: "/my-radius", title: "Saved", blurb: "Review what you saved on this device.", keywords: ["saved", "favorites", "bookmarks"] },
];
