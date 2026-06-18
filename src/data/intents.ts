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
    | "Pill"
    | "Flower2"
    | "Waves"
    | "Shirt"
    | "Recycle"
    | "Home"
    | "Gift"
    | "Gem"
    | "ShoppingCart"
    | "Store"
    | "BookOpen"
    | "FerrisWheel"
    | "Users";
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

// Cinemas sit in the `theater` category alongside live-stage venues. Split
// them by name so "Movies" answers "where can I see a film" (Warehouse
// Cinemas ×2, Regal Westview) while "Theaters" stays live-performance.
const CINEMA_NAME_RE = /cinema|movie|regal|\bamc\b|marcus|megaplex|multiplex/i;
const isCinema = (p: PlaceCardData): boolean =>
  p.category === "theater" && CINEMA_NAME_RE.test(p.name);
// Coffee sub-types — there's no structured "coffee kind" field, so read
// the name. Roasters (the local-roastery distinction coffee people seek)
// and tea / boba houses get pulled out of the general coffee set so the
// Coffee intent can answer the real question: what KIND of coffee.
const isRoaster = (p: PlaceCardData): boolean =>
  p.category === "coffee" && /\broast(er|ery|ing|ers)?\b/i.test(p.name);
const isTeaHouse = (p: PlaceCardData): boolean =>
  p.category === "coffee" &&
  (/\b(tea|boba|matcha)\b/i.test(p.name) || /bubble tea/i.test(p.name));
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
// Outdoor sub signals. The directory only structures park/trail/playground
// as categories, so gardens and water-features are surfaced by NAME (verified
// against the dataset). These chips only ever narrow WITHIN the outdoor set,
// so a name match can't pull in a non-outdoor place.
const TRAIL_NAME_RE = /\b(trail|towpath|greenway|canal|path)\b/i;
const GARDEN_NAME_RE = /\b(garden|arboretum|botanic)\b/i;
const WATER_NAME_RE =
  /\b(creek|lake|river|pond|falls?|reservoir|stream|run|branch|water)\b/i;
const PLAYGROUND_NAME_RE = /\bplayground|tot.?lot\b/i;
const FAMILY_CATS = new Set([
  "playground",
  "family",
  "library",
  "museum",
  "park",
]);
// Family "Things to do" — the active kid attractions that live in the noisy
// `family` category (arcades, escape rooms, bowling, adventure parks, wildlife
// preserves, clay studios). Name-gated AND category-gated so the parent's
// K-12 schools and admin offices don't sneak into the chip.
const FAMILY_ATTRACTION_RE =
  /\b(arcade|escape room|escape this|bowling|adventure|wildlife|preserve|skate|laser|trampoline|mini.?golf|pinball|clay studio|gymnastics|climbing|aquarium|zoo|farm)\b/i;
const isFamilyAttraction = (p: PlaceCardData): boolean =>
  p.category === "family" && FAMILY_ATTRACTION_RE.test(p.name);
const isPlaygroundLike = (p: PlaceCardData): boolean =>
  p.category === "playground" ||
  (p.subcategories ?? []).includes("playground") ||
  PLAYGROUND_NAME_RE.test(p.name);
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
// Civic sub signals. The `civic` catch-all category (80 rows) is mostly
// community orgs, nonprofits, and historic sites — a big bucket that had no
// chip. The `community` / `non_profit` subcategory tags are well-populated
// here; the name regex catches the rest. Historic sites get their own chip.
const CIVIC_COMMUNITY_RE =
  /\b(community center|nonprofit|non-profit|society|council|club|coalition|united way|ymca|rotary|chamber|legion|grange|ruritan|guild|mission|salvation army|boys.*girls)\b/i;
const CIVIC_HISTORIC_RE =
  /\b(historic|historical|heritage|landmark|monument|battlefield|barracks|furnace)\b/i;
const isCivicCommunity = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("community") ||
  (p.subcategories ?? []).includes("non_profit") ||
  (p.subcategories ?? []).includes("community_center") ||
  CIVIC_COMMUNITY_RE.test(p.name);
const isCivicHistoric = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("landmark") || CIVIC_HISTORIC_RE.test(p.name);

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
// Shop sub signals. The `subcategories` field is only ~13% populated, so each
// sub combines the few structured tags (`clothes`, `boutique`, `thrift_store`,
// `gift`, `jewelry`, `food`) with a name regex to surface the real downtown
// scene. Some overlap is intentional and honest (a "Vintage Boutique" shows in
// both Fashion and Vintage) — same as Bakeries living under Coffee and Eat.
const SHOP_FASHION_RE =
  /\b(boutique|clothing|apparel|fashion|outfitter|dress|denim|shoe|footwear|menswear|womenswear|bridal)\b/i;
const SHOP_VINTAGE_RE =
  /\b(vintage|thrift|antique|consign|resale|second.?hand|retro|salvage|curiosit)\b/i;
const SHOP_HOME_RE =
  /\b(home|furniture|furnishing|decor|interior|garden|nursery|plant|florist|flower|hardware|mercantile|hearth)\b/i;
const SHOP_GIFT_RE = /\b(gift|souvenir|candle|stationery)\b/i;
const SHOP_JEWELRY_RE = /\b(jewel|jeweler|goldsmith|diamond|gem)\b/i;
const SHOP_GROCERY_RE =
  /\b(grocery|grocer|supermarket|deli|butcher|cheese|spice|chocolate|candy|seafood|vinegar|oil|popcorn|provisions|emporium|creamery|weis|safeway|giant|wegmans|aldi|lidl|costco|mega ?mart|jubilee|organic market|co-?op|h mart|foods?)\b/i;
const isShopFashion = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("clothes") ||
  (p.subcategories ?? []).includes("boutique") ||
  SHOP_FASHION_RE.test(p.name);
const isShopVintage = (p: PlaceCardData): boolean =>
  p.category === "antiques" ||
  (p.subcategories ?? []).includes("thrift_store") ||
  SHOP_VINTAGE_RE.test(p.name);
const isShopGifts = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("gift") || SHOP_GIFT_RE.test(p.name);
const isShopJewelry = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("jewelry") || SHOP_JEWELRY_RE.test(p.name);
const isShopGrocery = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).includes("food") ||
  (p.subcategories ?? []).includes("convenience_store") ||
  SHOP_GROCERY_RE.test(p.name);

// Stay — the visitor lodging set (hotels, inns, B&Bs, farm stays). 42
// rows that had no find path until now. The B&B test must be honest: a bare
// "Inn" appears in chain hotel names ("Hampton Inn", "Comfort Inn", "Inn &
// Suites"), so matching "inn" alone mislabels ~half the hotels as B&Bs. We
// classify as a B&B/independent inn only on an explicit B&B phrase, OR on an
// "Inn" that is NOT a recognizable chain-suites property.
const LODGING = new Set(["lodging"]);
const BNB_NAME_RE =
  /\b(bed\s?(?:and|&|'n')?\s?breakfast|b\s?&\s?b|guest\s?house|farm\s?stay|cottage)\b/i;
const CHAIN_HOTEL_RE =
  /&\s?suites|garden inn|comfort inn|days inn|holiday inn|budget inn|sleep inn|hampton inn/i;
const isBnB = (p: PlaceCardData): boolean =>
  LODGING.has(p.category) &&
  (BNB_NAME_RE.test(p.name) ||
    (/\binn\b/i.test(p.name) && !CHAIN_HOTEL_RE.test(p.name)));

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
    label: "Coffee",
    blurb: "Roasters, cafes, and the bakeries worth the early line.",
    color: "#8B5A2B",
    icon: "Coffee",
    match: (p) => COFFEE.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "coffee-shops", type: "category", label: "Coffee shops", icon: "Coffee", match: (p) => p.category === "coffee" && !isRoaster(p) && !isTeaHouse(p) },
      { key: "roasters",     type: "category", label: "Roasters",     icon: "Coffee", match: (p) => isRoaster(p) },
      { key: "tea-boba",     type: "category", label: "Tea & boba",   icon: "Coffee", match: (p) => isTeaHouse(p) },
      { key: "bakeries",     type: "category", label: "Bakeries",     icon: "Cookie",  match: (p) => p.category === "bakery" },
    ],
  },
  {
    key: "eat",
    label: "Eat & drink",
    blurb: "Where to sit down, where to grab something, where to drink.",
    color: "#A03A22",
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
      { key: "parks",       type: "category", label: "Parks",         icon: "Trees",    match: (p) => p.category === "park" },
      { key: "trails",      type: "category", label: "Trails",        icon: "Mountain", match: (p) => p.category === "trail" || TRAIL_NAME_RE.test(p.name) },
      { key: "playgrounds", type: "category", label: "Playgrounds",   icon: "ToyBrick", match: isPlaygroundLike },
      { key: "gardens",     type: "category", label: "Gardens",       icon: "Flower2",  match: (p) => GARDEN_NAME_RE.test(p.name) },
      { key: "water",       type: "category", label: "Water & creek", icon: "Waves",    match: (p) => WATER_NAME_RE.test(p.name) },
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
      { key: "things",      type: "category", label: "Things to do", icon: "FerrisWheel", match: isFamilyAttraction },
      { key: "playgrounds", type: "category", label: "Playgrounds",  icon: "ToyBrick",    match: isPlaygroundLike },
      { key: "libraries",   type: "category", label: "Libraries",    icon: "Library",     match: (p) => p.category === "library" },
      { key: "museums",     type: "category", label: "Museums",      icon: "Palette",     match: (p) => p.category === "museum" },
      { key: "parks",       type: "category", label: "Parks",        icon: "Trees",       match: (p) => p.category === "park" },
    ],
  },
  {
    key: "arts",
    label: "Arts & culture",
    blurb: "Galleries, stages, museums, and where the live music plays.",
    color: "#7E2C6F",
    icon: "Palette",
    match: (p) => ARTS.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "museums",    type: "category", label: "Museums",    icon: "Palette",   match: (p) => p.category === "museum" },
      { key: "galleries",  type: "category", label: "Galleries",  icon: "ImageIcon", match: (p) => p.category === "gallery" },
      { key: "movies",     type: "category", label: "Movies",     match: (p) => isCinema(p) },
      { key: "theaters",   type: "category", label: "Theaters",   icon: "Theater",   match: (p) => p.category === "theater" && !isCinema(p) },
      // Live music isn't a place category — it's a thing venues HOST.
      // The `music` category catches only formal halls (~5 rows); the
      // curated venue set adds the breweries, wineries, distilleries &
      // bars that stage most of Frederick's live music. See
      // src/data/live-music-venues.ts (every slug verified in dataset).
      { key: "live-music", type: "category", label: "Live music", icon: "Music",     match: (p) => p.category === "music" || LIVE_MUSIC_VENUE_SLUGS.has(p.slug) },
      // "Public art" dropped: the `public-art` category is empty in the dataset
      // and the few real installations (e.g. Trompe Loeil Bridge Mural) live
      // under `civic`, outside the arts parent — so the chip would match 0.
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
    label: "Civic & services",
    blurb: "Libraries, government, voting, pharmacies — the practical stuff.",
    color: "#2F5470",
    icon: "Landmark",
    match: (p) => CIVIC.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "libraries",     type: "category", label: "Libraries",     icon: "Library",     match: (p) => p.category === "library" },
      { key: "government",    type: "category", label: "Government",    icon: "Building",    match: (p) => p.category === "government" },
      { key: "public-safety", type: "category", label: "Public safety", icon: "ShieldCheck", match: (p) => p.category === "public-safety" },
      { key: "pharmacies",    type: "category", label: "Pharmacies",    icon: "Pill",        match: (p) => p.category === "pharmacy" },
      { key: "community",     type: "category", label: "Community",     icon: "Users",       match: isCivicCommunity },
      { key: "historic",      type: "category", label: "Historic sites", icon: "Landmark",   match: isCivicHistoric },
      // "Voting" and "Post & shipping" dropped: both categories are empty in
      // the dataset (0 polling places, 0 post offices), so the chips would
      // match nothing. Pharmacies remain (4) — the TAXONOMY's civic exception.
    ],
  },
  {
    key: "shop",
    label: "Shops & makers",
    blurb: "Market Street boutiques, antiques, bookshops, and local makers.",
    color: "#2E7D74",
    icon: "ShoppingBag",
    match: (p) => SHOP.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "fashion",   type: "category", label: "Fashion",            icon: "Shirt",        match: isShopFashion },
      { key: "vintage",   type: "category", label: "Vintage & thrift",   icon: "Recycle",      match: isShopVintage },
      { key: "home",      type: "category", label: "Home & garden",      icon: "Home",         match: (p) => SHOP_HOME_RE.test(p.name) },
      { key: "gifts",     type: "category", label: "Gifts",              icon: "Gift",         match: isShopGifts },
      { key: "books",     type: "category", label: "Books",              icon: "BookOpen",     match: (p) => p.category === "book-store" },
      { key: "jewelry",   type: "category", label: "Jewelry",            icon: "Gem",          match: isShopJewelry },
      { key: "grocery",   type: "category", label: "Grocery & specialty", icon: "ShoppingCart", match: isShopGrocery },
      { key: "markets",   type: "category", label: "Markets",            icon: "Store",        match: (p) => p.category === "market" },
    ],
  },
  {
    key: "stay",
    label: "Stay the night",
    blurb: "A bed for the night — downtown hotels to country B&Bs.",
    color: "#5B1E55",
    icon: "Hotel",
    match: (p) => LODGING.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "hotels", type: "category", label: "Hotels",      icon: "Hotel", match: (p) => LODGING.has(p.category) && !isBnB(p) },
      { key: "bnbs",   type: "category", label: "B&Bs & inns", icon: "Home",  match: isBnB },
    ],
  },
  {
    key: "faith",
    label: "Faith & worship",
    blurb: "Churches, temples, and houses of worship across the county.",
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
