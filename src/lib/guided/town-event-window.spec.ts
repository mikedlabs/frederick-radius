import { describe, expect, it } from "vitest";
import { buildHorizonBounds, horizonOf } from "@/lib/eventHorizon";
import {
  isInNextSevenDayTownWindow,
  townEventWindowLabel,
} from "./town-event-window";

const NOW = new Date("2026-08-03T16:00:00.000Z"); // Monday noon ET

function event(startsAt: string, endsAt?: string) {
  return {
    slug: "town-event",
    starts_at: startsAt,
    ends_at: endsAt ?? new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
  };
}

describe("town event rolling window", () => {
  it("includes an event next Monday even though Events correctly files it under Coming up", () => {
    const nextMonday = event("2026-08-10T13:00:00.000Z");

    expect(isInNextSevenDayTownWindow(nextMonday, NOW)).toBe(true);
    expect(horizonOf(nextMonday, buildHorizonBounds(NOW))).toBe("later");
  });

  it("includes a still-running event and excludes a start beyond seven days", () => {
    expect(
      isInNextSevenDayTownWindow(
        event("2026-08-03T15:00:00.000Z", "2026-08-03T17:00:00.000Z"),
        NOW,
      ),
    ).toBe(true);
    expect(
      isInNextSevenDayTownWindow(event("2026-08-10T17:00:01.000Z"), NOW),
    ).toBe(false);
  });

  it("labels the period and the fact that the count covers listed events", () => {
    expect(townEventWindowLabel(148)).toBe("Next 7 days · 148 events listed");
    expect(townEventWindowLabel(1)).toBe("Next 7 days · 1 event listed");
    expect(townEventWindowLabel(0)).toBe("Next 7 days · No events listed");
  });
});
