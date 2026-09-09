import { describe, it, expect } from "vitest";
import { eventReasons } from "./event-reasons";
import type { EventWithMeta } from "@/lib/loaders/events";

function mkEvent(over: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "e",
    title: "Event",
    starts_at: "2026-07-07T23:00:00.000Z",
    ends_at: "2026-07-08T01:00:00.000Z",
    venue_name: "Baker Park",
    municipality: "frederick",
    category: "music",
    geom: { lng: -77.41, lat: 39.41 },
    ...over,
  } as unknown as EventWithMeta;
}

describe("eventReasons time chips", () => {
  it("says 'Today', not 'Tonight', for a morning start within the 6h window", () => {
    // 10:00 AM ET start, seen at 7:00 AM ET — 3h away (inside the 6h
    // window, outside the 90m 'starting soon' band). Morning is not
    // tonight.
    const chip = eventReasons(
      mkEvent({
        starts_at: "2026-07-07T14:00:00.000Z", // 10:00 AM EDT
        ends_at: "2026-07-07T16:00:00.000Z",
      }),
      new Date("2026-07-07T11:00:00.000Z"), // 7:00 AM EDT
    )[0];
    expect(chip.kind).toBe("tonight");
    expect(chip.label).toBe("Today");
  });

  it("keeps 'Tonight' for an evening start within the 6h window", () => {
    // 7:00 PM ET start, seen at 2:00 PM ET — 5h away.
    const chip = eventReasons(
      mkEvent({
        starts_at: "2026-07-07T23:00:00.000Z", // 7:00 PM EDT
        ends_at: "2026-07-08T01:00:00.000Z",
      }),
      new Date("2026-07-07T18:00:00.000Z"), // 2:00 PM EDT
    )[0];
    expect(chip.kind).toBe("tonight");
    expect(chip.label).toBe("Tonight");
  });

  it("still says 'Starting soon' inside the 90m band", () => {
    const chip = eventReasons(
      mkEvent({ starts_at: "2026-07-07T23:00:00.000Z" }),
      new Date("2026-07-07T22:00:00.000Z"),
    )[0];
    expect(chip.kind).toBe("starting_soon");
  });
});


describe("eventReasons geographic claims", () => {
  it("does not promote cancelled or date-only events as starting soon", () => {
    const now = new Date("2026-07-07T22:00:00Z");
    for (const override of [{ status: "cancelled" as const }, { status: "postponed" as const }, { is_all_day: true }]) {
      const chips = eventReasons(mkEvent(override), now);
      expect(chips.some((chip) => ["starting_soon", "live_now", "tonight"].includes(chip.kind))).toBe(false);
    }
  });
  it("shows distance without manufacturing walking time or accessibility", () => {
    const chips = eventReasons(mkEvent({ distance_m: 200, geo_confidence: "exact_address" }), new Date("2026-07-09T12:00:00Z"));
    expect(chips).toContainEqual(expect.objectContaining({ kind: "near", label: "0.1 mi away" }));
    expect(JSON.stringify(chips)).not.toMatch(/min walk|Walkable/);
  });
  it("rejects distance on centroid and online-only records", () => {
    for (const overrides of [{ geo_confidence: "area" as const }, { attendance_mode: "online" as const }, { distance_m: NaN }]) {
      const chips = eventReasons(mkEvent({ distance_m: 200, ...overrides }), new Date("2026-07-09T12:00:00Z"));
      expect(chips.some((chip) => chip.kind === "near" || chip.kind === "walkable")).toBe(false);
    }
  });
});
