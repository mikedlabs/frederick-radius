import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { eventDecisionLocation, eventDecisionTime, eventTimeCaution } from "./decision-facts";
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

  it("only joins nearby MARC station coordinates, without inventing a service or route time", () => {
    expect(eventNearbyStation({ lng: -77.6279, lat: 39.312 })).toMatchObject({ name: "Brunswick" });
    expect(eventNearbyStation({ lng: -77.41, lat: 39.62 })).toBeNull();
    expect(eventNearbyStation({ lng: -77.4052, lat: 39.4117 })).not.toHaveProperty("walkMinutes");
  });
});
