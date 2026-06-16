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
    | "Music";
  /** Category token used only for the tile tint, reusing the palette the
   *  rest of the app already keys off. */
  color: string;
  match: (p: CravingMatchable) => boolean;
};

// Brand names with no descriptor (Dairy Queen / DQ) are matched explicitly —
// "Queen"/"Treat" alone would false-positive, so only the full brand + the \bdq\b
// word-boundary token are added.
const ICE_CREAM = /ice ?cream|creamery|gelato|scoop|frozen custard|froyo|frozen yogurt|soft serve|dairy ?queen|\bdq\b/i;
const PIZZA = /pizza|pizzeria/i;
const SWEET = /donut|doughnut|fudge|candy|chocolat|dessert|cupcake|pastr|bakery|sweet|cookie|ice ?cream|creamery/i;
const GROCERY = /grocer|supermarket|safeway|giant\b|weis|aldi|lidl|food lion|mom.?s organic|wegmans|harris teeter|common market/i;

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
