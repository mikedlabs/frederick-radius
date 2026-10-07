import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import type { GeoConfidence } from "@/lib/events/geo-confidence";
import { eventPlanEligibility } from "./event-plan-eligibility";

type Candidate = Event & { geo_confidence?: GeoConfidence };
const nowMs = Date.parse("2026-10-06T12:00:00-04:00");
const event = (overrides: Partial<Candidate> = {}): Candidate => ({
  slug: "evening-concert",
  title: "Evening concert",
  description: "A concert at the Weinberg Center.",
  starts_at: "2026-10-06T19:00:00-04:00",
  ends_at: "2026-10-06T22:00:00-04:00",
  timezone: "America/New_York",
  venue_name: "Weinberg Center for the Arts",
  address: "20 W Patrick Street, Frederick, MD",
  geom: { lng: -77.4126, lat: 39.4142 },
  municipality: "frederick",
  category: "arts-entertainment",
  audience: ["adults"],
  is_free: false,
  source: "seed",
  source_url: "https://example.org/concert", last_verified_at: new Date(nowMs).toISOString(),
  is_verified: true,
  placement: "venue",
  geo_confidence: "venue_match",
  ...overrides,
});
const eligibility = (candidate: Candidate) =>
  eventPlanEligibility(candidate, { nowMs });

describe("event plan entry eligibility", () => {
  it("reserves the full scheduled event, including a show longer than 90 minutes", () => {
    expect(eligibility(event())).toEqual({ eligible: true, durationMinutes: 180 });
    expect(eligibility(event({
      starts_at: "2026-10-06T22:00:00-04:00",
      ends_at: "2026-10-07T01:30:00-04:00",
    }))).toEqual({ eligible: true, durationMinutes: 210 });
  });

  it.each([
    ["cancelled", { status: "cancelled" }, "cancelled"],
    ["postponed", { status: "postponed" }, "postponed"],
    ["cancelled title", { title: "Cancelled: Evening concert" }, "non_public"],
    ["private rental", { title: "Private wedding reception" }, "non_public"],
    ["civic meeting", { title: "City Council meeting" }, "non_public"],
    ["online event", { attendance_mode: "online", online_url: "https://example.org/concert" }, "not_physical"],
    ["area pin", { placement: "geocoded", geo_confidence: "area", geom: { lng: -77.4109, lat: 39.4137 } }, "location_unknown"],
    ["unknown pin", { geo_confidence: "unknown" }, "location_unknown"],
    ["review pin", { placement: "needs_review" }, "location_unknown"],
    ["outside county", { geom: { lng: -76.6122, lat: 39.2904 } }, "location_unknown"],
    ["all-day event", { is_all_day: true }, "timing_unknown"],
    ["missing end", { ends_at: "" }, "timing_unknown"],
    ["zero duration", { ends_at: "2026-10-06T19:00:00-04:00" }, "timing_unknown"],
    ["invalid start", { starts_at: "unknown" }, "timing_unknown"],
    ["invalid end", { ends_at: "unknown" }, "timing_unknown"],
    ["date-only sentinel", { starts_at: "2026-10-07T12:00:00-04:00", ends_at: "2026-10-07T23:59:00-04:00" }, "timing_unknown"],
    ["stale source", { last_verified_at: "2026-10-01T12:00:00-04:00" }, "source_unconfirmed"],
    ["unknown source check", { last_verified_at: undefined }, "source_unconfirmed"],
    ["missing source link", { source_url: undefined }, "source_unconfirmed"],
    ["long single event", { ends_at: "2026-10-07T02:00:00-04:00" }, "duration_too_long"],
    ["date-range listing", { ends_at: "2026-10-09T22:00:00-04:00" }, "timing_unknown"],
    ["already started", { starts_at: "2026-10-06T11:00:00-04:00" }, "already_started"],
    ["starts now", { starts_at: "2026-10-06T12:00:00-04:00" }, "already_started"],
  ] as Array<[string, Partial<Candidate>, string]>)(
    "does not offer a timed plan for %s",
    (_label, overrides, reason) => {
      expect(eligibility(event(overrides))).toEqual({ eligible: false, reason });
    },
  );

  it("keeps the physical option for a hybrid event with a precise venue", () => {
    expect(eligibility(event({ attendance_mode: "mixed" }))).toEqual({ eligible: true, durationMinutes: 180 });
  });

  it.each(["closed_permanently", "closed_temporarily"] as const)("withholds the entry for a %s resolved venue", (venueOperational) => {
    expect(eventPlanEligibility(event(), { nowMs, hasResolvedVenue: true, venueOperational })).toEqual({ eligible: false, reason: "venue_closed" });
    expect(eventPlanEligibility(event(), { nowMs, hasResolvedVenue: true, venueOperational: "operational" })).toEqual({ eligible: true, durationMinutes: 180 });
  });

  it("requires a valid request clock", () => {
    expect(eventPlanEligibility(event(), { nowMs: NaN })).toEqual({ eligible: false, reason: "timing_unknown" });
  });
});
