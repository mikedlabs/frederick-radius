import { describe, expect, it } from "vitest";
import {
  isCountyOverview,
  municipalityDisplayName,
  scrubInstant,
} from "./mapCameraHelpers";
import { FREDERICK_COUNTY_BOUNDS } from "./constants";

const [[west, south], [east, north]] = FREDERICK_COUNTY_BOUNDS;
const countyCenter = {
  lng: (west + east) / 2,
  lat: (south + north) / 2,
};

function camera(zoom: number, center = countyCenter) {
  return { getZoom: () => zoom, getCenter: () => center };
}

describe("isCountyOverview", () => {
  it("treats the settled county fit as an overview", () => {
    expect(isCountyOverview(camera(10.2))).toBe(true);
  });

  it("tolerates a small finger-wobble pan without flashing the control", () => {
    const wobble = {
      lng: countyCenter.lng + (east - west) * 0.05,
      lat: countyCenter.lat - (north - south) * 0.05,
    };
    expect(isCountyOverview(camera(10.2, wobble))).toBe(true);
  });

  it("is not an overview once zoomed to street reading", () => {
    expect(isCountyOverview(camera(12))).toBe(false);
  });

  it("is not an overview when the county is panned offscreen at the same zoom", () => {
    const offscreen = {
      lng: countyCenter.lng + (east - west) * 0.5,
      lat: countyCenter.lat,
    };
    expect(isCountyOverview(camera(10.2, offscreen))).toBe(false);
  });
});

describe("municipalityDisplayName", () => {
  it("resolves a slug to the display name", () => {
    expect(municipalityDisplayName("frederick")).toBe("Frederick City");
  });

  it("matches case-insensitively on the full name", () => {
    expect(municipalityDisplayName("BRUNSWICK")).toBe("Brunswick");
  });

  it("passes through an unknown value untouched", () => {
    expect(municipalityDisplayName("Shepherdstown")).toBe("Shepherdstown");
  });
});

describe("scrubInstant", () => {
  it("lands on the requested Frederick wall-clock hour", () => {
    const target = 15;
    const instant = scrubInstant(target);
    const local = new Date(
      instant.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    const hourFloat = local.getHours() + local.getMinutes() / 60;
    expect(Math.abs(hourFloat - target)).toBeLessThan(0.05);
  });
});
