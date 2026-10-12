import type { PlanInputs, PlanSpec } from "@/lib/integrations/planner";

export type PlanInputContext = {
  currentSpec?: PlanSpec | null;
  initialInputs?: Partial<PlanInputs>;
};

/** These fields belong to the visible controls, not an older share token. */
export type PlanRebuildControls = Pick<PlanInputs,
  "audience" | "vibe" | "duration_hours" | "start_at" |
  "municipality" | "start_near" | "max_distance_m"
>;

export type PreservedPlanConstraints = Pick<PlanInputs,
  "local_only" | "budget" | "require_wheelchair_access" |
  "parking_priority" | "max_stops" | "require_verified_hours" | "seed"
>;

const BOOLEAN_CONSTRAINTS = [
  "local_only",
  "require_wheelchair_access",
  "parking_priority",
  "require_verified_hours",
] as const;

/** A current plan is authoritative, including omissions after an edit. */
function sourceInputs({ currentSpec, initialInputs }: PlanInputContext): Partial<PlanInputs> {
  return currentSpec?.i ?? initialInputs ?? {};
}

/** Keep preferences that the builder does not otherwise expose as controls.
 * Pick explicitly because decoded tokens can contain legacy location fields. */
export function preservedPlanConstraints(context: PlanInputContext): PreservedPlanConstraints {
  const source = sourceInputs(context);
  const constraints: PreservedPlanConstraints = {};
  for (const key of BOOLEAN_CONSTRAINTS) {
    if (typeof source[key] === "boolean") constraints[key] = source[key];
  }
  if (source.budget === "free" || source.budget === "value") constraints.budget = source.budget;
  if (Number.isSafeInteger(source.max_stops) && source.max_stops! > 0) constraints.max_stops = source.max_stops;
  if (Number.isSafeInteger(source.seed)) constraints.seed = source.seed;
  return constraints;
}

/** Keep an explicit distance preference only while the applied scope is
 * unchanged. The caller tracks Near me separately because share tokens
 * intentionally cannot recover its private coordinates or infer that mode. */
export function planDistanceForArea(area: string, previousArea: string, context: PlanInputContext): number | undefined {
  const source = sourceInputs(context);
  const sameScope = area === previousArea && (
    area === "county" || area === "near" ? !source.municipality : source.municipality === area
  );
  if (sameScope && typeof source.max_distance_m === "number" && Number.isFinite(source.max_distance_m) && source.max_distance_m > 0) {
    return source.max_distance_m;
  }
  if (area === "county") return 60_000;
  if (area === "near") return 16_000;
  return undefined;
}

/** Rebuild using the latest controls without reviving removed anchors or
 * retaining device coordinates from an earlier plan. Exact locations must
 * come from the user's current Near me choice or the selected town. */
export function rebuildPlanInputs(controls: PlanRebuildControls, context: PlanInputContext): PlanInputs {
  const source = sourceInputs(context);
  const { currentSpec } = context;
  const input: PlanInputs = {
    ...preservedPlanConstraints(context),
    audience: controls.audience,
    vibe: controls.vibe,
    duration_hours: controls.duration_hours,
    ...(controls.start_at ? { start_at: controls.start_at } : {}),
    ...(controls.municipality ? { municipality: controls.municipality } : {}),
    ...(controls.start_near ? { start_near: controls.start_near } : {}),
    ...(controls.max_distance_m !== undefined ? { max_distance_m: controls.max_distance_m } : {}),
  };
  if (source.anchor_slug && (!currentSpec || currentSpec.s.some((ref) => "p" in ref && ref.p === source.anchor_slug))) {
    input.anchor_slug = source.anchor_slug;
  }
  if (source.event_anchor_slug && (!currentSpec || currentSpec.s.some((ref) => "e" in ref && ref.e === source.event_anchor_slug))) {
    input.event_anchor_slug = source.event_anchor_slug;
  }
  return input;
}

/** These labels describe actual filtering, without promising unknown access
 * or prices have been verified. Seed is internal ranking state. */
export function planConstraintLabels(context: PlanInputContext): string[] {
  const constraints = preservedPlanConstraints(context);
  return [
    constraints.local_only ? "Local businesses only" : null,
    constraints.budget === "free" ? "Free places only" : null,
    constraints.budget === "value" ? "Avoid known higher-priced places" : null,
    constraints.require_wheelchair_access ? "Avoid known wheelchair barriers" : null,
    constraints.parking_priority ? "Prioritize parking guidance" : null,
    constraints.max_stops ? `Up to ${constraints.max_stops} ${constraints.max_stops === 1 ? "stop" : "stops"}` : null,
    constraints.require_verified_hours ? "Require confirmed hours" : null,
  ].filter((label): label is string => label !== null);
}
