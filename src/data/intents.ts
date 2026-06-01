/**
 * Intent definitions — the entry-point taxonomy for /map.
 *
 * Each intent is a *question* the user actually arrives with, not a
 * category in the data. They map onto places via a `match` function
 * that the discover surface runs against the canonical PlaceCardData
 * list. Bigger than a category (a coffee intent matches both
 * "coffee" and "bakery"; an outdoor intent matches parks + trails),
 * narrower than the full directory.
 *
 * The point is to give people six tiles that read as things to DO
 * instead of 2,400 pins to hunt through.
 */

import type { PlaceCardData } from "@/lib/loaders/places";
import { LIVE_MUSIC_VENUE_SLUGS } from "@/data/live-music-venues";
import { cuisinesOf } from "@/lib/cuisine";

export type IntentKey =
  | "coffee"
  | "eat"
  | "wineries"
  | "breweries"
  | "outdoor"
  | "family"
  | "arts"
  | "wellness"
  | "civic"
  | "shop"
  | "stay"
  | "faith";

export type Intent = {
  key: IntentKey;
  label: string;
  /** One-line editorial — what this intent IS, in resident voice. */
  blurb: string;
  /** Accent color used in the tile + the on-map pin tint. */
  color: string;
  /** Lucide icon name (resolved client-side so we don't bind to a JSX
   *  surface from this server file). */
  icon:
    | "Coffee"
    | "Utensils"
    | "Wine"
    | "Beer"
    | "Trees"
    | "Baby"
    | "Palette"
    | "Landmark"
    | "Heart"
    | "ShoppingBag"
    | "Hotel"
    | "Church";
  /** Match predicate against a place's category slug — kept simple so
   *  the matcher is fast across the full ~2,400 row set. */
  match: (p: PlaceCardData) => boolean;
  /** Whether matches should be filtered to currently-open. The
   *  discover view honors this — "coffee right now" filters open;
   *  "outdoor today" doesn't (parks don't have hours that matter). */
  preferOpen: boolean;
  /** Optional sub-intents — the second-tier chip strip that appears
   *  in /browse when this top intent is active. Each sub narrows the
   *  parent's match further. Parents that don't define subIntents
   *  render no sub-strip; the parent's chip still works as a single-
   *  level filter. */
  subIntents?: SubIntent[];
};

/**
 * SubIntent — a second-tier filter that appears under an active top
 * intent in /browse. Sub-intents narrow the parent's match by category
 * slug ("Eat & drink → Pizza"). Time-of-day sub-intents are planned
 * for a follow-up; the type's `type` discriminator is here so they
 * group cleanly when added.
 */
export type SubIntent = {
  key: string;
  label: string;
  type: "category" | "time";
  /** Match predicate. Always called AFTER the parent intent's match
   *  has passed, so a sub-intent only needs to express the narrower
   *  filter (e.g. "category is pizza", not "is food AND is pizza"). */
  match: (p: PlaceCardData) => boolean;
  /** Lucide icon name (optional). Resolved by the rendering chip
   *  component the same way the top intent's icon is. */
  icon?:
    | "Coffee"
    | "Utensils"
    | "Wine"
    | "Beer"
    | "Trees"
    | "Baby"
    | "Palette"
    | "Landmark"
    | "Pizza"
    | "Cookie"
    | "Truck"
    | "Mountain"
    | "Music"
    | "Library"
    | "Building"
    | "ShieldCheck"
    | "Vote"
    | "Church"
    | "Theater"
    | "ImageIcon"
    | "ToyBrick"
    | "Heart"
    | "Activity"
    | "Dumbbell"
    | "Sparkles"
    | "ShoppingBag"
    | "Hotel"
    | "Church"
    | "Pill";
};

const COFFEE = new Set(["coffee", "bakery"]);
// Wineries vs Breweries — these are two of Frederick County's most
// recognizable identity beats (the Maryland Wine Trail runs through
// the county; the Frederick Beer Trail covers the city). Historically
// both lived under "brewery" in the curated set because Google's
// primary_type pipeline collapses winery/meadery/cidery/distillery
// into one bucket. The MATCHERS below split them back out for the UI
// without touching the underlying category — by name regex and
// subcategory tags.
const WINERY_SUBS = new Set(["winery", "meadery", "cidery"]);
const WINERY_NAME_RE = /winer|vineyard|cellar|meader|ciderworks?/i;
const isWinery = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).some((s) => WINERY_SUBS.has(s)) ||
  WINERY_NAME_RE.test(p.name);
// Distilleries are spirit-forward — closer to a brewery experience
// than a winery one, so they ride the breweries chip.
const BREWERY_CATS = new Set(["brewery"]);
const BREWERY_SUBS = new Set(["distillery"]);
const FOOD = new Set([
  "restaurant",
  "food",
  "pizza",
  "bar",
  "brewery",
  "food-truck",
]);
const OUTDOOR = new Set(["park", "trail", "outdoors", "playground"]);
const FAMILY_CATS = new Set([
  "playground",
  "family",
  "library",
  "museum",
  "park",
]);
const ARTS = new Set([
  "arts",
  "gallery",
  "museum",
  "theater",
  "music",
  "public-art",
]);
const CIVIC = new Set([
  "library",
  "government",
  "public-safety",
  "post-office",
  "voting",
  "transit",
  "civic",
  "pharmacy",
]);

// Wellness — Frederick has a real yoga + boutique-fitness scene that
// the directory categorizes as "wellness" (the noisy 270-row bucket
// that also includes lash extensions, nail salons, barbershops, and
// other appearance services). The directory category is honest but
// not directly useful as a "where can I do yoga right now" chip, so
// the intent narrows it via name regex to the three actual move-the-
// body sub-experiences: yoga, gyms/fitness, and spas. Every matcher
// is gated on WELLNESS_CATS so a restaurant called "Yoga Cafe" or
// a hardware store called "Spa Hardware" can't sneak in via the
// name regex alone. The parent intent's match is the UNION of the
// sub matchers so the parent count and the chip behavior stay
// consistent (parent never matches more than its subs combined).
const WELLNESS_CATS = new Set(["yoga", "wellness"]);
// Leading word boundary only — "Yogamour" / "Yogashala" are real
// Frederick studios whose name starts with "Yoga"; a trailing \b
// would miss them. The leading \b still keeps "Bayoga" / "Frogayoga"
// out (no word boundary before "yoga" when it's mid-word).
const YOGA_NAME_RE = /\byoga/i;
// Fitness-only regex — excludes "yoga" so the same studio doesn't
// double-count in both Yoga and Gyms sub-chips. A studio that runs
// yoga + pilates lands in Yoga (the stronger signal) by category;
// pure-fitness places land in Gyms.
const GYM_NAME_RE = /\b(gym|fitness|crossfit|pilates|barre|spin|cycle|cardio)\b/i;
const SPA_NAME_RE = /\b(spa|massage|sauna|salt(?:\s*cave|\s*room)?|bath\s*house)\b/i;
const isYoga = (p: PlaceCardData): boolean =>
  WELLNESS_CATS.has(p.category) &&
  (p.category === "yoga" || YOGA_NAME_RE.test(p.name));
const isGymFitness = (p: PlaceCardData): boolean =>
  WELLNESS_CATS.has(p.category) &&
  GYM_NAME_RE.test(p.name) &&
  !YOGA_NAME_RE.test(p.name);
const isSpa = (p: PlaceCardData): boolean =>
  WELLNESS_CATS.has(p.category) && SPA_NAME_RE.test(p.name);

// Shop — Market Street retail, antiques, books, makers, and markets.
const SHOP = new Set(["shopping", "antiques", "book-store", "market"]);

// Stay — the visitor lodging set (hotels, inns, B&Bs, farm stays). 42
// rows that had no find path until now.
const LODGING = new Set(["lodging"]);
const BNB_NAME_RE = /\b(bed\s?(?:and|&|'n')?\s?breakfast|b&b|b\s?and\s?b|inn|guest\s?house|farm\s?stay|cottage)\b/i;

// Faith — 167 houses of worship that were orphaned (the civic intent's
// matcher never included them). Their own intent so "find a church near
// me" / a new mover finding a congregation actually works.
const WORSHIP = new Set(["worship"]);

// Wellness & beauty — the whole everyday self-care map. Previously the
// intent name-filtered the 273-row wellness bucket down to yoga/gym/spa,
// orphaning ~190 hair/nail/beauty rows. Now the parent serves the FULL
// category and the sub-intents below split it honestly by name signal.
const SELFCARE_CATS = new Set(["yoga", "wellness"]);
const HAIR_NAME_RE = /\b(salon|hair|barber|braid|blow.?dry|beauty|lash|brow|wax|aesthetic|skin\s?care|med\s?spa)\b/i;
const NAIL_NAME_RE = /\b(nail|mani|pedi|polish)\b/i;
const isHairBeauty = (p: PlaceCardData): boolean =>
  SELFCARE_CATS.has(p.category) && HAIR_NAME_RE.test(p.name) && !NAIL_NAME_RE.test(p.name);
const isNails = (p: PlaceCardData): boolean =>
  SELFCARE_CATS.has(p.category) && NAIL_NAME_RE.test(p.name);

// Cuisine sub-intent helper — the cuisine classifier reads name + blurb
// (there is no structured cuisine field), so "Italian / Mexican / Sushi"
// work across the whole food set. A place can match more than one.
const hasCuisine = (p: PlaceCardData, slug: string): boolean => cuisinesOf(p).includes(slug);

export const INTENTS: Intent[] = [
  {
    key: "coffee",
    label: "Coffee right now",
    blurb: "Cafes and bakeries open at this hour, near you.",
    color: "#8B5A2B",
    icon: "Coffee",
    match: (p) => COFFEE.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "cafes",    type: "category", label: "Cafes",    icon: "Coffee",  match: (p) => p.category === "coffee" },
      { key: "bakeries", type: "category", label: "Bakeries", icon: "Cookie",  match: (p) => p.category === "bakery" },
    ],
  },
  {
    key: "eat",
    label: "Eat & drink",
    blurb: "Where to sit down, where to grab something, where to drink.",
    color: "#A8462C",
    icon: "Utensils",
    match: (p) => FOOD.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "restaurants", type: "category", label: "Restaurants", icon: "Utensils", match: (p) => p.category === "restaurant" },
      // Pizza: match places categorized as pizza OR places with
      // "pizza" / "pizzeria" / "pie" in the name (Pretzel & Pizza
      // Creations, Wine Kitchen's pizza menu, etc.). Strict category
      // matching alone was hiding ~half the actual pizza places
      // because Google's primary_type lands most of them in
      // "restaurant" and only a few in "pizza_restaurant".
      {
        key: "pizza",
        type: "category",
        label: "Pizza",
        icon: "Pizza",
        match: (p) =>
          p.category === "pizza" ||
          (p.subcategories ?? []).includes("pizza") ||
          /\b(pizza|pizzeria)\b/i.test(p.name),
      },
      { key: "bars",        type: "category", label: "Bars",        icon: "Wine",     match: (p) => p.category === "bar" },
      { key: "breweries",   type: "category", label: "Breweries",   icon: "Beer",     match: (p) => p.category === "brewery" && !isWinery(p) },
      { key: "wineries",    type: "category", label: "Wineries",    icon: "Wine",     match: (p) => isWinery(p) },
      { key: "bakeries",    type: "category", label: "Bakeries",    icon: "Cookie",   match: (p) => p.category === "bakery" },
      { key: "trucks",      type: "category", label: "Food trucks", icon: "Truck",    match: (p) => p.category === "food-truck" },
      // Cuisine subs — the depth that turns "Eat" from a category into a
      // real craving. Derived from name + blurb by the cuisine classifier
      // (there is no structured cuisine field), so they reach DFP rows too.
      { key: "italian",   type: "category", label: "Italian",            match: (p) => hasCuisine(p, "italian") },
      { key: "mexican",   type: "category", label: "Mexican",            match: (p) => hasCuisine(p, "mexican") },
      { key: "asian",     type: "category", label: "Asian & sushi",      match: (p) => ["thai", "chinese", "japanese", "korean", "vietnamese", "indian"].some((c) => hasCuisine(p, c)) },
      { key: "american",  type: "category", label: "American",           match: (p) => hasCuisine(p, "american") },
      { key: "bbq",       type: "category", label: "BBQ & smokehouse",   match: (p) => hasCuisine(p, "bbq") },
      { key: "seafood",   type: "category", label: "Seafood",            match: (p) => hasCuisine(p, "seafood") },
      { key: "breakfast", type: "category", label: "Breakfast & brunch", match: (p) => hasCuisine(p, "breakfast") },
    ],
  },
  {
    key: "wineries",
    label: "Wineries",
    blurb:
      "The 16 wineries, vineyards, meaderies, and ciderworks across the Maryland Wine Trail.",
    color: "#7E1F1F",
    icon: "Wine",
    match: (p) => isWinery(p),
    preferOpen: false,
    // No subIntents — wineries are already a narrow set (16 places).
    // Slicing them further would produce 1-2 results per sub-chip.
  },
  {
    key: "breweries",
    label: "Breweries",
    blurb:
      "Frederick's craft beer scene — brewpubs, taprooms, and distilleries.",
    color: "#C99632",
    icon: "Beer",
    match: (p) =>
      // A brewery is anything in the brewery category that ISN'T a
      // winery (those have their own chip above), plus distilleries.
      (BREWERY_CATS.has(p.category) && !isWinery(p)) ||
      (p.subcategories ?? []).some((s) => BREWERY_SUBS.has(s)),
    preferOpen: false,
    subIntents: [
      { key: "brewpubs",     type: "category", label: "Brewpubs",     icon: "Beer", match: (p) => BREWERY_CATS.has(p.category) && !isWinery(p) },
      { key: "distilleries", type: "category", label: "Distilleries", icon: "Wine", match: (p) => (p.subcategories ?? []).some((s) => BREWERY_SUBS.has(s)) },
    ],
  },
  {
    key: "outdoor",
    label: "Get outside",
    blurb: "Parks, trails, and playgrounds for an hour or an afternoon.",
    color: "#1E6B3A",
    icon: "Trees",
    match: (p) => OUTDOOR.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "parks",       type: "category", label: "Parks",       icon: "Trees",    match: (p) => p.category === "park" },
      { key: "trails",      type: "category", label: "Trails",      icon: "Mountain", match: (p) => p.category === "trail" },
      { key: "playgrounds", type: "category", label: "Playgrounds", icon: "ToyBrick", match: (p) => p.category === "playground" },
    ],
  },
  {
    key: "family",
    label: "Take the kids",
    blurb: "Family-friendly spots — playgrounds, libraries, museums.",
    color: "#C99632",
    icon: "Baby",
    match: (p) => FAMILY_CATS.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "playgrounds", type: "category", label: "Playgrounds", icon: "ToyBrick", match: (p) => p.category === "playground" },
      { key: "libraries",   type: "category", label: "Libraries",   icon: "Library",  match: (p) => p.category === "library" },
      { key: "museums",     type: "category", label: "Museums",     icon: "Palette",  match: (p) => p.category === "museum" },
      { key: "parks",       type: "category", label: "Parks",       icon: "Trees",    match: (p) => p.category === "park" },
    ],
  },
  {
    key: "arts",
    label: "Arts & culture",
    blurb: "Galleries, theaters, museums, live music.",
    color: "#7E2C6F",
    icon: "Palette",
    match: (p) => ARTS.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "museums",    type: "category", label: "Museums",    icon: "Palette",   match: (p) => p.category === "museum" },
      { key: "galleries",  type: "category", label: "Galleries",  icon: "ImageIcon", match: (p) => p.category === "gallery" },
      { key: "theaters",   type: "category", label: "Theaters",   icon: "Theater",   match: (p) => p.category === "theater" },
      // Live music isn't a place category — it's a thing venues HOST.
      // The `music` category catches only formal halls (~5 rows); the
      // curated venue set adds the breweries, wineries, distilleries &
      // bars that stage most of Frederick's live music. See
      // src/data/live-music-venues.ts (every slug verified in dataset).
      { key: "live-music", type: "category", label: "Live music", icon: "Music",     match: (p) => p.category === "music" || LIVE_MUSIC_VENUE_SLUGS.has(p.slug) },
      { key: "public-art", type: "category", label: "Public art", icon: "Palette",   match: (p) => p.category === "public-art" },
    ],
  },
  {
    key: "wellness",
    label: "Wellness & beauty",
    blurb: "Yoga, gyms, spas, hair & nails — the everyday self-care map.",
    color: "#A02929",
    icon: "Heart",
    // Serve the WHOLE self-care category. The old matcher name-filtered
    // to yoga/gym/spa and orphaned ~190 hair/nail/beauty rows; now the
    // parent shows all and the sub-intents split it honestly by name.
    match: (p) => SELFCARE_CATS.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "yoga",  type: "category", label: "Yoga",           icon: "Activity", match: isYoga },
      { key: "gyms",  type: "category", label: "Gyms & fitness",  icon: "Dumbbell", match: isGymFitness },
      { key: "spas",  type: "category", label: "Spas & massage",  icon: "Sparkles", match: isSpa },
      { key: "hair",  type: "category", label: "Hair & beauty",                     match: isHairBeauty },
      { key: "nails", type: "category", label: "Nails",                             match: isNails },
    ],
  },
  {
    key: "civic",
    label: "Civic & essentials",
    blurb: "Libraries, government, voting, pharmacies, public services.",
    color: "#2F5470",
    icon: "Landmark",
    match: (p) => CIVIC.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "libraries",     type: "category", label: "Libraries",     icon: "Library",     match: (p) => p.category === "library" },
      { key: "government",    type: "category", label: "Government",    icon: "Building",    match: (p) => p.category === "government" },
      { key: "public-safety", type: "category", label: "Public safety", icon: "ShieldCheck", match: (p) => p.category === "public-safety" },
      { key: "voting",        type: "category", label: "Voting",        icon: "Vote",        match: (p) => p.category === "voting" },
      { key: "pharmacies",    type: "category", label: "Pharmacies",    icon: "Pill",        match: (p) => p.category === "pharmacy" },
    ],
  },
  {
    key: "shop",
    label: "Shop",
    blurb: "Market Street shops, antiques, books, and makers.",
    color: "#2E7D74",
    icon: "ShoppingBag",
    match: (p) => SHOP.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "antiques",  type: "category", label: "Antiques",          match: (p) => p.category === "antiques" },
      { key: "boutiques", type: "category", label: "Boutiques & shops", match: (p) => p.category === "shopping" },
      { key: "books",     type: "category", label: "Bookstores",        match: (p) => p.category === "book-store" },
      { key: "markets",   type: "category", label: "Markets",           match: (p) => p.category === "market" },
    ],
  },
  {
    key: "stay",
    label: "Stay the night",
    blurb: "Hotels, inns, and bed & breakfasts across the county.",
    color: "#5B1E55",
    icon: "Hotel",
    match: (p) => LODGING.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "hotels", type: "category", label: "Hotels",      match: (p) => LODGING.has(p.category) && !BNB_NAME_RE.test(p.name) },
      { key: "bnbs",   type: "category", label: "B&Bs & inns", match: (p) => LODGING.has(p.category) && BNB_NAME_RE.test(p.name) },
    ],
  },
  {
    key: "faith",
    label: "Faith & worship",
    blurb: "Churches, temples, and houses of worship countywide.",
    color: "#5B3A8F",
    icon: "Church",
    match: (p) => WORSHIP.has(p.category),
    preferOpen: false,
    // No sub-intents — denomination isn't a reliable structured signal,
    // and slicing 167 rows by a name guess would be dishonest. Browsable
    // as one list, nearest-first when the user shares location.
  },
];

export const INTENT_BY_KEY: Record<IntentKey, Intent> = Object.fromEntries(
  INTENTS.map((i) => [i.key, i]),
) as Record<IntentKey, Intent>;
