import { describe, it, expect } from "vitest";
import {
  DAY_START_HOUR,
  daypart,
  daypartOfHour,
  easternHour,
  isTonightDaypart,
  programDaypartLabel,
  sectionOrder,
} from "./daypart";

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

describe("the one daypart clock", () => {
  it("maps every Eastern hour to the same four buckets daypart() uses", () => {
    const expected = (h: number) =>
      h >= 5 && h < 11 ? "morning" : h >= 11 && h < 16 ? "midday" : h >= 16 && h < 21 ? "evening" : "late";
    for (let h = 0; h < 24; h++) expect(daypartOfHour(h)).toBe(expected(h));
    expect(daypartOfHour(24)).toBe(daypartOfHour(0));
    expect(daypartOfHour(-1)).toBe(daypartOfHour(23));
    expect(DAY_START_HOUR).toBe(5);
  });

  it("reads the Eastern hour across daylight and standard time", () => {
    expect(easternHour(new Date("2026-07-09T01:30:00.000Z"))).toBe(21); // EDT
    expect(easternHour(new Date("2026-01-09T02:30:00.000Z"))).toBe(21); // EST
    expect(daypart(new Date("2026-01-09T02:30:00.000Z"))).toBe("late");
  });

  it("labels program rows with the same boundaries as the masthead", () => {
    expect(programDaypartLabel(9)).toBe("This morning");
    expect(programDaypartLabel(11)).toBe("Midday");
    expect(programDaypartLabel(15)).toBe("Midday");
    expect(programDaypartLabel(16)).toBe("Tonight");
    expect(programDaypartLabel(20)).toBe("Tonight");
    expect(programDaypartLabel(22)).toBe("Late tonight");
    expect(programDaypartLabel(1)).toBe("Overnight");
  });

  it("calls only evening and late tonight", () => {
    expect(isTonightDaypart("morning")).toBe(false);
    expect(isTonightDaypart("midday")).toBe(false);
    expect(isTonightDaypart("evening")).toBe(true);
    expect(isTonightDaypart("late")).toBe(true);
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
