import type { ReactNode } from "react";
import { currentMeal } from "@/lib/meal";
import { easternParts } from "@/lib/tz";
import WantsAccordion from "./WantsAccordion";

/**
 * Which main category starts expanded, by the moment — a smart default, NOT a
 * reshuffle (the 7 mains keep fixed positions; only the open one changes). Late
 * night and Fri/Sat evenings lead with Drink, weekend afternoons with Outdoors,
 * everything else with Eat (the universal default + its time-aware meal lead).
 */
function defaultWant(now: Date): string {
  const { hour, weekday } = easternParts(now);
  const weekend = weekday === 0 || weekday === 6;
  const friOrSat = weekday === 5 || weekday === 6;
  if (hour >= 22 || hour < 5) return "drink"; // late night
  if (weekend && hour >= 9 && hour < 16) return "outdoors"; // weekend daytime
  if (friOrSat && hour >= 16) return "drink"; // Fri/Sat evening
  return "eat";
}

/**
 * CravingStrip — the "I want…" fast lane on Today.
 *
 * A HIERARCHY, not a flat wall: a row of main category tiles (Eat · Drink ·
 * Outdoors · See & do · Shop · Wind down · Get around), each expanding to
 * its subcategories inline (WantsAccordion). This replaced the old ~22-peer-tile
 * grid where "Dinner" sat confusingly beside "Food" and utilities mixed in with
 * cravings. Now there's one main per intent, subcategories underneath, and the
 * useful destinations that were buried in the header "More" drawer (Trails,
 * Rivers, Amenities, Markers, Plan, County pulse) live here too.
 *
 * The eating confusion is fixed structurally: no standalone meal tile. "Eat" is
 * the main category and the time-aware occasion is its lead sub ("Restaurants —
 * open for dinner now"), computed here on the server so it's right on first
 * paint. Server component otherwise (no fetch), so it never blocks the shell.
 *
 * `locationSlot` rides on the right of the "I want…" bar (the LocationPrime
 * consent pill); self-hides once granted. `contextSlot` is the thin "right now"
 * live band, beneath the categories.
 */
export default function CravingStrip({
  locationSlot,
  intelSlot,
}: {
  locationSlot?: ReactNode;
  /** The "right now" intelligence line (NowIntel) above the grid. */
  intelSlot?: ReactNode;
}) {
  // The meal occasion right now (Frederick clock) — Eat's time-aware lead sub.
  const now = new Date();
  const meal = currentMeal(now);
  const defaultOpen = defaultWant(now);

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-2.5">
      <h2 id="quick-actions-heading" className="sr-only">
        Quick actions
      </h2>
      {locationSlot ? (
        <div className="flex min-h-[34px] justify-end">
        {locationSlot}
        </div>
      ) : null}

      {intelSlot}

      <WantsAccordion
        meal={{ key: meal.key, label: meal.label, phrase: meal.phrase }}
        defaultOpen={defaultOpen}
      />
    </section>
  );
}
