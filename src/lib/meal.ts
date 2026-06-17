/**
 * Meal occasions — the time-aware "I want breakfast / lunch / dinner" want.
 *
 * Unlike the noun cravings (src/data/cravings.ts), a meal is a TIME of day,
 * not a kind of place. We hold ZERO menu / serves-breakfast data anywhere, so
 * we never claim a place "serves dinner." What we DO hold is verified live
 * hours, so the honest claim is "open for dinner right now" — a clock fact.
 *
 * The /today tile auto-selects the meal it currently IS by the Frederick
 * (Eastern) clock, so the user only ever sees the meal that's actually
 * happening — which keeps the strip uncluttered AND is honest by construction:
 * "open now" during the dinner band simply IS "open for dinner now." The
 * /nearby answer then ranks open-first against the user's location, exactly
 * like the noun cravings (it reads category + name + open_status, all of which
 * survive the /nearby slim()).
 *
 * Pure + client-safe: tz.ts uses Intl only, no server imports.
 */
import { easternParts } from "@/lib/tz";

export type MealKey = "breakfast" | "brunch" | "lunch" | "dinner" | "late";

type MealMatchable = { category: string; name: string };

export type Meal = {
  key: MealKey;
  /** Tile + header noun, e.g. "Dinner". */
  label: string;
  /** Honest framing fragment: "open " + phrase, e.g. "open for dinner". */
  phrase: string;
  /** lucide icon name — must also exist in the ICONS maps in CravingStrip.tsx
   *  and RightNow.tsx (same contract the noun cravings use). */
  icon: "Sunrise" | "Croissant" | "Sandwich" | "UtensilsCrossed" | "Moon";
  /** Filing-ink tint token (var(--app-*)). */
  color: string;
  /** Food categories appropriate to this meal. */
  cats: string[];
  /** Also catch pizza-by-name — most pizzerias land in `restaurant`. */
  pizza: boolean;
  /** Optional destination override. Brunch points at the VERIFIED /brunch
   *  list (the moat) rather than the open-now /nearby heuristic. */
  href?: string;
};

const PIZZA_RE = /\b(pizza|pizzeria)\b/i;

// One consistent ink (the deep signal vermilion, AA as text-on-light) so the
// auto-relabeling tile doesn't lurch through colors across the day. Dinner is
// gated to eat-out categories (bar/brewery answer via the Drinks craving);
// breakfast/brunch fold in coffee + bakeries (half of what's open in the
// morning is a cafe, so the label reads coffee-inclusive). Late night keeps a
// bar in the set — at 11pm a bar kitchen is a real "late bite" answer.
export const MEALS: Record<MealKey, Meal> = {
  breakfast: { key: "breakfast", label: "Breakfast",  phrase: "for breakfast",   icon: "Sunrise",         color: "var(--app-brand-press)", cats: ["restaurant", "coffee", "bakery", "food-truck"], pizza: false },
  brunch:    { key: "brunch",    label: "Brunch",     phrase: "for brunch",      icon: "Croissant",       color: "var(--app-brand-press)", cats: ["restaurant", "coffee", "bakery", "food-truck"], pizza: false, href: "/brunch" },
  lunch:     { key: "lunch",     label: "Lunch",      phrase: "for lunch",       icon: "Sandwich",        color: "var(--app-brand-press)", cats: ["restaurant", "pizza", "food-truck", "bakery"], pizza: true },
  dinner:    { key: "dinner",    label: "Dinner",     phrase: "for dinner",      icon: "UtensilsCrossed", color: "var(--app-brand-press)", cats: ["restaurant", "pizza", "food-truck"], pizza: true },
  late:      { key: "late",      label: "Late night", phrase: "for a late bite", icon: "Moon",            color: "var(--app-brand-press)", cats: ["restaurant", "pizza", "food-truck", "bar"], pizza: true },
};

export function isMealKey(k: string | null | undefined): k is MealKey {
  return k != null && Object.prototype.hasOwnProperty.call(MEALS, k);
}

export function mealForKey(k: string | null | undefined): Meal | null {
  return isMealKey(k) ? MEALS[k] : null;
}

/** Whether a place fits a meal occasion (category gate + pizza-by-name). Honest
 *  by construction: it never asserts the place SERVES the meal, only that it's
 *  the kind of place you'd go for it — the open-now filter does the rest. */
export function matchMeal(meal: Meal, p: MealMatchable): boolean {
  return meal.cats.includes(p.category) || (meal.pizza && PIZZA_RE.test(p.name));
}

/**
 * The meal occasion happening RIGHT NOW in Frederick (Eastern clock). The
 * bands tile the whole day so the tile is never blank:
 *   late      22:00–05:00 (and the small hours)
 *   breakfast 05:00–11:00 weekdays (and weekend mornings before 8)
 *   brunch    08:00–14:00 Sat/Sun (overrides breakfast/lunch on weekends)
 *   lunch     11:00–16:00
 *   dinner    16:00–22:00
 */
export function currentMeal(now: Date = new Date()): Meal {
  const { hour, weekday } = easternParts(now);
  const weekend = weekday === 0 || weekday === 6;
  if (hour < 5 || hour >= 22) return MEALS.late;
  if (weekend && hour >= 8 && hour < 14) return MEALS.brunch;
  if (hour < 11) return MEALS.breakfast;
  if (hour < 16) return MEALS.lunch;
  return MEALS.dinner;
}
