import { describe, expect, it } from "vitest";
import type { PlanInputs, PlanSpec } from "@/lib/integrations/planner";
import { planConstraintLabels, planDistanceForArea, preservedPlanConstraints, rebuildPlanInputs, type PlanRebuildControls } from "./plan-inputs";

const initial: PlanInputs = {
  audience: "family", vibe: "easy", duration_hours: 3,
  start_at: "2026-10-12T17:00:00Z", municipality: "frederick",
  start_near: { lng: -77.4121, lat: 39.4161 }, max_distance_m: 2_400,
  budget: "free", local_only: true, require_wheelchair_access: true,
  parking_priority: true, max_stops: 2, require_verified_hours: true, seed: 37,
  anchor_slug: "library", event_anchor_slug: "afternoon-concert",
};
const controls: PlanRebuildControls = {
  audience: "friends", vibe: "cultural", duration_hours: 4,
  start_at: "2026-10-13T19:00:00Z", municipality: "brunswick",
  start_near: { lng: -77.6289, lat: 39.3143 },
};
const spec = (i: PlanInputs = initial): PlanSpec => ({
  v: 1, i, s: [{ e: "afternoon-concert" }, { p: "library" }],
});

describe("plan constraint preservation", () => {
  it("keeps Ask budget, access, hours and ranking choices when rebuilding", () => {
    const result = rebuildPlanInputs(controls, { currentSpec: spec(), initialInputs: { ...initial, budget: "value" } });
    expect(result).toMatchObject({
      budget: "free", local_only: true, require_wheelchair_access: true,
      parking_priority: true, max_stops: 2, require_verified_hours: true, seed: 37,
    });
  });

  it("applies a changed town and time without carrying the old origin or radius", () => {
    const result = rebuildPlanInputs(controls, { currentSpec: spec() });
    expect(result).toMatchObject(controls);
    expect(result.start_near).not.toEqual(initial.start_near);
    expect(result.max_distance_m).toBeUndefined();
  });

  it("clears town and exact coordinates for a whole-county choice", () => {
    const result = rebuildPlanInputs({ audience: "solo", vibe: "easy", duration_hours: 2, max_distance_m: 60_000 }, { currentSpec: spec() });
    expect(result.municipality).toBeUndefined();
    expect(result.start_near).toBeUndefined();
    expect(result.start_at).toBeUndefined();
    expect(result.max_distance_m).toBe(60_000);
    expect(result.budget).toBe("free");
  });

  it("uses only coordinates explicitly supplied by the current location control", () => {
    const near = { lng: -77.39, lat: 39.44 };
    const result = rebuildPlanInputs({ audience: "solo", vibe: "easy", duration_hours: 2, start_near: near, max_distance_m: 16_000 }, { currentSpec: spec() });
    expect(result.start_near).toEqual(near);
    expect(result.municipality).toBeUndefined();
    expect(result.max_distance_m).toBe(16_000);
  });

  it("does not restore an event removed from the current token", () => {
    const current = spec({ ...initial });
    delete current.i.event_anchor_slug;
    current.s = [{ p: "library" }];
    const result = rebuildPlanInputs(controls, { currentSpec: current, initialInputs: initial });
    expect(result.event_anchor_slug).toBeUndefined();
    expect(result.anchor_slug).toBe("library");
  });

  it("does not restore removed or swapped anchors even if a legacy token keeps their input", () => {
    const current = { ...spec(), s: [{ p: "museum" }] };
    const result = rebuildPlanInputs(controls, { currentSpec: current, initialInputs: initial });
    expect(result.event_anchor_slug).toBeUndefined();
    expect(result.anchor_slug).toBeUndefined();
  });

  it("keeps unresolved event references that remain selected in the current token", () => {
    const result = rebuildPlanInputs(controls, { currentSpec: spec() });
    expect(result.event_anchor_slug).toBe("afternoon-concert");
    expect(result.anchor_slug).toBe("library");
  });

  it("uses initial Ask inputs only before there is a current plan", () => {
    expect(rebuildPlanInputs(controls, { initialInputs: initial })).toMatchObject({ budget: "free", require_verified_hours: true, event_anchor_slug: "afternoon-concert" });
    const current = spec({ audience: "solo", vibe: "easy", duration_hours: 2 });
    expect(preservedPlanConstraints({ currentSpec: current, initialInputs: initial })).toEqual({});
    expect(rebuildPlanInputs(controls, { currentSpec: current, initialInputs: initial }).event_anchor_slug).toBeUndefined();
  });

  it("preserves explicit false and zero seed instead of replacing them with initial defaults", () => {
    const current = spec({ ...initial, budget: "value", local_only: false, require_wheelchair_access: false, parking_priority: false, require_verified_hours: false, seed: 0 });
    expect(preservedPlanConstraints({ currentSpec: current, initialInputs: initial })).toEqual({ budget: "value", local_only: false, require_wheelchair_access: false, parking_priority: false, require_verified_hours: false, max_stops: 2, seed: 0 });
  });

  it("does not pass malformed optional token values into filtering", () => {
    const current = spec({ ...initial, budget: "expensive", local_only: "true", max_stops: -2, seed: Infinity } as unknown as PlanInputs);
    expect(preservedPlanConstraints({ currentSpec: current })).toEqual({ require_wheelchair_access: true, parking_priority: true, require_verified_hours: true });
  });
});

describe("plan constraint labels", () => {
  it("shows the inherited choices without promising unknown access is confirmed", () => {
    expect(planConstraintLabels({ currentSpec: spec() })).toEqual([
      "Local businesses only", "Free places only", "Avoid known wheelchair barriers",
      "Prioritize parking guidance", "Up to 2 stops", "Require confirmed hours",
    ]);
  });

  it("omits inactive choices and internal ranking state", () => {
    expect(planConstraintLabels({ initialInputs: { budget: "value", max_stops: 1, seed: 37, local_only: false, require_verified_hours: false } })).toEqual(["Avoid known higher-priced places", "Up to 1 stop"]);
    expect(planConstraintLabels({})).toEqual([]);
  });
});


describe("distance preferences for the current area", () => {
  it("retains a short-walk distance in the same town using only the currently selected public origin", () => {
    const context = { currentSpec: spec() };
    const townOrigin = { lng: -77.4126, lat: 39.4142 };
    const result = rebuildPlanInputs({ ...controls, municipality: "frederick", start_near: townOrigin, max_distance_m: planDistanceForArea("frederick", "frederick", context) }, context);
    expect(result.max_distance_m).toBe(2_400);
    expect(result.start_near).toEqual(townOrigin);
    expect(result.start_near).not.toEqual(initial.start_near);
  });

  it("retains a county plan's explicit distance without restoring omitted private coordinates", () => {
    const current = spec({ ...initial, municipality: undefined, start_near: undefined });
    const context = { currentSpec: current };
    const result = rebuildPlanInputs({ audience: "friends", vibe: "easy", duration_hours: 3, max_distance_m: planDistanceForArea("county", "county", context) }, context);
    expect(result.max_distance_m).toBe(2_400);
    expect(result.start_near).toBeUndefined();
    expect(result.municipality).toBeUndefined();
  });

  it("resets the old distance after changing towns or switching to county or Near me", () => {
    const context = { currentSpec: spec() };
    expect(planDistanceForArea("brunswick", "frederick", context)).toBeUndefined();
    expect(planDistanceForArea("county", "frederick", context)).toBe(60_000);
    expect(planDistanceForArea("near", "frederick", context)).toBe(16_000);
  });

  it("distinguishes Near me from county using applied UI scope without deriving coordinates", () => {
    const context = { currentSpec: spec({ ...initial, municipality: undefined, start_near: undefined, max_distance_m: 500 }) };
    expect(planDistanceForArea("near", "near", context)).toBe(500);
    expect(planDistanceForArea("county", "near", context)).toBe(60_000);
    expect(planDistanceForArea("near", "county", context)).toBe(16_000);
  });

  it("does not let an initial radius overwrite its omission from the current plan", () => {
    const current = spec({ audience: "friends", vibe: "easy", duration_hours: 3, municipality: "frederick" });
    expect(planDistanceForArea("frederick", "frederick", { currentSpec: current, initialInputs: initial })).toBeUndefined();
    expect(planDistanceForArea("frederick", "frederick", { initialInputs: initial })).toBe(2_400);
  });

  it("does not inherit a town radius when the applied UI scope disagrees with the current plan", () => {
    expect(planDistanceForArea("county", "county", { currentSpec: spec() })).toBe(60_000);
    expect(planDistanceForArea("brunswick", "brunswick", { currentSpec: spec() })).toBeUndefined();
  });

  it.each([0, -2, NaN, Infinity])("does not reuse an invalid explicit distance: %s", (distance) => {
    const current = spec({ ...initial, municipality: undefined, max_distance_m: distance });
    expect(planDistanceForArea("county", "county", { currentSpec: current })).toBe(60_000);
  });
});
