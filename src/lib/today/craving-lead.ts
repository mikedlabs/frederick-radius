import { easternParts } from "@/lib/tz";

/**
 * The CravingStrip "I want…" lead, shared so /today can keep two adjacent
 * place-answers from saying the same meal twice.
 *
 * `defaultWant` is which main category CravingStrip opens to by the moment (a
 * smart default, not a reshuffle). `suppressedDaypartCategories` reads that same
 * decision so the "Right now, around here" rails (DaypartNeeds) can drop the one
 * rail that would duplicate whatever CravingStrip is already visibly leading
 * with. Pure + client-safe (tz.ts is Intl only), so the CravingStrip server
 * component and the DaypartNeeds loader both import it.
 */

/**
 * Which main category CravingStrip opens to, by the moment. Late night and
 * Fri/Sat evenings lead with Drink, weekend afternoons with Outdoors, everything
 * else with Eat (the universal default + its time-aware meal lead).
 */
export function defaultWant(now: Date): string {
  const { hour, weekday } = easternParts(now);
  const weekend = weekday === 0 || weekday === 6;
  const friOrSat = weekday === 5 || weekday === 6;
  if (hour >= 22 || hour < 5) return "drink"; // late night
  if (weekend && hour >= 9 && hour < 16) return "outdoors"; // weekend daytime
  if (friOrSat && hour >= 16) return "drink"; // Fri/Sat evening
  return "eat";
}

/**
 * The DaypartNeeds place categories that would duplicate CravingStrip's visible
 * lead, so the daypart rails can drop that one rail and lead with something
 * else useful. Keyed on the VISIBLE tab (defaultWant): when CravingStrip shows
 * Eat, its lead is the meal restaurant answer, so the daypart "Dinner"/"Lunch"
 * restaurant rail is the duplicate; when it shows Drink, the brewery/bar rails
 * are. Everything else suppresses nothing.
 */
export function suppressedDaypartCategories(now: Date): Set<string> {
  switch (defaultWant(now)) {
    case "eat":
      return new Set(["restaurant"]);
    case "drink":
      return new Set(["brewery", "bar"]);
    default:
      return new Set();
  }
}
