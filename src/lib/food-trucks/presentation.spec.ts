import { describe, expect, it } from "vitest";
import {
  foodTruckInitials,
  foodTruckStopDirectionsUrl,
  foodTruckVisualTone,
} from "./presentation";

describe("food-truck presentation", () => {
  it("builds readable initials without spending a letter on a leading article", () => {
    expect(foodTruckInitials("The Alley Wagon")).toBe("AW");
    expect(foodTruckInitials("D's Delights")).toBe("DD");
    expect(foodTruckInitials("dōp Pizza")).toBe("DP");
    expect(foodTruckInitials("Fryday")).toBe("FR");
  });

  it("keeps each vendor on a stable app color token", () => {
    expect(foodTruckVisualTone("the-alley-wagon")).toBe(
      foodTruckVisualTone("the-alley-wagon"),
    );
    expect(foodTruckVisualTone("the-alley-wagon")).toMatch(/^var\(--app-/);
  });

  it("prefers the published stop address for directions", () => {
    expect(
      foodTruckStopDirectionsUrl({
        venueName: "Baker Park Bandshell",
        address: "121 N Bentz St, Frederick, MD 21701",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=121%20N%20Bentz%20St%2C%20Frederick%2C%20MD%2021701",
    );
  });

  it("falls back to the venue name when the source has no address", () => {
    expect(
      foodTruckStopDirectionsUrl({ venueName: "Springfield Manor" }),
    ).toContain("destination=Springfield%20Manor");
  });
});
