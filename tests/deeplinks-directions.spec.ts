import { describe, it, expect } from "vitest";
import {
  googleMapsDirections,
  appleMapsDirections,
  wazeDirections,
} from "@/lib/integrations/deeplinks";

/**
 * Directions handoffs must always resolve to the right pin. The bug
 * these lock out: destination_place_id requires a real Google Place ID,
 * so feeding it a place name (as the old code did) is invalid and can
 * break resolution. Coordinates are the always-resolves destination.
 */
describe("map directions deep links", () => {
  const lat = 39.4143;
  const lng = -77.4105;

  it("google: destination is the coordinates, with no invalid place_id", () => {
    const url = googleMapsDirections(lat, lng);
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("destination=39.4143%2C-77.4105");
    expect(url).not.toContain("destination_place_id");
  });

  it("apple: drives to the coordinates and labels the pin with q=", () => {
    const url = appleMapsDirections(lat, lng, "Volt");
    expect(url).toContain("https://maps.apple.com/?");
    expect(url).toContain("daddr=39.4143%2C-77.4105");
    expect(url).toContain("q=Volt");
  });

  it("waze: navigates to the coordinates", () => {
    const url = wazeDirections(lat, lng);
    expect(url).toContain("https://www.waze.com/ul?");
    expect(url).toContain("ll=39.4143");
    expect(url).toContain("navigate=yes");
  });
});
