import { describe, expect, it } from "vitest";
import { approximateLocationFromValues } from "./ip-geo";

describe("approximateLocationFromValues", () => {
  it("accepts an in-county Frederick network location", () => {
    expect(approximateLocationFromValues(39.4143, -77.4105, "Frederick")).toMatchObject({
      status: "available",
      city: "Frederick",
    });
  });

  it("rejects Martinsburg even though it is within the old 60 km radius", () => {
    expect(approximateLocationFromValues(39.4562, -77.9639, "Martinsburg")).toEqual({
      origin: null,
      city: null,
      status: "outside-county",
    });
  });
});
