import { describe, it, expect } from "vitest";
import {
  rankInView,
  amenitiesNearVisiblePlaces,
} from "@/components/map/AppMapClient";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Amenity } from "@/lib/loaders/amenities";
import type { OpenStatus } from "@/lib/hours";

const OPEN: OpenStatus = { state: "open", closesAt: "9:00 PM", closingSoon: false };
const CLOSED: OpenStatus = { state: "closed" };

/** Minimal PlaceCardData stub — only the fields rankInView reads. */
function place(
  slug: string,
  opts: { open?: boolean; feature_score?: number; distance_m?: number },
): PlaceCardData {
  return {
    slug,
    open_status: opts.open ? OPEN : CLOSED,
    feature_score: opts.feature_score ?? 0,
    distance_m: opts.distance_m ?? 0,
  } as unknown as PlaceCardData;
}

describe("rankInView", () => {
  it("ranks open places above closed ones, however good the closed one is", () => {
    const closedGem = place("gem", { open: false, feature_score: 0.99, distance_m: 10 });
    const openMeh = place("meh", { open: true, feature_score: 0.1, distance_m: 900 });
    expect([closedGem, openMeh].sort(rankInView).map((p) => p.slug)).toEqual([
      "meh",
      "gem",
    ]);
  });

  it("breaks open-vs-open ties by feature_score (quality lead)", () => {
    const a = place("a", { open: true, feature_score: 0.3, distance_m: 100 });
    const b = place("b", { open: true, feature_score: 0.8, distance_m: 800 });
    expect([a, b].sort(rankInView).map((p) => p.slug)).toEqual(["b", "a"]);
  });

  it("breaks remaining ties by distance (nearest wins)", () => {
    const near = place("near", { open: true, feature_score: 0.5, distance_m: 120 });
    const far = place("far", { open: true, feature_score: 0.5, distance_m: 950 });
    expect([far, near].sort(rankInView).map((p) => p.slug)).toEqual(["near", "far"]);
  });

  it("treats 'closing-soon' as open (still useful right now)", () => {
    const closing = {
      ...place("closing", { open: false, feature_score: 0.1, distance_m: 50 }),
      open_status: { state: "closing-soon", closesAt: "9:00 PM" } as OpenStatus,
    } as PlaceCardData;
    const closed = place("closed", { open: false, feature_score: 0.9, distance_m: 50 });
    expect([closed, closing].sort(rankInView).map((p) => p.slug)).toEqual([
      "closing",
      "closed",
    ]);
  });
});

function amenity(id: string, kind: Amenity["kind"], lng: number, lat: number): Amenity {
  return { id, kind, name: id, municipality: "frederick", lng, lat };
}

describe("amenitiesNearVisiblePlaces", () => {
  // Carroll Creek as a realistic Frederick anchor.
  const anchor = { lng: -77.4083, lat: 39.4128 };
  const visible = [{ geom: anchor }];

  it("returns [] with no amenities or nothing visible", () => {
    expect(amenitiesNearVisiblePlaces([], visible)).toEqual([]);
    expect(
      amenitiesNearVisiblePlaces([amenity("a", "restroom", anchor.lng, anchor.lat)], []),
    ).toEqual([]);
  });

  it("keeps amenities within the walk radius and drops far ones", () => {
    const out = amenitiesNearVisiblePlaces(
      [
        amenity("near", "restroom", anchor.lng + 0.0005, anchor.lat), // ~40m
        amenity("far", "ev_charging", anchor.lng + 0.05, anchor.lat), // ~4km
      ],
      visible,
    );
    expect(out.map((a) => a.kind)).toEqual(["restroom"]);
  });

  it("keeps only the nearest amenity per kind (one chip per kind)", () => {
    const out = amenitiesNearVisiblePlaces(
      [
        amenity("r-far", "restroom", anchor.lng + 0.004, anchor.lat), // ~340m
        amenity("r-near", "restroom", anchor.lng + 0.0005, anchor.lat), // ~40m
      ],
      visible,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("r-near");
  });

  it("sorts kinds nearest-first and decorates with distance_m", () => {
    const out = amenitiesNearVisiblePlaces(
      [
        amenity("bike", "bike_parking", anchor.lng + 0.003, anchor.lat), // ~250m
        amenity("loo", "restroom", anchor.lng + 0.0005, anchor.lat), // ~40m
      ],
      visible,
    );
    expect(out.map((a) => a.kind)).toEqual(["restroom", "bike_parking"]);
    expect(out[0].distance_m).toBeLessThan(out[1].distance_m);
    expect(out[0].distance_m).toBeGreaterThan(0);
  });

  it("respects a custom maxMeters threshold", () => {
    const a = [amenity("e", "ev_charging", anchor.lng + 0.0017, anchor.lat)]; // ~150m
    expect(amenitiesNearVisiblePlaces(a, visible, 200)).toHaveLength(1);
    expect(amenitiesNearVisiblePlaces(a, visible, 100)).toHaveLength(0);
  });

  it("skips amenities with non-finite coordinates", () => {
    const out = amenitiesNearVisiblePlaces(
      [
        amenity("ok", "restroom", anchor.lng, anchor.lat),
        amenity("bad", "wifi", NaN, NaN),
      ],
      visible,
    );
    expect(out.map((a) => a.kind)).toEqual(["restroom"]);
  });
});
