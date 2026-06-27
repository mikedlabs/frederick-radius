import type { ReactNode } from "react";
import { currentMeal } from "@/lib/meal";
import WantsAccordion from "./WantsAccordion";

/**
 * CravingStrip — the "I want…" fast lane on Today.
 *
 * A HIERARCHY, not a flat wall: a row of main category tiles (Eat · Drink ·
 * Outdoors · See & do · Shop · Wellness & stay · Get around), each expanding to
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
  contextSlot,
}: {
  locationSlot?: ReactNode;
  contextSlot?: ReactNode;
}) {
  // The meal occasion right now (Frederick clock) — Eat's time-aware lead sub.
  const meal = currentMeal();

  return (
    <section aria-labelledby="i-want-eyebrow" className="space-y-3">
      <div className="flex min-h-[34px] items-center justify-between gap-3">
        <h2
          id="i-want-eyebrow"
          className="font-serif text-[18px] font-semibold leading-none tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          I want…
        </h2>
        {locationSlot}
      </div>

      <WantsAccordion meal={{ key: meal.key, label: meal.label, phrase: meal.phrase }} />

      {contextSlot}
    </section>
  );
}
