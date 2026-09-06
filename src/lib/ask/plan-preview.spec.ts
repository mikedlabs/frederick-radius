import { describe, expect, it, vi } from "vitest";
import { askPlanMaxDistance, buildAskPlanPreview } from "./plan-preview";
import { parseAskIntent } from "./intent";
import { buildPlan } from "@/lib/integrations/planner";

vi.mock("@/lib/integrations/planner", () => ({ buildPlan: vi.fn(() => ({ stops: [] })) }));

describe("Ask plan fit", () => {
  it.each(["Plan the next two hours", "Plan the next two hours for a date"])(
    "requires verified availability starting now for %s", (query) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-06T18:00:00Z"));
      try {
        const result = buildAskPlanPreview(parseAskIntent(query), { municipality: "brunswick" }, query);
        expect(result).toBeNull();
        expect(buildPlan).toHaveBeenLastCalledWith(expect.objectContaining({
          require_verified_hours: true, start_at: "2026-09-06T18:00:00.000Z",
          municipality: "brunswick", duration_hours: 2,
        }));
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("applies a walking radius only to a walking plan", () => {
    expect(askPlanMaxDistance("walk", { walkingTolerance: "short" }))
      .toBe(1_200);
    expect(askPlanMaxDistance(null, {
      travelMode: "walk",
      walkingTolerance: "moderate",
    })).toBe(2_400);
    expect(askPlanMaxDistance("drive", { walkingTolerance: "short" }))
      .toBeUndefined();
    expect(askPlanMaxDistance(null, { walkingTolerance: "short" }))
      .toBeUndefined();
  });
});
