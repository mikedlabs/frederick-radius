import { describe, expect, it } from "vitest";
import {
  eventOccursOnDate,
  parseAskAvailabilityConstraint,
  parseAskDateTime,
  stripAskAvailabilityLanguage,
} from "./time";

const now = new Date("2026-07-18T18:00:00.000Z"); // Saturday, 2 PM Eastern

describe("parseAskDateTime", () => {
  it("parses tomorrow and a conversational dinner time", () => {
    const parsed = parseAskDateTime("Dinner tomorrow at 7:30", now);
    expect(parsed).toMatchObject({
      dateKey: "2026-07-19",
      timeLabel: "7:30 PM",
      hour: 19,
      minute: 30,
      explicitDate: true,
      explicitTime: true,
    });
    expect(parsed.instant?.toISOString()).toBe("2026-07-19T23:30:00.000Z");
  });

  it("parses weekdays and common evening shorthand", () => {
    expect(parseAskDateTime("Plan a date night Monday at 7", now)).toMatchObject({
      dateKey: "2026-07-20",
      timeLabel: "7:00 PM",
    });
  });

  it("parses explicit ISO, slash, and named dates", () => {
    expect(parseAskDateTime("events on 2026-07-24", now).dateKey).toBe("2026-07-24");
    expect(parseAskDateTime("events 7/25", now).dateKey).toBe("2026-07-25");
    expect(parseAskDateTime("events July 26", now).dateKey).toBe("2026-07-26");
  });

  it("moves an undated elapsed clock time to the next day", () => {
    const late = new Date("2026-07-19T02:00:00.000Z"); // Saturday, 10 PM Eastern
    expect(parseAskDateTime("reserve dinner at 7:30 PM", late).dateKey).toBe("2026-07-19");
  });

  it("parses an after-time availability boundary", () => {
    expect(parseAskDateTime("ice cream after 8pm tonight", now)).toMatchObject({
      dateKey: "2026-07-18",
      timeLabel: "8:00 PM",
      hour: 20,
      minute: 0,
      explicitDate: true,
      explicitTime: true,
    });
  });

  it("treats past midnight tonight as the next Eastern calendar day", () => {
    const parsed = parseAskDateTime("what is open past midnight tonight", now);
    expect(parsed).toMatchObject({
      dateKey: "2026-07-19",
      timeLabel: "12:00 AM",
      hour: 0,
      minute: 0,
      explicitDate: true,
      explicitTime: true,
    });
    expect(parsed.instant?.toISOString()).toBe("2026-07-19T04:00:00.000Z");
  });

  it("treats numeric early-morning clocks tonight as the upcoming overnight", () => {
    expect(parseAskDateTime("open after 12am tonight", now)).toMatchObject({
      dateKey: "2026-07-19",
      timeLabel: "12:00 AM",
      invalidLocalTime: false,
    });
    expect(parseAskDateTime("open after 1am tonight", now)).toMatchObject({
      dateKey: "2026-07-19",
      timeLabel: "1:00 AM",
      invalidLocalTime: false,
    });
  });

  it("rejects a nonexistent Frederick wall time during the spring DST gap", () => {
    const parsed = parseAskDateTime(
      "open after 2:30am March 8 2026",
      new Date("2026-03-01T17:00:00.000Z"),
    );
    expect(parsed).toMatchObject({
      dateKey: "2026-03-08",
      timeLabel: "2:30 AM",
      explicitTime: true,
      invalidLocalTime: true,
      instant: null,
    });
  });

  it("separates the place need from date, time, and location filler", () => {
    expect(stripAskAvailabilityLanguage("what is open past midnight tomorrow")).toBe("");
    expect(stripAskAvailabilityLanguage("what is open after 10pm Friday downtown Frederick")).toBe("");
    expect(stripAskAvailabilityLanguage("what is open after 10pm in Brunswick")).toBe("");
    expect(stripAskAvailabilityLanguage("ice cream after 8pm tonight near me")).toBe("ice cream");
  });
});

describe("eventOccursOnDate", () => {
  it("includes events and multi-day listings on the requested date", () => {
    expect(eventOccursOnDate({
      starts_at: "2026-07-20T22:00:00.000Z",
      ends_at: "2026-07-21T01:00:00.000Z",
    }, "2026-07-20")).toBe(true);
    expect(eventOccursOnDate({
      starts_at: "2026-07-18T14:00:00.000Z",
      ends_at: "2026-07-25T22:00:00.000Z",
    }, "2026-07-20")).toBe(true);
  });
});

describe("late-night hours are read as night", () => {
  /** The Eastern wall clock an availability constraint actually resolves to. */
  const easternAt = (query: string): string | null => {
    const parsed = parseAskAvailabilityConstraint(query, now) as
      | { at?: Date | string }
      | null;
    if (!parsed?.at) return null;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(parsed.at as string));
  };

  // The bug this pins: 8 through 11 fell through every meridiem rule and stayed
  // AM, so the single most characteristic question a live local guide gets was
  // answered against the wrong half of the day. "Bars open past 10" resolved to
  // 10:01 AM and returned nearly the whole county as open.
  it("reads a lateness question as evening", () => {
    expect(easternAt("bars open past 10")).toBe("10:01 PM");
    expect(easternAt("open past 9")).toBe("9:01 PM");
    expect(easternAt("open late past 11")).toBe("11:01 PM");
    expect(easternAt("still serving at 10")).toBe("10:00 PM");
  });

  it("still reads a morning question as morning", () => {
    // The fix must not swing the other way: these are the hours where a
    // morning reading is the correct one, and they are decided by the noun
    // rather than the clock.
    expect(easternAt("coffee after 8")).toBe("8:01 AM");
    expect(easternAt("brunch past 11")).toBe("11:01 AM");
    expect(easternAt("bakery open at 9")).toBe("9:00 AM");
  });

  it("keeps the readings that already worked", () => {
    expect(easternAt("bars open past 10pm")).toBe("10:01 PM"); // explicit wins
    expect(easternAt("open past 7")).toBe("7:01 PM"); // 1 through 7 rule
    expect(easternAt("dinner past 10")).toBe("10:01 PM"); // keyword rule
    expect(easternAt("what is open past midnight")).toBe("12:01 AM");
  });
});
