"use server";

import { decodeSpec } from "@/lib/integrations/planner";
import { getNwsForecast } from "@/lib/integrations/nws";
import { isValidCoord } from "@/lib/geo";
import { resolveSharedPlan } from "@/lib/plan/resolve-shared-plan";
import { buildPlanVisitCheck, type PlanVisitCheckResult } from "@/lib/plan/visit-check";

/** The event archive read aborts after 1s; the existing NWS loader aborts all
 * of its requests after 5s. Await those bounded readers rather than leave
 * upstream work running behind a timeout race. This performs no AI calls. */
export async function checkPlanBeforeVisit(token: string): Promise<PlanVisitCheckResult | null> {
  if (typeof token !== "string") return null;
  const spec = decodeSpec(token);
  if (!spec || !spec.s.length) return null;
  try {
    const plan = await resolveSharedPlan(spec, { timeoutMs: 1_000 });
    if (!plan) return null;
    const startedAt = new Date();
    const geom = plan.stops[0]?.place?.geom ?? plan.stops[0]?.event?.geom;
    const first = plan.stops[0] ? Date.parse(plan.stops[0].at) : Number.NaN;
    // Keep source work within the near-term visit window. Returned forecast
    // periods, not this request guard, determine actual coverage.
    const inForecastRange = Number.isFinite(first) && first < startedAt.getTime() + 72 * 3_600_000;
    let forecast = null;
    if (isValidCoord(geom) && inForecastRange) {
      try { forecast = await getNwsForecast(geom!); } catch { /* Source errors remain visible in the briefing. */ }
    }
    const preserved = { ...plan, share: token };
    return { plan: preserved, briefing: buildPlanVisitCheck(spec, preserved, forecast) };
  } catch {
    // The client retains its current plan when resolution itself fails.
    return null;
  }
}
