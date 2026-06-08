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
    | "Pizza"
    | "Cookie"
    | "Beer"
    | "Trees";
  /** Category token used only for the tile tint, reusing the palette the
   *  rest of the app already keys off. */
  color: string;
  match: (p: CravingMatchable) => boolean;
};

const ICE_CREAM = /ice ?cream|creamery|gelato|scoop|frozen custard|froyo|frozen yogurt|soft serve/i;
const PIZZA = /pizza|pizzeria/i;
const SWEET = /donut|doughnut|fudge|candy|chocolat|dessert|cupcake|pastr|bakery|sweet|cookie|ice ?cream|creamery/i;

export const CRAVINGS: Craving[] = [
  {
    key: "coffee",
    label: "Coffee",
    icon: "Coffee",
    color: "var(--app-brand)",
    match: (p) => p.category === "coffee",
  },
  {
    key: "ice-cream",
    label: "Ice cream",
    icon: "IceCream",
    color: "var(--app-cool)",
    match: (p) => ICE_CREAM.test(p.name),
  },
  {
    key: "food",
    label: "Food",
    icon: "Utensils",
    color: "var(--app-accent)",
    match: (p) => p.category === "restaurant" || p.category === "food-truck",
  },
  {
    key: "pizza",
    label: "Pizza",
    icon: "Pizza",
    color: "var(--app-warning)",
    match: (p) => p.category === "pizza" || PIZZA.test(p.name),
  },
  {
    key: "sweets",
    label: "Sweets",
    icon: "Cookie",
    color: "var(--app-brand-2)",
    match: (p) => p.category === "bakery" || SWEET.test(p.name),
  },
  {
    key: "drinks",
    label: "A drink",
    icon: "Beer",
    color: "var(--app-positive)",
    match: (p) => p.category === "bar" || p.category === "brewery",
  },
  {
    key: "outside",
    label: "Fresh air",
    icon: "Trees",
    color: "var(--app-positive)",
    match: (p) => p.category === "park" || p.category === "trail",
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
