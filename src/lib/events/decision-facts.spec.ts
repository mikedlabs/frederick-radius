import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { eventDecisionLocation, eventDecisionTime, eventRowDate, eventRowTime, eventTimeCaution } from "./decision-facts";
import { eventNearbyStation } from "./travel";

const event = (overrides: Partial<Event> = {}): Event => ({
  title: "Evening concert", starts_at: "2026-09-10T18:00:00-04:00", ends_at: "2026-09-10T20:00:00-04:00",
  venue_name: "Memorial Park", ...overrides,
}) as Event;

describe("event decision facts", () => {
  it("names the town without assuming a locally familiar venue identifies it", () => {
    expect(eventDecisionLocation({ ...event(), municipality_name: "Thurmont" })).toBe("Memorial Park · Thurmont");
    expect(eventDecisionLocation({ ...event({ venue_name: "Thurmont" }), municipality_name: "Thurmont" })).toBe("Thurmont");
    expect(eventDecisionLocation({ ...event({ venue_name: "" }), municipality_name: "Brunswick" })).toBe("Brunswick");
    expect(eventDecisionLocation({ ...event({ attendance_mode: "online" }), municipality_name: "Frederick" })).toBe("Online");
  });

  it("shows reliable end times across an Eastern midnight", () => {
    expect(eventDecisionTime(event())).toBe("6:00 PM–8:00 PM");
    expect(eventDecisionTime(event({ starts_at: "2026-09-10T22:00:00-04:00", ends_at: "2026-09-11T01:00:00-04:00" }))).toBe("10:00 PM–Fri 1:00 AM");
    expect(eventDecisionTime(event({ starts_at: "2026-10-03T10:00:00-04:00", ends_at: "2026-10-04T17:00:00-04:00" }))).toBe("through Oct 4 · check daily hours");
  });

  it("preserves missing end and date-only uncertainty before and after start", () => {
    const missingEnd = event({ ends_at: "2026-09-10T18:00:00-04:00" });
    expect(eventDecisionTime(missingEnd)).toContain("end time not listed");
    expect(eventDecisionTime(missingEnd, new Date("2026-09-10T19:00:00-04:00"))).toContain("end time unavailable");
    const dateOnly = event({ starts_at: "2026-09-10T12:00:00-04:00", ends_at: "2026-09-10T23:59:00-04:00" });
    expect(eventDecisionTime(dateOnly)).toBe("Time not listed");
    expect(eventTimeCaution(dateOnly)).toContain("not listed a start time");
    expect(eventTimeCaution(event({ is_all_day: true }))).toContain("daily opening or admission hours");
  });

  it("gives a row its start time without the end-time caution the sheet carries", () => {
    expect(eventRowTime(event())).toBe("6:00 PM");
    const missingEnd = event({ ends_at: "2026-09-10T18:00:00-04:00" });
    expect(eventRowTime(missingEnd)).toBe("6:00 PM");
    expect(eventRowTime(missingEnd)).not.toContain("end time");
    // The caution still exists; it moved to the sheet and the detail page.
    expect(eventTimeCaution(missingEnd)).toBe("The publisher has not listed an end time.");
  });

  it("says when an unknown-end event started instead of a clock already past", () => {
    const missingEnd = event({ ends_at: "2026-09-10T18:00:00-04:00" });
    // Once it has begun, whether it is still going is the decision, so the
    // row keeps that one caution.
    expect(eventRowTime(missingEnd, new Date("2026-09-10T19:00:00-04:00"))).toBe(
      "Started at 6:00 PM · end time unavailable",
    );
    expect(eventRowTime(missingEnd, new Date("2026-09-10T17:00:00-04:00"))).toBe("6:00 PM");
    // A known end needs no disclosure: the row prints its start time.
    expect(eventRowTime(event(), new Date("2026-09-10T19:00:00-04:00"))).toBe("6:00 PM");
    // A cancelled listing never reads as started.
    expect(eventRowTime({ ...missingEnd, status: "cancelled" }, new Date("2026-09-10T19:00:00-04:00"))).toBe("6:00 PM");
  });

  it("keeps all-day, date-only and multi-day rows honest without daily-hours copy", () => {
    expect(eventRowTime(event({ is_all_day: true }))).toBe("All day");
    const dateOnly = event({ starts_at: "2026-09-10T12:00:00-04:00", ends_at: "2026-09-10T23:59:00-04:00" });
    expect(eventRowTime(dateOnly)).toBe("Time not listed");
    const weekend = event({ starts_at: "2026-10-10T09:00:00-04:00", ends_at: "2026-10-11T17:00:00-04:00" });
    expect(eventRowTime(weekend)).toBe("9:00 AM through Oct 11");
    expect(eventRowTime(weekend)).not.toContain("check daily hours");
    expect(eventTimeCaution(weekend)).toContain("spans several days");
  });

  it("names a row's start day in words on the Eastern calendar", () => {
    expect(eventRowDate(event())).toBe("Thu, Sep 10");
    // 10 PM Eastern is already the next day in UTC; the row keeps the local day.
    expect(eventRowDate(event({ starts_at: "2026-10-08T22:30:00-04:00" }))).toBe("Thu, Oct 8");
  });

  it("only joins nearby MARC station coordinates, without inventing a service or route time", () => {
    expect(eventNearbyStation({ lng: -77.6279, lat: 39.312 })).toMatchObject({ name: "Brunswick" });
    expect(eventNearbyStation({ lng: -77.41, lat: 39.62 })).toBeNull();
    expect(eventNearbyStation({ lng: -77.4052, lat: 39.4117 })).not.toHaveProperty("walkMinutes");
  });
});
