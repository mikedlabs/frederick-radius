import { describe, expect, it } from "vitest";
import {
  eventOccursOnDate,
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
