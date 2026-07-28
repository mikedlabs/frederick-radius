import { describe, expect, it } from "vitest";
import { buildMapSpotContext } from "./mapSpotContext";

const ORIGIN = { lng: -77.4105, lat: 39.4143 };

describe("buildMapSpotContext", () => {
  it("keeps only genuinely nearby facts and the next 24 hours of events", () => {
    const now = new Date("2026-07-28T16:00:00Z");
    const result = buildMapSpotContext(ORIGIN, {
      now,
      places: [
        { slug: "far", name: "Far", category: "food", lng: -77.45, lat: 39.44 },
        { slug: "near", name: "Near", category: "coffee", lng: -77.409, lat: 39.414 },
      ],
      parking: [],
      transit: [
        { id: "1", name: "Nearby stop", lng: -77.41, lat: 39.414 },
      ],
      events: [
        { slug: "past", title: "Past", startsAt: "2026-07-28T15:00:00Z", lng: -77.41, lat: 39.414 },
        { slug: "next", title: "Next", startsAt: "2026-07-28T17:00:00Z", lng: -77.409, lat: 39.414 },
      ],
      roads: [
        {
          kind: "traffic",
          label: "Market Street closure",
          lng: -77.4095,
          lat: 39.414,
        },
      ],
    });

    expect(result.place?.slug).toBe("near");
    expect(result.transit?.name).toBe("Nearby stop");
    expect(result.event?.slug).toBe("next");
    expect(result.road?.kind).toBe("traffic");
  });

  it("does not turn distant data into a misleading local answer", () => {
    const result = buildMapSpotContext(ORIGIN, {
      places: [{ slug: "far", name: "Far", category: "food", lng: -77.5, lat: 39.5 }],
      parking: [{ name: "Far garage", available: null, lng: -77.5, lat: 39.5 }],
      transit: [],
      events: [],
      roads: [
        {
          kind: "issue",
          label: "Far civic issue",
          lng: -77.5,
          lat: 39.5,
        },
      ],
    });

    expect(result.place).toBeNull();
    expect(result.parking).toBeNull();
    expect(result.road).toBeNull();
  });
});
