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
    | "FerrisWheel"
    | "Wine";
  /** Category token used only for the tile tint, reusing the palette the
   *  rest of the app already keys off. */
  color: string;
  match: (p: CravingMatchable) => boolean;
  /** Optional sub-filters surfaced as chips on the results page. */
  facets?: CravingFacet[];
  /** When true, the results page derives its sub-filter chips DYNAMICALLY from
   *  the cuisines actually present in the matched set (Mexican, Asian, BBQ,
   *  Seafood, …) instead of a fixed `facets` list — so Food can be narrowed by
   *  what's really nearby. Mutually exclusive with `facets`. */
  cuisineFacets?: boolean;
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
// Wineries / vineyards / cideries / meaderies — matched by PRODUCTION terms
// (the county's ~15 are filed under "brewery"), NOT bare "wine" which would
// catch wine shops, wine bars, and beer-&-wine convenience stores.
const WINERY = /\b(winery|wineries|vineyard|vineyards|winecellars|cider|cidery|meadery)\b/i;

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
    // Food narrows by CUISINE, derived from what's actually nearby (Mexican,
    // Asian, BBQ, Seafood, Pizza, Burgers, …) — far richer than a fixed
    // sit-down/pizza/truck split, and it pulls from the whole county.
    cuisineFacets: true,
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
    // Frederick is wine country — ~15 wineries / vineyards / cideries + a
    // meadery, filed under "brewery" in the data, matched here by name so they
    // get their own one-tap door (Linganore, Black Ankle, Loew, Elk Run,
    // Springfield Manor, Catoctin Breeze, Orchid Cellar, Willow Oaks Cider…).
    key: "wineries",
    label: "Wineries",
    icon: "Wine",
    color: "var(--app-brand-press)",
    match: (p) => WINERY.test(p.name),
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
    // Genuinely fun family outings — comprehensive across the county, surfaced
    // two ways: (1) the curated `family-fun` subcategory TAG (the verified
    // venues we add — trampoline parks, climbing, the ice rink, fun centers,
    // the petting farm, escape rooms, pottery studios, skate parks…); (2) an
    // activity-NAME match (arcades, bowling, mini golf, the zoo, the science
    // lab). NOT the raw `family` category (a junk bucket of schools/daycares)
    // and NOT every `playground` row (the data has generic "Playground" OSM
    // dots) — both are filtered out, so the tab stays real fun, not noise.
    key: "family",
    label: "Family fun",
    icon: "FerrisWheel",
    color: "var(--app-cool)",
    match: (p) =>
      Boolean(p.subcategories?.includes("family-fun")) ||
      (FAMILY_FUN.test(p.name) && !FAMILY_FUN_JUNK.test(p.name)),
  },
];

export const CRAVING_BY_KEY: Record<string, Craving> = Object.fromEntries(
  CRAVINGS.map((c) => [c.key, c]),
);

export type Moment = {
  /** Eastern-clock hour, 0–23. */
  hour: number;
  weekend: boolean;
  /** Rain/storm in the current-hour forecast — pulls indoor wants up, Parks down. */
  wet: boolean;
};

/**
 * Reorder the cravings for the moment, so the fast lane LEADS with what a
 * person most likely wants right now — the same instinct the meal tile already
 * follows, applied to the whole grid. Coffee in the morning, drinks + live
 * music in the evening, Parks/Family fun/Art on a weekend; when it's wet,
 * indoor wants rise and Parks sinks. A pure, deterministic re-sort of the SAME
 * set (nothing added or hidden) — the base intent order from CRAVINGS breaks
 * ties via a stable sort, so a quiet hour still reads as the canonical grid.
 */
export function orderCravingsForMoment(cravings: Craving[], { hour, weekend, wet }: Moment): Craving[] {
  const morning = hour >= 5 && hour < 11;
  const midday = hour >= 11 && hour < 16;
  const evening = hour >= 16 && hour < 22;
  const late = hour >= 22 || hour < 5;
  const boost = (key: string): number => {
    let b = 0;
    if (morning && (key === "coffee" || key === "sweets")) b += 3;
    if (midday && key === "food") b += 3;
    if (midday && key === "coffee") b += 1;
    if (evening && (key === "drinks" || key === "music")) b += 3;
    if (evening && (key === "food" || key === "ice-cream")) b += 1;
    if (late && (key === "drinks" || key === "food")) b += 2;
    if (weekend && (key === "outside" || key === "family" || key === "art" || key === "music" || key === "wineries")) b += 2;
    if (wet) {
      if (key === "outside") b -= 4;
      if (["coffee", "food", "art", "family", "sweets", "drinks"].includes(key)) b += 2;
    }
    return b;
  };
  return cravings
    .map((c, i) => ({ c, i, b: boost(c.key) }))
    .sort((x, y) => y.b - x.b || x.i - y.i)
    .map((x) => x.c);
}

/** True if a place is eligible for ANY craving — used server-side to slim
 *  the /now payload to just the craving-answering places. */
export function isCravingPlace(p: CravingMatchable): boolean {
  return CRAVINGS.some((c) => c.match(p));
}
