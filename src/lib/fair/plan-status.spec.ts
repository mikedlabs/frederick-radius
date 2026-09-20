import { describe, expect, it } from "vitest";

import { createFairPlan, type FairPlan } from "@/lib/fair/plan";

import { buildFairPlanStatus } from "./plan-status";

const REVISION = `sha256:${"a".repeat(64)}`;

function plan(overrides: Partial<FairPlan> = {}): FairPlan {
  return {
    ...createFairPlan({
      fairId: "great-frederick-fair-2026",
      packRevision: REVISION,
      selectedDayId: "day-2026-09-18",
      now: "2026-09-02T12:00:00Z",
    }),
    ...overrides,
  };
}

describe("buildFairPlanStatus", () => {
  it("counts only this day's vendor stops and includes removed vendors in review state", () => {
    const status = buildFairPlanStatus(plan({ arrivalChoice: "walk", readyKeys: ["ticket", "travel", "entry"], vendorStops: [
      { vendorId: "vendor-current", dayId: "day-2026-09-18", labelSnapshot: "Current vendor", sourceState: "current" },
      { vendorId: "vendor-removed", dayId: "day-2026-09-18", labelSnapshot: "Removed vendor", sourceState: "changed-or-removed" },
      { vendorId: "vendor-tomorrow", dayId: "day-2026-09-19", labelSnapshot: "Tomorrow vendor", sourceState: "current" },
    ] }));
    expect(status.savedStopCount).toBe(2);
    expect(status.needsReviewStopCount).toBe(1);
    expect(status.nextAction).toBe("my-day");
    expect(status.savedStopsLabel).toBe("2 saved stops");
  });

  it("starts with tickets and reports the selected day truthfully", () => {
    const status = buildFairPlanStatus(plan());

    expect(status.nextAction).toBe("tickets");
    expect(status.nextActionLabel).toBe("Review tickets");
    expect(status.nextActionHref).toBe(
      "/moments/great-frederick-fair-2026#fair-ready-ticket",
    );
    expect(status.readinessLabel).toBe("0 of 3 ready");
    expect(status.savedStopsLabel).toBe("No saved stops");
    expect(status.summarySentence).toContain("Friday, September 18");
  });

  it("does not treat legacy arrival and return flags as a checked trip", () => {
    const status = buildFairPlanStatus(
      plan({
        arrivalChoice: "drive",
        readyKeys: ["ticket", "arrival", "return"],
      }),
    );

    expect(status.handledPreparationCount).toBe(1);
    expect(status.nextAction).toBe("travel");
    expect(status.nextActionLabel).toBe("Finish travel plan");
    expect(status.stateLabel).toContain("selected but not marked ready");
  });

  it("moves to My Day after preparation and a same-day stop are ready", () => {
    const status = buildFairPlanStatus(
      plan({
        arrivalChoice: "transit",
        readyKeys: ["ticket", "travel", "entry"],
        steps: [
          {
            scheduleItemId: "schedule-2026-09-18-horse-pull",
            dayId: "day-2026-09-18",
            labelSnapshot: "Horse pull",
            timeLabelSnapshot: "7:00 PM",
            sourceState: "current",
          },
        ],
      }),
    );

    expect(status.savedStopCount).toBe(1);
    expect(status.handledPreparationCount).toBe(3);
    expect(status.nextAction).toBe("my-day");
    expect(status.nextActionHref).toBe(
      "/moments/great-frederick-fair-2026#my-day",
    );
  });

  it("does not let a changed or removed stop satisfy the current-stop requirement", () => {
    const status = buildFairPlanStatus(
      plan({
        arrivalChoice: "drive",
        readyKeys: ["ticket", "travel", "entry"],
        steps: [
          {
            scheduleItemId: "schedule-2026-09-18-removed-show",
            dayId: "day-2026-09-18",
            labelSnapshot: "Removed show",
            timeLabelSnapshot: "7:00 PM",
            sourceState: "changed-or-removed",
          },
        ],
      }),
    );

    expect(status.savedStopCount).toBe(1);
    expect(status.needsReviewStopCount).toBe(1);
    expect(status.nextAction).toBe("find");
    expect(status.stateLabel).toBe(
      "1 saved stop needs review. Add a current Fair stop.",
    );
  });

  it("keeps a mixed plan from claiming every saved stop is ready", () => {
    const status = buildFairPlanStatus(
      plan({
        arrivalChoice: "drive",
        readyKeys: ["ticket", "travel", "entry"],
        steps: [
          {
            scheduleItemId: "schedule-2026-09-18-current-show",
            dayId: "day-2026-09-18",
            labelSnapshot: "Current show",
            timeLabelSnapshot: "6:00 PM",
            sourceState: "current",
          },
          {
            scheduleItemId: "schedule-2026-09-18-removed-show",
            dayId: "day-2026-09-18",
            labelSnapshot: "Removed show",
            timeLabelSnapshot: "7:00 PM",
            sourceState: "changed-or-removed",
          },
        ],
      }),
    );

    expect(status.savedStopCount).toBe(2);
    expect(status.needsReviewStopCount).toBe(1);
    expect(status.nextAction).toBe("my-day");
    expect(status.stateLabel).toBe(
      "1 saved stop needs review before relying on this plan.",
    );
  });

  it("counts only stops on the Fair day currently being planned", () => {
    const status = buildFairPlanStatus(
      plan({
        arrivalChoice: "drive",
        readyKeys: ["ticket", "travel", "entry"],
        steps: [
          {
            scheduleItemId: "schedule-2026-09-19-dairy-show",
            dayId: "day-2026-09-19",
            labelSnapshot: "Dairy show",
            timeLabelSnapshot: "9:00 AM",
            sourceState: "current",
          },
        ],
      }),
    );

    expect(status.savedStopCount).toBe(0);
    expect(status.nextAction).toBe("find");
  });

  it("summarizes party ages without adding another planning step", () => {
    const status = buildFairPlanStatus(
      plan({
        party: {
          adults11Plus: 2,
          children10Under: 3,
          adultRiders: 1,
          childRiders: 2,
        },
      }),
    );

    expect(status.partySize).toBe(5);
    expect(status.partyLabel).toBe(
      "2 guests age 11+ · 3 guests age 10 or under",
    );
    expect(status.summarySentence).toContain("for 5 people");
  });
});
