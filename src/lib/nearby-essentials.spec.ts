import { describe, expect, it } from "vitest";
import type { Amenity } from "@/lib/loaders/amenities";
import {
  essentialDirectionsHref,
  essentialMapHref,
  essentialNeed,
  isEssentialNearby,
  nearestEssential,
} from "./nearby-essentials";

const POINTS: Amenity[] = [
  {
    id: "far-trash",
    kind: "trash",
    name: "Far trash can",
    municipality: "Frederick",
    lng: -77.42,
    lat: 39.42,
  },
  {
    id: "near-trash",
    kind: "trash",
    name: "Near trash can",
    municipality: "Frederick",
    lng: -77.4106,
    lat: 39.4144,
  },
  {
    id: "near-water",
    kind: "water",
    name: "Bottle fill",
    municipality: "Frederick",
    lng: -77.4107,
    lat: 39.4145,
  },
];

describe("nearby essentials", () => {
  it("returns the closest point for the selected need only", () => {
    const need = essentialNeed("trash");
    expect(need).not.toBeNull();

    const result = nearestEssential(
      { lng: -77.4105, lat: 39.4143 },
      POINTS,
      need!,
    );

    expect(result?.point.id).toBe("near-trash");
    expect(result?.distanceM).toBeLessThan(30);
  });

  it("returns null rather than substituting a different amenity", () => {
    const need = essentialNeed("dog-bags");
    expect(nearestEssential({ lng: -77.4105, lat: 39.4143 }, POINTS, need!)).toBeNull();
  });

  it("builds focused map and walking-direction handoffs", () => {
    const need = essentialNeed("trash")!;
    const point = POINTS[1];
    const map = new URL(essentialMapHref(need, point), "https://frederickradius.app");
    const directions = new URL(essentialDirectionsHref(point));

    expect(map.pathname).toBe("/map");
    expect(map.searchParams.get("amenity")).toBe("trash");
    expect(map.searchParams.get("at")).toBe("39.414400,-77.410600");
    expect(directions.searchParams.get("travelmode")).toBe("walking");
    expect(directions.searchParams.get("destination")).toBe("39.4144,-77.4106");
  });

  it("does not describe a distant county result as nearby", () => {
    expect(isEssentialNearby(3_000)).toBe(true);
    expect(isEssentialNearby(4_000)).toBe(false);
  });
});
