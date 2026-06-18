/**
 * Cravings — the "I want ___ right now" vocabulary.
 *
 * The simplest possible intent: a person standing on the sidewalk says one
 * noun ("ice cream", "coffee") and wants the nearest OPEN one, now. These
 * are NOT the full category taxonomy — they're the handful of in-the-moment
 * wants worth a one-tap answer, each mapped to a matcher (a category, or a
 * name pattern when the catalog has no clean category, e.g. ice cream lives
 * under `restaurant`). Pure + client-safe: no loader, no server imports.
 */

export type CravingMatchable = {
  category: string;
  name: string;
  subcategories?: string[];
};

/** A sub-filter within a craving's results — "find more specific things"
 *  (Food → Pizza / Food trucks, Parks → Trails / Playgrounds). Each narrows
 *  the already-matched set; the chip row only renders when a craving defines
 *  them, so single-answer cravings (Coffee, Grocery) stay clean. */
export type CravingFacet = {
  key: string;
  label: string;
  match: (p: CravingMatchable) => boolean;
};

export type Craving = {
  key: string;
  /** Verb-free noun the way a person says it walking down the street. */
  label: string;
  /** lucide icon name — resolved by the tile via a small map (keeps this
   *  data file free of React imports). */
  icon:
    | "Coffee"
    | "IceCream"
    | "Utensils"
    | "Cookie"
    | "Beer"
    | "Trees"
    | "ShoppingBag"
    | "ShoppingCart"
    | "Palette"
    | "Music"
    | "FerrisWheel";
  /** Category token used only for the tile tint, reusing the palette the
   *  rest of the app already keys off. */
  color: string;
  match: (p: CravingMatchable) => boolean;
  /** Optional sub-filters surfaced as chips on the results page. */
  facets?: CravingFacet[];
};

// Brand names with no descriptor (Dairy Queen / DQ) are matched explicitly —
// "Queen"/"Treat" alone would false-positive, so only the full brand + the \bdq\b
// word-boundary token are added.
const ICE_CREAM = /ice ?cream|creamery|gelato|scoop|frozen custard|froyo|frozen yogurt|soft serve|dairy ?queen|\bdq\b/i;
const PIZZA = /pizza|pizzeria/i;
const SWEET = /donut|doughnut|fudge|candy|chocolat|dessert|cupcake|pastr|bakery|sweet|cookie|ice ?cream|creamery/i;
const GROCERY = /grocer|supermarket|safeway|giant\b|weis|aldi|lidl|food lion|mom.?s organic|wegmans|harris teeter|common market|costco|megamart|mega ?mart/i;
// Family fun is matched by ACTIVITY name, not the `family` category — that
// category is a junk bucket (mostly schools, daycares, PTAs, a driving school,
// art studios). We want the genuinely-fun outings: arcades, escape rooms,
// bowling, mini golf, the zoo, the science lab, skate parks. Scanned across ALL
// categories so a fun spot miscategorized elsewhere (a skatepark filed under
// "park") still surfaces.
const FAMILY_FUN =
  /\b(arcade|pinball|escape room|escape this|mini ?golf|miniature golf|bowling|lanes\b|zoo|wildlife preserve|aquarium|trampoline|go.?kart|go.?cart|laser ?tag|skating|skate ?park|roller ?rink|ice ?rink|adventure park|fun ?(center|land|zone)|amusement|water ?park|carousel|science (center|lab)|discovery (center|museum)|children.?s museum|paintball|axe ?throwing|putt|raceway|speedway)\b/i;
// Exclude the schooling/childcare/admin noise the `family` bucket is full of —
// "Escape This" is fun, "Gregs Driving School" is not.
const FAMILY_FUN_JUNK =
  /\b(school|elementary|middle|high school|academy|universit|college|early learning|daycare|day care|preschool|pre-?k|\bpta\b|admission|montessori|children.?s center|learning center|recovery|church|ministry|driving)\b/i;

// Order = intent strength, not raw inventory. Food leads (the single most
// universal "I want," ~210 places); then the going-out wants (Coffee, Drinks),
// the treats (Sweets, Ice cream), Parks, then Live music pulled up next to the
// outdoors/culture cluster (it's a distinctive county draw, not a basement
// afterthought), then the errand + culture tail. Happy hour is prepended and
// "More…" appended in CravingStrip, so this is the middle of that grid.
export const CRAVINGS: Craving[] = [
  {
    key: "food",
    label: "Food",
    icon: "Utensils",
    color: "var(--app-accent)",
    // Pizza folded in — a pizzeria is still "I want food," so it's not its
    // own tile; Food answers it (category pizza OR a pizza/pizzeria name).
    match: (p) =>
      p.category === "restaurant" ||
      p.category === "food-truck" ||
      p.category === "pizza" ||
      PIZZA.test(p.name),
    facets: [
      { key: "restaurant", label: "Sit-down", match: (p) => p.category === "restaurant" },
      { key: "pizza", label: "Pizza", match: (p) => p.category === "pizza" || PIZZA.test(p.name) },
      { key: "food-truck", label: "Food trucks", match: (p) => p.category === "food-truck" },
    ],
  },
  {
    key: "coffee",
    label: "Coffee",
    icon: "Coffee",
    color: "var(--app-brand)",
    match: (p) => p.category === "coffee",
  },
  {
    key: "drinks",
    label: "Drinks",
    icon: "Beer",
    color: "var(--app-positive)",
    match: (p) => p.category === "bar" || p.category === "brewery",
    facets: [
      { key: "brewery", label: "Breweries", match: (p) => p.category === "brewery" },
      { key: "bar", label: "Bars", match: (p) => p.category === "bar" },
    ],
  },
  {
    key: "sweets",
    label: "Sweets",
    icon: "Cookie",
    color: "var(--app-brand-2)",
    match: (p) => p.category === "bakery" || SWEET.test(p.name),
  },
  {
    key: "ice-cream",
    label: "Ice cream",
    icon: "IceCream",
    color: "var(--app-cool)",
    // Name-matched, but never an outdoors place: "Creamery Park" contains
    // "creamery" yet is a park, not dessert. Ice cream is a food/treat venue.
    match: (p) =>
      ICE_CREAM.test(p.name) &&
      p.category !== "park" &&
      p.category !== "trail" &&
      p.category !== "playground" &&
      p.category !== "outdoors",
  },
  {
    key: "outside",
    label: "Parks",
    icon: "Trees",
    color: "var(--app-positive)",
    match: (p) =>
      p.category === "park" ||
      p.category === "trail" ||
      p.category === "playground" ||
      p.category === "outdoors",
    facets: [
      { key: "park", label: "Parks", match: (p) => p.category === "park" },
      { key: "trail", label: "Trails", match: (p) => p.category === "trail" || p.category === "outdoors" },
      { key: "playground", label: "Playgrounds", match: (p) => p.category === "playground" },
    ],
  },
  {
    // The formal music halls + stages (Weinberg, Sky Stage, New Spire, the
    // amphitheater). The brewery/bar live-music venues are categorized by
    // what they sell, so they answer via Drinks + the events feed, not here
    // — but "I want live music" deserves its own one-tap door given the
    // county's stages. ~24 places in the `music` category.
    key: "music",
    label: "Live music",
    icon: "Music",
    color: "var(--app-accent)",
    match: (p) =>
      p.category === "music" ||
      /\bamphitheat(er|re)|music hall|sky stage|bandshell\b/i.test(p.name),
  },
  {
    // ~299 places (shopping 225 + market 61 + book-store 13) — the biggest
    // answerable cluster after the non-craving worship/wellness. Mirrors the
    // map's WithinReach "Shops" matcher so /today and /map never disagree.
    key: "shops",
    label: "Shops",
    icon: "ShoppingBag",
    color: "var(--app-cool)",
    match: (p) =>
      p.category === "shopping" ||
      p.category === "market" ||
      p.category === "book-store",
    facets: [
      { key: "shopping", label: "Shops", match: (p) => p.category === "shopping" },
      { key: "market", label: "Markets", match: (p) => p.category === "market" },
      { key: "book-store", label: "Books", match: (p) => p.category === "book-store" },
    ],
  },
  {
    // Grocery stores by name (Common Market, Weis, Safeway, MOM's, Food
    // Lion, Giant, Aldi, Lidl) — distinct from Shops' broad market/retail.
    key: "grocery",
    label: "Grocery",
    icon: "ShoppingCart",
    color: "var(--app-positive)",
    match: (p) => GROCERY.test(p.name),
  },
  {
    // ~64 places (gallery 31 + museum 20 + theater 13). Spruce token (not
    // WithinReach's raw hex) and distinct from food's accent + shops' cool.
    key: "art",
    label: "Art",
    icon: "Palette",
    color: "var(--app-brand-2)",
    match: (p) =>
      p.category === "gallery" ||
      p.category === "museum" ||
      p.category === "theater",
    facets: [
      { key: "gallery", label: "Galleries", match: (p) => p.category === "gallery" },
      { key: "museum", label: "Museums", match: (p) => p.category === "museum" },
      { key: "theater", label: "Theaters", match: (p) => p.category === "theater" },
    ],
  },
  {
    // Genuinely fun family outings, matched by activity name (NOT the `family`
    // category, which is a junk bucket of schools/daycares/studios): the
    // arcades, escape rooms, bowling alleys, mini golf, the zoo, the science
    // lab, skate parks. ~9 verified spots — honest fun beats 39 schools.
    key: "family",
    label: "Family fun",
    icon: "FerrisWheel",
    color: "var(--app-cool)",
    match: (p) => FAMILY_FUN.test(p.name) && !FAMILY_FUN_JUNK.test(p.name),
  },
];

export const CRAVING_BY_KEY: Record<string, Craving> = Object.fromEntries(
  CRAVINGS.map((c) => [c.key, c]),
);

/** True if a place is eligible for ANY craving — used server-side to slim
 *  the /now payload to just the craving-answering places. */
export function isCravingPlace(p: CravingMatchable): boolean {
  return CRAVINGS.some((c) => c.match(p));
}
