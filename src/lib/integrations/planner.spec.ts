import { describe, expect, it, vi } from "vitest";
import { FREDERICK_CENTER } from "@/lib/geo";
import {
  buildPlan,
  decodeSpec,
  planOpenStateForWindow,
} from "@/lib/integrations/planner";

describe("buildPlan", () => {
  it("keeps an hours-unconfirmed food draft out of daytime errand categories", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 3,
      start_at: "2026-07-16T22:00:00.000Z",
      start_near: FREDERICK_CENTER,
      max_distance_m: 2_400,
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("market");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("coffee");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("bakery");
  });

  it("applies date quality and category floors to a general draft", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "easy",
      duration_hours: 3,
      start_at: "2026-07-23T03:54:00.000Z",
      start_near: FREDERICK_CENTER,
      municipality: "frederick",
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(
      plan.stops.every(
        (stop) =>
          !["shopping", "market", "park", "coffee", "bakery"].includes(
            stop.place?.category ?? "",
          ),
      ),
    ).toBe(true);
    expect(
      plan.stops.every((stop) => {
        const rating = (stop.place as (typeof stop.place & { google_rating?: number }))?.google_rating;
        return rating == null || rating >= 4;
      }),
    ).toBe(true);
  });

  it("returns no late-night stops when fresh schedules cannot prove them open", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "easy",
      duration_hours: 3,
      // 4:30 AM Eastern: even the genuinely late kitchens in the refreshed
      // provider snapshot are closed. This keeps the fixture about refusing
      // an unsupported open claim instead of depending on stale data.
      start_at: "2026-07-23T08:30:00.000Z",
      start_near: FREDERICK_CENTER,
      municipality: "frederick",
    });

    expect(plan.stops).toEqual([]);
  });

  it("keeps every stop inside a deliberately selected town", () => {
    const plan = buildPlan({
      audience: "family",
      vibe: "easy",
      duration_hours: 3,
      start_at: "2026-07-17T14:00:00.000Z",
      start_near: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      // This test isolates the hard municipality boundary. Hours freshness
      // has its own coverage below and should not make the town fixture empty
      // as verified schedules age.
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(
      plan.stops.every(
        (stop) =>
          stop.place?.municipality === "urbana" ||
          stop.event?.municipality === "urbana",
      ),
    ).toBe(true);
  });

  it("keeps a general draft inside the time budget without a known-closed stop", () => {
    const start = new Date("2026-07-17T22:00:00.000Z");
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 4,
      start_at: start.toISOString(),
      municipality: "frederick",
      require_verified_hours: false,
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(plan.stops.every((stop) => stop.open !== "closed")).toBe(true);
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("shopping");
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("playground");

    const last = plan.stops[plan.stops.length - 1];
    const end = new Date(last.at).getTime() + last.duration_min * 60_000;
    expect(end - start.getTime()).toBeLessThanOrEqual(4 * 60 * 60_000);
  });

  it("keeps an unconfirmed schedule visibly unknown", () => {
    expect(
      planOpenStateForWindow(
        { hours: undefined, hours_verified: false },
        new Date("2026-07-17T22:00:00.000Z"),
        80,
      ),
    ).toBe("unknown");
  });

  it("does not use stale hours for a dated plan", () => {
    // Keep this independent of the rolling production artifact. Advancing the
    // clock well beyond every shipped verification timestamp creates the stale
    // condition the test is meant to exercise even after a fresh data pull.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-07-17T22:00:00.000Z"));
    try {
      const plan = buildPlan({
        audience: "date",
        vibe: "food",
        duration_hours: 4,
        start_at: "2035-07-17T22:00:00.000Z",
        municipality: "frederick",
        require_verified_hours: true,
      });

      expect(plan.stops).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes the start time but removes exact coordinates from share links", () => {
    const plan = buildPlan({
      audience: "solo",
      vibe: "easy",
      duration_hours: 2,
      start_near: { lng: -77.412345, lat: 39.412345 },
    });
    const shared = decodeSpec(plan.share);

    expect(shared?.i.start_at).toBeTruthy();
    expect(shared?.i.start_near).toBeUndefined();
  });

  it("rejects malformed shared plans instead of passing them to reconstruction", () => {
    const token = Buffer.from(JSON.stringify({ v: 1, s: [{ p: "missing-inputs" }] }))
      .toString("base64url");
    expect(decodeSpec(token)).toBeNull();
  });
});
