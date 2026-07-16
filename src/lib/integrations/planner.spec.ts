import { describe, expect, it } from "vitest";
import { FREDERICK_CENTER } from "@/lib/geo";
import { buildPlan } from "@/lib/integrations/planner";

describe("buildPlan", () => {
  it("keeps a food date night out of daytime errand categories", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 3,
      start_at: "2026-07-16T22:00:00.000Z",
      start_near: FREDERICK_CENTER,
      max_distance_m: 2_400,
    });

    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("market");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("coffee");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("bakery");
  });
});
