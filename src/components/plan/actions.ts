"use server";

import {
  buildPlan,
  reconstructPlan,
  decodeSpec,
  swapStopInSpec,
  slotAlternatives,
  slotCategories,
  setStopInSpec,
  addStopToSpec,
  reshuffleSpec,
  narratePlanWithClaude,
  type PlanInputs,
  type PlanSpec,
  type Plan,
  type PlanAlternative,
  type PlanSlotCategory,
} from "@/lib/integrations/planner";

async function withNarrative(plan: Plan | null): Promise<Plan | null> {
  if (!plan) return null;
  const narrative = await narratePlanWithClaude(plan);
  return narrative ? { ...plan, narrative } : plan;
}

/** Build a fresh plan from the builder inputs. */
export async function generatePlan(input: PlanInputs): Promise<Plan | null> {
  return withNarrative(buildPlan(input));
}

/** Rebuild a plan from a shared token or an edited spec. */
export async function planFromToken(token: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  return spec ? withNarrative(reconstructPlan(spec)) : null;
}

/** Drop the stop at index, then rebuild. Pure spec edit. */
export async function removeStop(token: string, index: number): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  const next: PlanSpec = { ...spec, s: spec.s.filter((_, i) => i !== index) };
  return withNarrative(reconstructPlan(next));
}

/** Swap the stop at index for the next best alternative, then rebuild. */
export async function swapStop(token: string, index: number): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withNarrative(reconstructPlan(swapStopInSpec(spec, index)));
}

/** The real alternatives for a slot, for the Swap chooser. An explicit
 *  `category` filters to that kind (the switcher); omitted = the diverse
 *  default. No narrative (it's a picker, not a finished plan). */
export async function stopAlternatives(
  token: string,
  index: number,
  category?: string,
): Promise<PlanAlternative[]> {
  const spec = decodeSpec(token);
  if (!spec) return [];
  return slotAlternatives(spec, index, category);
}

/** Everything the Swap chooser needs on open, in one round trip: the
 *  categories this slot could become, the category to open on, and that
 *  category's alternatives. Prefers the slot's current kind, but only if
 *  it actually has other options — otherwise it opens on the strongest
 *  kind that does, so the user never lands on an empty list with real
 *  choices one tap away. */
export async function stopSwapOptions(
  token: string,
  index: number,
): Promise<{ categories: PlanSlotCategory[]; alternatives: PlanAlternative[]; selected: string | null }> {
  const spec = decodeSpec(token);
  if (!spec) return { categories: [], alternatives: [], selected: null };
  const categories = slotCategories(spec, index);
  const selected =
    categories.find((c) => c.current && c.count > 0)?.category
    ?? categories.find((c) => c.count > 0)?.category
    ?? categories.find((c) => c.current)?.category
    ?? categories[0]?.category
    ?? null;
  const alternatives = selected ? slotAlternatives(spec, index, selected) : [];
  return { categories, alternatives, selected };
}

/** Set the stop at index to the place the user chose, then rebuild. */
export async function setStop(token: string, index: number, slug: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withNarrative(reconstructPlan(setStopInSpec(spec, index, slug)));
}

/** Add a specific place (e.g. from Saved) to the plan, then rebuild. */
export async function addStop(token: string, slug: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withNarrative(reconstructPlan(addStopToSpec(spec, slug)));
}

/** Re-roll the plan, keeping the pinned places, then rebuild. */
export async function reshufflePlan(
  token: string,
  pinnedSlugs: string[],
  seed: number,
): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withNarrative(reconstructPlan(reshuffleSpec(spec, pinnedSlugs, seed)));
}
