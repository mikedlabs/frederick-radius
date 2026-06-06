import { describe, it, expect } from "vitest";
import { eventGeoConfidence, isGeoPrecise } from "@/lib/events/geo-confidence";

// A real downtown venue (Sky Stage), NOT sitting on the Frederick
// centroid — a distinct, addressable point.
const SKY_STAGE = { lng: -77.4126, lat: 39.4151 };
// The exact coordinates a live county/celebrate feed defaults to.
const FREDERICK_CENTROID = { lng: -77.4109, lat: 39.4137 };
const COUNTY_CENTROID = { lng: -77.4109, lat: 39.4143 };
// A municipality centroid (Brunswick) from the data.
const BRUNSWICK_CENTROID = { lng: -77.6280, lat: 39.3134 };

describe("eventGeoConfidence — a distance is a promise (audit #2 P1)", () => {
  it("placement 'venue' is always venue_match, even if near a centroid", () => {
    expect(eventGeoConfidence({ placement: "venue", geom: SKY_STAGE })).toBe("venue_match");
    // A venue whose coord happens to be the centroid is still precise —
    // placement wins, because the coord was resolved, not defaulted.
    expect(eventGeoConfidence({ placement: "venue", geom: FREDERICK_CENTROID })).toBe("venue_match");
  });

  it("a distinct geocoded coord is exact_address", () => {
    expect(eventGeoConfidence({ placement: "geocoded", geom: SKY_STAGE })).toBe("exact_address");
  });

  it("a coord sitting on a feed/municipality centroid is area, whatever the placement", () => {
    expect(eventGeoConfidence({ placement: "geocoded", geom: FREDERICK_CENTROID })).toBe("area");
    expect(eventGeoConfidence({ placement: "geocoded", geom: COUNTY_CENTROID })).toBe("area");
    expect(eventGeoConfidence({ placement: "geocoded", geom: BRUNSWICK_CENTROID })).toBe("area");
  });

  it("a live event (no placement) on its feed centroid is area, not unknown", () => {
    expect(eventGeoConfidence({ geom: FREDERICK_CENTROID })).toBe("area");
  });

  it("no placement and a non-centroid coord we can't vouch for is unknown", () => {
    expect(eventGeoConfidence({ geom: SKY_STAGE })).toBe("unknown");
  });
});

describe("isGeoPrecise — only addressable events claim a distance", () => {
  it("true for venue_match and exact_address only", () => {
    expect(isGeoPrecise({ placement: "venue", geom: SKY_STAGE })).toBe(true);
    expect(isGeoPrecise({ placement: "geocoded", geom: SKY_STAGE })).toBe(true);
  });

  it("false for area and unknown", () => {
    expect(isGeoPrecise({ placement: "geocoded", geom: FREDERICK_CENTROID })).toBe(false); // area
    expect(isGeoPrecise({ geom: SKY_STAGE })).toBe(false); // unknown
  });
});
