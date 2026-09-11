import { describe, it, expect } from "vitest";
import { daypart, sectionOrder } from "./daypart";

// Eastern daylight time (UTC-4) instants across the day.
const at = (etHourUtc: string) => new Date(etHourUtc);
const MORNING = at("2026-07-08T13:00:00.000Z"); // 9:00 AM ET
const MIDDAY = at("2026-07-08T17:00:00.000Z"); // 1:00 PM ET
const EVENING = at("2026-07-08T23:00:00.000Z"); // 7:00 PM ET
const LATE_9PM = at("2026-07-09T01:30:00.000Z"); // 9:30 PM ET
const OVERNIGHT = at("2026-07-09T06:00:00.000Z"); // 2:00 AM ET

describe("daypart buckets (Eastern)", () => {
  it("maps each instant to its bucket", () => {
    expect(daypart(MORNING)).toBe("morning");
    expect(daypart(MIDDAY)).toBe("midday");
    expect(daypart(EVENING)).toBe("evening");
    expect(daypart(LATE_9PM)).toBe("late");
    expect(daypart(OVERNIGHT)).toBe("late");
  });

  it("9 PM is the strict boundary into 'late'", () => {
    expect(daypart(at("2026-07-09T00:59:00.000Z"))).toBe("evening"); // 8:59 PM ET
    expect(daypart(at("2026-07-09T01:00:00.000Z"))).toBe("late"); // 9:00 PM ET
  });
});

describe("sectionOrder — daypart-shaped editorial spine", () => {
  it("morning and midday lead with the day-ahead plan (Plan the moment)", () => {
    expect(sectionOrder("morning")).toEqual(["curated", "whatsOn"]);
    expect(sectionOrder("midday")).toEqual(["curated", "whatsOn"]);
  });

  it("evening and late lead with tonight's events", () => {
    expect(sectionOrder("evening")).toEqual(["whatsOn", "curated"]);
    expect(sectionOrder("late")).toEqual(["whatsOn", "curated"]);
  });

  it("always renders both sections (a reorder, not a hide)", () => {
    for (const part of ["morning", "midday", "evening", "late"] as const) {
      const order = sectionOrder(part);
      expect([...order].sort()).toEqual(["curated", "whatsOn"]);
    }
  });
});
