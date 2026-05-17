"use server";

import {
  buildPlan,
  reconstructPlan,
  decodeSpec,
  swapStopInSpec,
  narratePlanWithClaude,
  type PlanInputs,
  type PlanSpec,
  type Plan,
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
