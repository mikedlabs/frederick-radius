import type { QuickIntent } from "./types";
import { primaryAnswerFor } from "@/lib/search/answer";

/**
 * Quick-answer intents — recognized needs that resolve in ONE tap to
 * the right pre-filtered view, instead of making the user browse.
 * Phrased as the answer, not a search ("What's open right now"). North
 * Star: answer the question, ≤2 taps. Each entry's href IS the answer.
 *
 * Extracted from SearchOverlay so the overlay AND the /today AnswerCards
 * read from one source (UX_REDO Build 1). Icons are string names so this
 * stays server-safe; client renderers map them to glyphs.
 */
export const QUICK_INTENTS: QuickIntent[] = [
  {
    key: "open-now",
    terms: ["open now", "whats open", "what's open", "open right now", "open late", "anything open"],
    title: "What's open right now",
    sub: "Places with recently confirmed open hours",
    chip: "Open now",
    href: "/map?mode=browse&open=now",
    icon: "clock",
    status: "open-now",
  },
  {
    key: "tonight",
    terms: ["tonight", "this evening", "live music", "music tonight", "show tonight", "concert", "concerts"],
    title: "Happening tonight",
    sub: "Events & music starting soon",
    chip: "Tonight",
    href: "/today?t=tonight",
    icon: "calendar",
    status: "tonight",
  },
  {
    key: "weekend",
    terms: ["weekend", "weekends", "this weekend", "saturday", "saturdays", "sunday", "sundays", "things to do"],
    title: "This weekend",
    sub: "Events across the county",
    chip: "This weekend",
    href: "/today?t=weekend",
    icon: "calendar",
    status: "weekend",
  },
  {
    key: "transit",
    terms: ["train", "trains", "marc", "transit", "commute", "commutes", "bus", "buses", "next train"],
    title: "MARC & transit times",
    sub: "Next departures and routes",
    chip: "Transit",
    href: "/transit",
    icon: "train",
    status: "transit",
  },
  {
    key: "parking",
    terms: ["parking", "park the car", "garage", "garages", "where to park", "meter", "meters"],
    title: "Parking",
    sub: "Garages, lots & street parking",
    chip: "Parking",
    href: "/map?mode=browse&intent=parking",
    icon: "pin",
    status: "parking",
  },
  {
    key: "restrooms",
    terms: ["restroom", "restrooms", "bathroom", "bathrooms", "public toilet", "public toilets"],
    title: "Closest mapped restroom",
    sub: "Use your location, then get walking directions",
    chip: "Restrooms",
    href: "/amenities?need=restroom",
    icon: "pin",
    status: "civic",
  },
  {
    key: "drinking-water",
    terms: ["drinking water", "water fountain", "water fountains", "bottle fill", "bottle fills", "bottle filling", "bottle refill", "bottle refills", "bottle refilling"],
    title: "Closest mapped water point",
    sub: "Use your location, then get walking directions",
    chip: "Drinking water",
    href: "/amenities?need=water",
    icon: "pin",
    status: "civic",
  },
  {
    key: "trash",
    terms: ["trash can", "trash cans", "waste basket", "waste baskets", "public trash", "garbage can", "garbage cans"],
    title: "Closest mapped trash can",
    sub: "Use your location, then get walking directions",
    chip: "Trash",
    href: "/amenities?need=trash",
    icon: "pin",
    status: "civic",
  },
  {
    key: "dog-bags",
    terms: ["dog bag", "dog bags", "dog waste", "poop bag", "poop bags"],
    title: "Closest mapped dog-bag station",
    sub: "Use your location, then get walking directions",
    chip: "Dog bags",
    href: "/amenities?need=dog-bags",
    icon: "pin",
    status: "civic",
  },
  {
    key: "seating",
    terms: ["public bench", "public benches", "place to sit", "public seating", "nearest bench", "nearest benches"],
    title: "Closest mapped public seat",
    sub: "Use your location, then get walking directions",
    chip: "Seating",
    href: "/amenities?need=seating",
    icon: "pin",
    status: "civic",
  },
  {
    key: "power",
    terms: ["power outlet", "power outlets", "charge my phone", "charge a phone", "phone charger", "phone chargers", "laptop charger", "laptop chargers"],
    title: "Closest mapped public outlet",
    sub: "Use your location, then get walking directions",
    chip: "Power",
    href: "/amenities?need=power",
    icon: "pin",
    status: "civic",
  },
  {
    key: "shipping",
    terms: ["post office", "post offices", "blue mailbox", "blue mailboxes", "collection box", "collection boxes", "ups store", "ups stores", "fedex", "ship a package"],
    title: "Post & shipping",
    sub: "Post offices, counters, and blue mailboxes",
    chip: "Shipping",
    href: "/shipping",
    icon: "pin",
    status: "civic",
  },
  {
    key: "brunch",
    terms: ["brunch", "brunches"],
    title: "Verified brunch",
    sub: "Venue-confirmed days and service windows",
    chip: "Brunch",
    href: "/brunch",
    icon: "pin",
    status: "open-now",
  },
  {
    key: "food-trucks",
    terms: ["food truck", "food trucks"],
    title: "Food trucks & carts",
    sub: "Local roster, home bases, and current feeds",
    chip: "Food trucks",
    href: "/food-trucks",
    icon: "pin",
    status: "open-now",
  },
  {
    key: "events",
    terms: ["event", "events", "happening", "happenings", "calendar", "calendars"],
    title: "Events",
    sub: "What's on across Frederick",
    chip: "Events",
    href: "/events",
    icon: "calendar",
    status: "events",
  },
];

/** Match complete words or phrases, never "bus" in a business name or
 * "meter" inside "cemetery". Plurals are explicit in the intent terms. */
function matchesIntentTerm(query: string, term: string): boolean {
  const phrase = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${phrase}(?=$|[^\\p{L}\\p{N}])`, "u").test(query);
}

/**
 * Match a free-text query to quick intents with complete word or phrase
 * boundaries. Cheap, synchronous, no fetch.
 */
export function findQuickAnswers(query: string, limit = 2): QuickIntent[] {
  const lq = query.toLowerCase().replace(/[’]/g, "'").trim();
  if (lq.length < 3) return [];
  const out: QuickIntent[] = [];
  const seen = new Set<string>();

  // A craving query ("coffee open now near me", "where's a good beer") leads
  // with the nearest-open craving surface, the same answer /search shows. It's
  // synthesized from the ONE query->answer mapping (primaryAnswerFor) so search
  // and the overlay never drift. Bare "open now" stays owned by the intent
  // below, which routes to its established map-open view.
  // Specialty guides carry verified schedules or honest live-location
  // limitations that the broad food craving route cannot express. Let those
  // purpose-built answers lead instead of prepending generic /nearby food.
  const specialty = /\bbrunch\b|\bfood trucks?\b/i.test(query);
  const answer = specialty ? null : primaryAnswerFor(query);
  if (answer && answer.key !== "open-now") {
    seen.add(answer.href);
    out.push({
      key: `craving:${answer.key}`,
      terms: [],
      title: answer.label,
      sub: answer.kicker,
      chip: answer.label,
      href: answer.href,
      icon: "pin",
      status: "open-now",
    });
  }

  if (specialty) {
    const direct = QUICK_INTENTS.find((intent) =>
      (intent.key === "brunch" || intent.key === "food-trucks") &&
      intent.terms.some((term) => matchesIntentTerm(lq, term)),
    );
    if (direct) {
      seen.add(direct.href);
      out.push(direct);
    }
  }

  for (const intent of QUICK_INTENTS) {
    if (intent.terms.some((term) => matchesIntentTerm(lq, term)) && !seen.has(intent.href)) {
      seen.add(intent.href);
      out.push(intent);
    }
  }
  return out.slice(0, limit);
}
