"use server";

import {
  buildPlan,
  reconstructPlan,
  decodeSpec,
  encodeSpec,
  swapStopInSpec,
  slotAlternatives,
  slotCategories,
  setStopInSpec,
  addStopToSpec,
  reshuffleSpec,
  type PlanInputs,
  type PlanSpec,
  type Plan,
  type PlanAlternative,
  type PlanSlotCategory,
} from "@/lib/integrations/planner";

import { planAroundEvent, resolvePlanChoiceContext, resolveSharedPlan } from "@/lib/plan/resolve-shared-plan";

async function withWeather(plan: Plan | null): Promise<Plan | null> {
  if (!plan) return null;
  // The itinerary itself is deterministic and should not wait on decorative
  // generated prose. Give the live forecast a short budget, then return the
  // useful plan even if the network is slow.
  const weather_note = await Promise.race([
    weatherNoteFor(plan),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
  ]);
  return {
    ...plan,
    ...(weather_note ? { weather_note } : {}),
  };
}

/** The plan builder knowing today's sky (experience review, differentiators
 *  #3, scoped to the honest half): when the NWS hourly forecast puts precip
 *  probability over 50% during the plan's window, say so in one calm line.
 *  We deliberately do NOT reorder stops on a probability — a wrong reshuffle
 *  is worse than a right warning. Fail-soft: any fetch problem = no note. */
async function weatherNoteFor(plan: Plan): Promise<string | null> {
  try {
    if (plan.stops.length === 0) return null;
    const first = new Date(plan.stops[0].at).getTime();
    const last = plan.stops[plan.stops.length - 1];
    const end = new Date(last.at).getTime() + last.duration_min * 60_000;
    const { getNwsForecast } = await import("@/lib/integrations/nws");
    const firstGeom = plan.stops[0].place?.geom ?? plan.stops[0].event?.geom;
    if (!firstGeom) return null;
    const fc = await getNwsForecast(firstGeom);
    if (!fc) return null;
    let peak: { p: number; t: number } | null = null;
    for (const h of fc.hourly) {
      const t = new Date(h.startTime).getTime();
      if (t < first - 3_600_000 || t > end) continue;
      const p = h.probabilityOfPrecipitation ?? 0;
      if (p >= 50 && (!peak || p > peak.p)) peak = { p, t };
    }
    if (!peak) return null;
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
    }).format(new Date(peak.t));
    return `Rain is likely around ${clock} (${peak.p}% chance), plan for cover between stops.`;
  } catch {
    return null;
  }
}

/** Build a fresh plan from the builder inputs. */
export async function generatePlan(input: PlanInputs): Promise<Plan | null> {
  return input.event_anchor_slug
    ? withWeather(await planAroundEvent(input.event_anchor_slug, input))
    : withWeather(buildPlan(input));
}

/** Rebuild the unpinned slots while retaining the selected references. A
 * pinned choice that no longer fits is held for review rather than replaced. */
export async function regeneratePinnedPlan(token: string, input: PlanInputs, pinnedSlugs: string[]): Promise<Plan | null> {
  const original = decodeSpec(token);
  if (!original || !Array.isArray(pinnedSlugs)) return null;
  const selected = new Set(original.s.flatMap((ref) => "p" in ref ? [ref.p] : []));
  const pins = pinnedSlugs.slice(0, 8).filter((slug) => typeof slug === "string" && selected.has(slug));
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.max_distance_m !== undefined && (!Number.isFinite(input.max_distance_m) || input.max_distance_m <= 0)) return null;
  if (input.max_stops !== undefined && (!Number.isInteger(input.max_stops) || input.max_stops < 1 || input.max_stops > 8)) return null;
  if (input.seed !== undefined && !Number.isSafeInteger(input.seed)) return null;
  if (input.budget !== undefined && input.budget !== "free" && input.budget !== "value") return null;
  for (const key of ["local_only", "require_wheelchair_access", "parking_priority", "require_verified_hours"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") return null;
  }
  const near = input.start_near;
  if (near && (!Number.isFinite(near.lng) || !Number.isFinite(near.lat) || Math.abs(near.lng) > 180 || Math.abs(near.lat) > 90)) return null;
  // Validate public controls through the token parser. Current coordinates
  // exist only inside this request and are stripped from every share token.
  const checked = decodeSpec(encodeSpec({ ...original, i: input }));
  if (!checked) return null;
  const requestSpec = { ...checked, i: { ...checked.i, ...(near ? { start_near: near } : {}) } };
  const context = await resolvePlanChoiceContext(requestSpec);
  if (!context.eventAvailable) return withWeather(await resolveSharedPlan(requestSpec));
  const previousSeed = checked.i.seed ?? 0;
  const seed = Number.isSafeInteger(previousSeed + 1) ? previousSeed + 1 : 0;
  const shuffled = reshuffleSpec(context.spec, pins, seed);
  return withWeather(reconstructPlan({ ...shuffled, i: { ...requestSpec.i, seed } }, context.events));
}

/** Rebuild a plan from a shared token or an edited spec. */
export async function planFromToken(token: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  return spec ? withWeather(await resolveSharedPlan(spec)) : null;
}

/** Drop the stop at index, then rebuild. Pure spec edit. */
export async function removeStop(token: string, index: number): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  if (!Number.isInteger(index) || index < 0 || index >= spec.s.length) return null;
  const next: PlanSpec = { ...spec, i: { ...spec.i }, s: spec.s.filter((_, i) => i !== index) };
  if (spec.s[index] && "e" in spec.s[index] && spec.s[index].e === next.i.event_anchor_slug) delete next.i.event_anchor_slug;
  return withWeather(await resolveSharedPlan(next));
}

/** Swap the stop at index for the next best alternative, then rebuild. */
export async function swapStop(token: string, index: number): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  const context = await resolvePlanChoiceContext(spec);
  if (!context.eventAvailable) return withWeather(reconstructPlan(spec, context.events));
  const edited = swapStopInSpec(context.spec, index);
  return withWeather(reconstructPlan({ ...edited, i: spec.i }, context.events));
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
  const context = await resolvePlanChoiceContext(spec);
  return context.eventAvailable ? slotAlternatives(context.spec, index, category) : [];
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
  const context = await resolvePlanChoiceContext(spec);
  if (!context.eventAvailable) return { categories: [], alternatives: [], selected: null };
  const categories = slotCategories(context.spec, index);
  const selected =
    categories.find((c) => c.current && c.count > 0)?.category
    ?? categories.find((c) => c.count > 0)?.category
    ?? categories.find((c) => c.current)?.category
    ?? categories[0]?.category
    ?? null;
  const alternatives = selected ? slotAlternatives(context.spec, index, selected) : [];
  return { categories, alternatives, selected };
}

/** Set the stop at index to the place the user chose, then rebuild. */
export async function setStop(token: string, index: number, slug: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withWeather(await resolveSharedPlan(setStopInSpec(spec, index, slug)));
}

/** Add a specific place (e.g. from Saved) to the plan, then rebuild. */
export async function addStop(token: string, slug: string): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  return withWeather(await resolveSharedPlan(addStopToSpec(spec, slug)));
}

/** Re-roll the plan, keeping the pinned places, then rebuild. */
export async function reshufflePlan(
  token: string,
  pinnedSlugs: string[],
  seed: number,
): Promise<Plan | null> {
  const spec = decodeSpec(token);
  if (!spec) return null;
  const context = await resolvePlanChoiceContext(spec);
  if (!context.eventAvailable) return withWeather(reconstructPlan(spec, context.events));
  const edited = reshuffleSpec(context.spec, pinnedSlugs, seed);
  return withWeather(reconstructPlan({ ...edited, i: { ...spec.i, seed } }, context.events));
}
