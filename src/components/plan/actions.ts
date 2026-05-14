"use server";

import { buildPlan, narratePlanWithClaude, type PlanInputs, type Plan } from "@/lib/integrations/planner";

export async function generatePlan(input: PlanInputs): Promise<Plan> {
  const plan = buildPlan(input);
  const narrative = await narratePlanWithClaude(plan);
  return narrative ? { ...plan, narrative } : plan;
}
