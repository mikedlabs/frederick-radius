import { describe, expect, it } from "vitest";
import { distanceFrom, mapDistanceOriginLabel } from "./distanceOrigin";

describe("map distance origin", () => {
  it("says a distance is measured from the visitor when the device fix is known", () => {
    expect(mapDistanceOriginLabel(true)).toBe("from you");
    expect(distanceFrom(640, "from you")).toMatch(/ from you$/);
  });

  it("says a distance is measured from the map center without a device fix", () => {
    expect(mapDistanceOriginLabel(false)).toBe("from map center");
    expect(distanceFrom(640, "from map center")).toMatch(/ from map center$/);
  });
});
