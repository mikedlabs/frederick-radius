import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";
import type { Event } from "@/data/events";
import type { Plan, PlanSpec, PlanStop } from "@/lib/integrations/planner";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaces: () => [], clientPlaceBySlug: () => undefined }));
import { buildPlanVisitCheck } from "./visit-check";
const now = new Date("2026-10-12T12:00:00-04:00");
const starts = "2026-10-12T13:00:00-04:00";
const place = (extra: Partial<Place> = {}): Place => ({ slug: "lunch", name: "Local lunch", category: "restaurant", short_blurb: "A local restaurant.", address: "24 W Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick", geom: { lng: -77.4126, lat: 39.4142 }, source: "manual", is_verified: true, feature_score: 5, updated_at: now.toISOString(), hours_verified: true, hours_updated_at: now.toISOString(), is_operational: "operational", hours: { mon: [{ open: "10:00", close: "22:00" }] }, ...extra });
const spec = (extra: Partial<PlanSpec> = {}): PlanSpec => ({ v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 2, start_at: starts, municipality: "frederick" }, s: [{ p: "lunch" }], ...extra });
const stop = (p = place(), extra: Partial<PlanStop> = {}): PlanStop => ({ order: 1, spec_index: 0, at: starts, duration_min: 80, why: "A local lunch.", open: "open", place: p, ...extra });
const plan = (stops = [stop()], extra: Partial<Plan> = {}): Plan => ({ title: "A local outing", summary: "A saved outing.", stops, share: "original-token", ...extra });
const period = (hour: number, extra: Partial<NwsHourly> = {}): NwsHourly => ({ startTime: `2026-10-12T${String(hour).padStart(2, "0")}:00:00-04:00`, endTime: `2026-10-12T${String(hour + 1).padStart(2, "0")}:00:00-04:00`, temperature: 68, temperatureUnit: "F", shortForecast: "Mostly Sunny", windSpeed: "5 mph", windDirection: "NW", icon: "https://api.weather.gov/icons/land/day/few", ...extra });
const forecast = (extra: Partial<NwsForecast> = {}): NwsForecast => ({ asOf: "2026-10-12T11:00:00-04:00", hourlyAsOf: "2026-10-12T11:00:00-04:00", hourly: [period(13), period(14)], daily: [], ...extra });
const check = (p = plan(), f: NwsForecast | null = forecast(), s = spec()) => buildPlanVisitCheck(s, p, f, { now });
const event = (extra: Partial<Event> = {}): Event => ({ slug: "concert", title: "Local concert", description: "A local concert.", starts_at: starts, ends_at: "2026-10-12T14:20:00-04:00", timezone: "America/New_York", venue_name: "Weinberg Center", address: "20 W Patrick Street", geom: place().geom, municipality: "frederick", category: "music", audience: ["adults"], is_free: false, source: "manual", is_verified: true, last_verified_at: "2026-10-12T10:00:00-04:00", source_url: "https://example.org/concert", ...extra });

describe("honest pre-trip briefing", () => {
  it("separates the check clock from the hours and forecast clocks, and qualifies saved evidence", () => {
    const result = check(plan([stop(place({ hours_updated_at: "2026-10-11T14:00:00-04:00" }))]));
    expect(result.status).toBe("available");
    expect(result.checkedAt).toBe(now.toISOString());
    expect(result.stops[0].sourceAsOf).toBe("2026-10-11T18:00:00.000Z");
    expect(result.weather.sourceAsOf).toBe("2026-10-12T15:00:00.000Z");
    expect(result.stops[0].message).toContain("has not checked the venue live");
    expect(result.message).toContain("Confirm directly");
    expect(result.validUntil).toBe("2026-10-12T16:15:00.000Z");
  });
  it.each([
    { hours: undefined }, { hours_verified: false }, { hours_updated_at: undefined },
    { hours_updated_at: "2026-10-01T12:00:00-04:00" }, { hours_updated_at: "2026-10-13T12:00:00-04:00" },
  ])("never treats unknown or stale hours as a successful check: %s", (extra) => {
    const result = check(plan([stop(place(extra))]));
    expect(result.stops[0].status).toBe("unavailable"); expect(result.status).toBe("partial");
    expect(result.stops[0].message).toContain("Unable to verify");
  });
  it("expires hours against the actual future visit, not only the check clock", () => {
    const at = "2026-10-19T13:00:00-04:00";
    const result = check(plan([stop(place(), { at })]), null, spec({ i: { ...spec().i, start_at: at } }));
    expect(result.stops[0].status).toBe("unavailable"); expect(result.weather.coverage).toBe("outside");
  });
  it("does not use records that expire during the stop", () => {
    const p = place({ hours_updated_at: "2026-10-05T14:00:00-04:00" });
    const result = check(plan([stop(p)]));
    expect(result.stops[0].status).toBe("unavailable");
  });
  it("keeps every original slot including an unscheduled place and unavailable event", () => {
    const original = spec({ s: [{ e: "missing" }, { p: "lunch" }] });
    const result = check(plan([], { unscheduled: [{ place: place(), spec_index: 1, why: "Hours need confirmation." }], notices: [{ spec_index: 0, code: "unavailable", message: "Unable to verify the event. Your reference is retained." }] }), null, original);
    expect(result.stops.map((item) => [item.spec_index, item.status])).toEqual([[0, "unavailable"], [1, "unavailable"]]);
    expect(result.stops[1].message).toContain("Hours need confirmation.");
    expect(result.status).toBe("unavailable");
  });
  it("shows a cancellation as changed without declaring the rest of the plan clear", () => {
    const result = check(plan([], { notices: [{ spec_index: 0, code: "cancelled", message: "The organizer has cancelled this event.", event_href: "/events/concert" }] }), null, spec({ s: [{ e: "concert" }] }));
    expect(result.stops[0].status).toBe("changed"); expect(result.status).toBe("partial");
    expect(result.stops[0].sourceAsOf).toBeUndefined(); expect(result.stops[0].name).toBeUndefined();
  });
  it("shows a rescheduled event anchor and its publisher verification clock", () => {
    const current = event({ starts_at: "2026-10-12T13:30:00-04:00", ends_at: "2026-10-12T14:30:00-04:00" });
    const result = check(plan([stop(undefined, { place: undefined, event: current, at: current.starts_at, duration_min: 60 })]), forecast(), spec({ i: { ...spec().i, event_anchor_slug: "concert" }, s: [{ e: "concert" }] }));
    expect(result.stops[0].status).toBe("changed"); expect(result.stops[0].message).toContain("different start time");
    expect(result.stops[0].sourceAsOf).toBe("2026-10-12T14:00:00.000Z");
    expect(result.stops[0].sourceHref).toBe(current.source_url);
  });
  it("qualifies an event's saved listing instead of claiming a new organizer check", () => {
    const current = event();
    const result = check(plan([stop(undefined, { place: undefined, event: current })]), forecast(), spec({ s: [{ e: "concert" }] }));
    expect(result.stops[0].status).toBe("available");
    expect(result.stops[0].message).toContain("does not contact the organizer live");
  });
  it("does not claim weather coverage from a gap between periods", () => {
    const result = check(plan([stop(undefined, { duration_min: 180 })]), forecast({ hourly: [period(13), period(15)] }));
    expect(result.weather.coverage).toBe("partial"); expect(result.status).toBe("partial");
  });
  it("does not silently use day/night periods beyond hourly coverage", () => {
    const at = "2026-10-13T13:00:00-04:00";
    const result = check(plan([stop(undefined, { at })]), forecast({ daily: [period(13, { startTime: at, endTime: "2026-10-13T19:00:00-04:00" })] }));
    expect(result.weather.status).toBe("unavailable"); expect(result.weather.coverage).toBe("outside"); expect(result.weather.periods).toEqual([]);
  });
  it.each([null, { ...forecast(), hourlyAsOf: null }, { ...forecast(), hourlyAsOf: "2026-10-12T08:00:00-04:00" }, { ...forecast(), hourlyAsOf: "2026-10-13T12:00:00-04:00" }])("never invents current weather from unavailable or stale evidence", (fc) => {
    const result = check(plan(), fc); expect(result.weather.status).toBe("unavailable"); expect(result.status).toBe("partial");
  });
  it("never treats a fresh daily timestamp as proof that hourly values are current", () => {
    const result = check(plan(), forecast({ asOf: now.toISOString(), hourlyAsOf: "2026-10-12T07:00:00-04:00" }));
    expect(result.weather.status).toBe("unavailable"); expect(result.weather.sourceAsOf).toBe("2026-10-12T11:00:00.000Z");
    expect(result.weather.periods).toEqual([]);
  });
  it("shows passed timing as changed and does not forecast an ended outing", () => {
    const result = check(plan([stop(undefined, { at: "2026-10-11T13:00:00-04:00" })]));
    expect(result.stops[0].status).toBe("changed"); expect(result.weather.coverage).toBe("outside");
  });
  it("does not expose an out-of-town or mislocated place as a checked stop", () => {
    const result = check(plan([stop(place({ municipality: "thurmont", geom: { lng: 0, lat: 0 } }))]));
    expect(result.stops[0].status).toBe("unavailable"); expect(result.stops[0].name).toBeUndefined(); expect(result.weather.periods).toEqual([]);
  });
});
