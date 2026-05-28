import { describe, it, expect } from "vitest";
import { eventsNearVisiblePlaces } from "@/components/map/AppMapClient";
import type { EventPin } from "@/components/map/types";

function event(slug: string, lng: number, lat: number): EventPin {
  return {
    slug,
    title: slug,
    starts_at: "2026-05-28T20:00:00Z",
    venue_name: "Test Venue",
    lng,
    lat,
    category: "music",
  } as EventPin;
}

function place(slug: string, lng: number, lat: number) {
  return { geom: { lng, lat }, slug };
}

describe("eventsNearVisiblePlaces", () => {
  // Carroll Creek Amphitheater coordinates as a Frederick-realistic anchor
  const anchor = { lng: -77.4083, lat: 39.4128 };

  it("returns [] when no events", () => {
    expect(eventsNearVisiblePlaces([], [place("a", anchor.lng, anchor.lat)])).toEqual([]);
  });

  it("returns [] when nothing visible (the right answer — can't see, can't go)", () => {
    expect(eventsNearVisiblePlaces([event("e1", anchor.lng, anchor.lat)], [])).toEqual([]);
  });

  it("keeps events within 1.5km of any visible place", () => {
    const events = [
      // ~50m away — same point essentially
      event("close", anchor.lng + 0.0005, anchor.lat),
      // ~10km away — should be dropped
      event("far", anchor.lng + 0.12, anchor.lat),
    ];
    const out = eventsNearVisiblePlaces(events, [place("p1", anchor.lng, anchor.lat)]);
    expect(out.map((e) => e.slug)).toEqual(["close"]);
  });

  it("does not double-add events near multiple visible places", () => {
    const events = [event("e", anchor.lng, anchor.lat)];
    const visible = [
      place("p1", anchor.lng, anchor.lat),
      place("p2", anchor.lng + 0.0001, anchor.lat),
      place("p3", anchor.lng + 0.0002, anchor.lat),
    ];
    const out = eventsNearVisiblePlaces(events, visible);
    // The event matches all three places but should appear once.
    expect(out).toHaveLength(1);
  });

  it("respects a custom maxMeters threshold", () => {
    // Event ~150m east of anchor
    const events = [event("e", anchor.lng + 0.0017, anchor.lat)];
    const visible = [place("p1", anchor.lng, anchor.lat)];
    // 200m allows it
    expect(eventsNearVisiblePlaces(events, visible, 200)).toHaveLength(1);
    // 100m doesn't
    expect(eventsNearVisiblePlaces(events, visible, 100)).toHaveLength(0);
  });

  it("skips events with non-finite coordinates", () => {
    const events = [
      event("e1", anchor.lng, anchor.lat),
      event("bad", NaN, NaN),
    ];
    const visible = [place("p1", anchor.lng, anchor.lat)];
    const out = eventsNearVisiblePlaces(events, visible);
    expect(out.map((e) => e.slug)).toEqual(["e1"]);
  });
});
