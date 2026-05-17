import { describe, it, expect } from "vitest";
import {
  buildPlan,
  reconstructPlan,
  encodeSpec,
  decodeSpec,
  swapStopInSpec,
  type PlanInputs,
  type PlanSpec,
} from "@/lib/integrations/planner";
import { publicPlaceBySlug } from "@/lib/loaders/places";

// Fixed start time and origin make buildPlan deterministic, so these
// assertions do not flake with the wall clock.
const INPUT: PlanInputs = {
  audience: "date",
  vibe: "food",
  duration_hours: 3,
  start_at: "2026-05-17T22:00:00.000Z", // an evening in America/New_York
  start_near: { lng: -77.4105, lat: 39.4143 },
};

describe("plan spec encode/decode", () => {
  it("round trips a spec, URL safe", () => {
    const spec: PlanSpec = { v: 1, i: INPUT, s: [{ p: "a-place" }, { e: "an-event" }] };
    const token = encodeSpec(spec);
    expect(token).not.toMatch(/[+/=]/); // URL safe
    expect(decodeSpec(token)).toEqual(spec);
  });

  it("returns null for a junk token", () => {
    expect(decodeSpec("not-a-real-token")).toBeNull();
  });
});

describe("buildPlan", () => {
  const plan = buildPlan(INPUT);

  it("produces grounded stops, never invented places", () => {
    expect(plan.stops.length).toBeGreaterThan(0);
    for (const s of plan.stops) {
      if (s.place) expect(publicPlaceBySlug(s.place.slug)).toBeTruthy();
      expect(s.place || s.event).toBeTruthy();
      expect(["open", "likely", "unknown", "closed"]).toContain(s.open);
    }
  });

  it("schedules stops on a monotonic clock", () => {
    for (let i = 1; i < plan.stops.length; i++) {
      expect(+new Date(plan.stops[i].at)).toBeGreaterThanOrEqual(+new Date(plan.stops[i - 1].at));
    }
  });

  it("does not repeat a place category (diversity)", () => {
    const cats = plan.stops.filter((s) => s.place).map((s) => s.place!.category);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("carries a share token that rebuilds the same plan", () => {
    const spec = decodeSpec(plan.share);
    expect(spec).not.toBeNull();
    const rebuilt = reconstructPlan(spec!);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.stops.map((s) => s.place?.slug ?? s.event?.slug)).toEqual(
      plan.stops.map((s) => s.place?.slug ?? s.event?.slug),
    );
  });
});

describe("swapStopInSpec", () => {
  it("replaces the place at an index with a different unused one", () => {
    const spec = decodeSpec(buildPlan(INPUT).share)!;
    const placeIdx = spec.s.findIndex((r) => "p" in r);
    expect(placeIdx).toBeGreaterThanOrEqual(0);
    const before = spec.s[placeIdx];
    const next = swapStopInSpec(spec, placeIdx);
    expect(next.s.length).toBe(spec.s.length);
    expect(next.s[placeIdx]).not.toEqual(before);
    // Still grounded after the swap.
    const ref = next.s[placeIdx];
    if ("p" in ref) expect(publicPlaceBySlug(ref.p)).toBeTruthy();
  });

  it("leaves an event stop untouched", () => {
    const spec: PlanSpec = { v: 1, i: INPUT, s: [{ e: "some-event" }] };
    expect(swapStopInSpec(spec, 0)).toEqual(spec);
  });
});
