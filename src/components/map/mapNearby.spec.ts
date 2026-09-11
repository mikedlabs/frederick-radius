import { describe, expect, it } from "vitest";
import { nearestMapUtilities, nearestMapUtilityPoint } from "./mapNearby";

describe("nearestMapUtilities", () => {
  const origin = { lng: -77.4109, lat: 39.4143 };

  it("keeps the closest point for each useful kind", () => {
    const result = nearestMapUtilities(origin, [
      { ...origin, lng: origin.lng + 0.001, kind: "restroom" },
      { ...origin, lng: origin.lng + 0.003, kind: "restroom" },
      { ...origin, lng: origin.lng + 0.002, kind: "water" },
    ]);

    expect(result.map((item) => item.label)).toEqual(["Restroom", "Water"]);
  });

  it("drops unknown and distant points and respects the result limit", () => {
    const result = nearestMapUtilities(
      origin,
      [
        { ...origin, lng: origin.lng + 0.001, kind: "bench" },
        { ...origin, lng: origin.lng + 0.002, kind: "transit" },
        { ...origin, lng: origin.lng + 0.003, kind: "trash" },
        { ...origin, kind: "mystery" },
        { ...origin, lng: origin.lng + 0.02, kind: "water" },
      ],
      650,
      2,
    );

    expect(result.map((item) => item.label)).toEqual(["Seating", "Transit stop"]);
  });

  it("returns the named nearest point within the selected utility group", () => {
    const result = nearestMapUtilityPoint(
      origin,
      [
        { ...origin, lng: origin.lng + 0.004, kind: "restroom", name: "Far restroom" },
        { ...origin, lng: origin.lng + 0.001, kind: "restroom", name: "Carroll Creek restroom" },
        { ...origin, kind: "water", name: "Bottle fill" },
      ],
      new Set(["restroom"]),
    );

    expect(result?.point.name).toBe("Carroll Creek restroom");
    expect(result?.distM).toBeGreaterThan(0);
  });

  it("returns no answer when the selected group has no mapped point", () => {
    expect(
      nearestMapUtilityPoint(
        origin,
        [{ ...origin, kind: "water" }],
        new Set(["restroom"]),
      ),
    ).toBeNull();
  });
});
