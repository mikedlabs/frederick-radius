import { describe, expect, it } from "vitest";
import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
  MAP_LAYER_GROUPS,
  canonicalMapLayerGroupSearch,
  mapLayerGroupHasVisibleData,
  mergeDeferredBrowseLayerGroup,
  parseMapLayerGroups,
  parseDeferredBrowseLayers,
} from "./deferredBrowseLayers";

describe("parseDeferredBrowseLayers", () => {
  it("fails soft when the deferred endpoint response is malformed", () => {
    expect(parseDeferredBrowseLayers(null)).toEqual(
      EMPTY_DEFERRED_BROWSE_LAYERS,
    );
    expect(
      parseDeferredBrowseLayers({
        civic: "not-an-array",
        trailLines: { type: "FeatureCollection", features: "not-an-array" },
      }),
    ).toMatchObject({
      civic: [],
      trailLines: { type: "FeatureCollection", features: [] },
    });
  });

  it("keeps valid layers when another layer is malformed", () => {
    const civic = [
      {
        kind: "traffic" as const,
        lng: -77.41,
        lat: 39.41,
        label: "Market Street closure",
      },
    ];
    const trailLines = {
      type: "FeatureCollection" as const,
      features: [],
    };

    expect(
      parseDeferredBrowseLayers({
        civic,
        trailLines,
        parking: null,
      }),
    ).toMatchObject({ civic, trailLines, parking: [] });
  });

  it("keeps bounded provider health without accepting arbitrary fields", () => {
    expect(
      parseDeferredBrowseLayers({
        sourceHealth: {
          amenities: {
            status: "partial",
            unavailable: ["USGS water gauges", "", 42],
          },
          roads: { status: "invented", unavailable: ["Road conditions"] },
          madeUpGroup: { status: "unavailable", unavailable: ["Anything"] },
        },
      }).sourceHealth,
    ).toEqual({
      amenities: {
        status: "partial",
        unavailable: ["USGS water gauges"],
      },
    });
  });

  it("does not call an unavailable all-zero signal summary partial data", () => {
    const unavailableSignals = parseDeferredBrowseLayers({
      smartSignals: {
        conditionsStatus: "unavailable",
        activeWeatherAlert: false,
        marketsOpenTodayCount: 0,
        roadsTrendingLongerCount: 0,
      },
    });

    expect(mapLayerGroupHasVisibleData("signals", unavailableSignals)).toBe(
      false,
    );
    expect(mapLayerGroupHasVisibleData("roads", unavailableSignals)).toBe(
      false,
    );
  });
});

describe("mergeDeferredBrowseLayerGroup", () => {
  it("retains the last useful group data when a retry is unavailable", () => {
    const current = parseDeferredBrowseLayers({
      cemeteries: [
        {
          id: "historic-one",
          name: "Historic cemetery",
          approximate: false,
          lng: -77.4,
          lat: 39.4,
        },
      ],
      trailLines: {
        type: "FeatureCollection",
        features: [{ type: "Feature", id: "trail-one" }],
      },
      sourceHealth: {
        outdoors: { status: "partial", unavailable: ["Historic cemeteries"] },
      },
    });
    const unavailable = parseDeferredBrowseLayers({
      sourceHealth: {
        outdoors: {
          status: "unavailable",
          unavailable: ["County trails", "Historic cemeteries"],
        },
      },
    });

    const merged = mergeDeferredBrowseLayerGroup(
      current,
      unavailable,
      "outdoors",
    );

    expect(merged.cemeteries).toEqual(current.cemeteries);
    expect(merged.trailLines).toEqual(current.trailLines);
    expect(merged.sourceHealth.outdoors?.status).toBe("unavailable");
  });

  it("adds useful partial fields without erasing stale-good provider data", () => {
    const current = parseDeferredBrowseLayers({
      cemeteries: [
        {
          id: "historic-one",
          name: "Historic cemetery",
          approximate: false,
          lng: -77.4,
          lat: 39.4,
        },
      ],
      trailLines: {
        type: "FeatureCollection",
        features: [{ type: "Feature", id: "trail-old" }],
      },
    });
    const partial = parseDeferredBrowseLayers({
      cemeteries: [],
      trailLines: {
        type: "FeatureCollection",
        features: [{ type: "Feature", id: "trail-new" }],
      },
      sourceHealth: {
        outdoors: {
          status: "partial",
          unavailable: ["Historic cemeteries"],
        },
      },
    });

    const merged = mergeDeferredBrowseLayerGroup(current, partial, "outdoors");

    expect(merged.cemeteries).toEqual(current.cemeteries);
    expect(
      merged.trailLines.features.map(
        (feature) => (feature as { id?: string }).id,
      ),
    ).toEqual(["trail-new", "trail-old"]);
    expect(merged.sourceHealth.outdoors?.status).toBe("partial");
  });
});

describe("parseMapLayerGroups", () => {
  it("defaults to local context instead of every provider", () => {
    expect([...parseMapLayerGroups(null)]).toEqual(["context"]);
    expect([...parseMapLayerGroups("unknown")]).toEqual(["context"]);
  });

  it("keeps explicit specialist intent and adds its local dependency", () => {
    expect([...parseMapLayerGroups("events,roads")]).toEqual([
      "events",
      "roads",
    ]);
    expect([...parseMapLayerGroups("amenities")]).toEqual([
      "amenities",
      "context",
    ]);
  });
});

describe("canonicalMapLayerGroupSearch", () => {
  it("accepts exactly the eight finite public cache keys", () => {
    for (const group of MAP_LAYER_GROUPS) {
      expect(canonicalMapLayerGroupSearch(`?groups=${group}`)).toBe(group);
    }
  });

  it.each([
    "",
    "?groups=amenities&nonce=1",
    "?nonce=1&groups=amenities",
    "?groups=amenities,roads",
    "?groups=amenities&groups=roads",
    "?groups=%61menities",
    "?groups=unknown",
    "?GROUPS=roads",
  ])("rejects the noncanonical cache key %s", (search) => {
    expect(canonicalMapLayerGroupSearch(search)).toBeNull();
  });
});


describe("operational layer ownership", () => {
  it("does not let late catalog context erase current parking or amenity observations", () => {
    const current = parseDeferredBrowseLayers({
      parking: [{ slug: "garage", available: 12, updated: "2026-10-06T20:00:00Z" }],
      amenities: [{ id: "usgs:gauge", observedAt: "2026-10-06T20:00:00Z", detail: "4 ft gauge height" }],
      sourceHealth: { parking: { status: "current", unavailable: [] }, amenities: { status: "current", unavailable: [] } },
    });
    const catalog = parseDeferredBrowseLayers({ parking: [{ slug: "garage", available: null }], amenities: [], sourceHealth: { context: { status: "current", unavailable: [] } } });
    const merged = mergeDeferredBrowseLayerGroup(current, catalog, "context");
    expect(merged.parking[0].available).toBe(12);
    expect(merged.amenities[0].detail).toBe("4 ft gauge height");
  });

  it("keeps the older timestamp when an unavailable refresh retains previous features", () => {
    const current = parseDeferredBrowseLayers({ parking: [{ slug: "garage", available: 12 }], sourceHealth: { parking: { status: "current", unavailable: [], asOf: "2026-10-06T20:00:00Z" } } });
    const failed = parseDeferredBrowseLayers({ sourceHealth: { parking: { status: "unavailable", unavailable: ["Parking occupancy"], asOf: "2026-10-06T20:02:00Z" } } });
    const merged = mergeDeferredBrowseLayerGroup(current, failed, "parking");
    expect(merged.parking[0].available).toBe(12);
    expect(merged.sourceHealth.parking).toMatchObject({ stale: true, asOf: "2026-10-06T20:00:00Z", status: "unavailable" });
  });
});


describe("specialist and context evidence boundaries", () => {
  const at = "2026-10-06T20:00:00Z";
  const later = "2026-10-06T20:02:00Z";
  it.each(["parking", "amenities"] as const)("keeps the borrowed context age on a failed first %s check", (group) => {
    const current = parseDeferredBrowseLayers({ [group]: [{ id: "catalog-one", slug: "catalog-one" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: at } } });
    const failed = parseDeferredBrowseLayers({ sourceHealth: { [group]: { status: "unavailable", unavailable: ["Specialist source"], asOf: later } } });
    const result = mergeDeferredBrowseLayerGroup(current, failed, group);
    expect(result[group]).toEqual(current[group]);
    expect(result.sourceHealth[group]).toMatchObject({ status: "unavailable", stale: true, asOf: at });
  });
  it.each(["parking", "amenities"] as const)("allows valid catalog %s after an empty failed first specialist check", (group) => {
    const current = parseDeferredBrowseLayers({ sourceHealth: { [group]: { status: "unavailable", unavailable: ["Specialist source"], asOf: at } } });
    const incoming = parseDeferredBrowseLayers({ [group]: [{ id: "catalog-one", slug: "catalog-one" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: later } } });
    const result = mergeDeferredBrowseLayerGroup(current, incoming, "context");
    expect(result[group]).toEqual(incoming[group]);
    expect(result.sourceHealth[group]?.status).toBe("unavailable");
  });
  it.each(["parking", "amenities"] as const)("does not resurrect catalog %s after a healthy authoritative empty specialist result", (group) => {
    const current = parseDeferredBrowseLayers({ sourceHealth: { [group]: { status: "current", unavailable: [], asOf: at } } });
    const incoming = parseDeferredBrowseLayers({ [group]: [{ id: "old-catalog", slug: "old-catalog" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: at } } });
    expect(mergeDeferredBrowseLayerGroup(current, incoming, "context")[group]).toEqual([]);
    const failed = parseDeferredBrowseLayers({ sourceHealth: { [group]: { status: "unavailable", unavailable: ["Specialist source"], asOf: later } } });
    const afterFailure = mergeDeferredBrowseLayerGroup(current, failed, group);
    expect(mergeDeferredBrowseLayerGroup(afterFailure, incoming, "context")[group]).toEqual([]);
    expect(afterFailure.sourceHealth[group]).toMatchObject({ stale: true, asOf: at, status: "unavailable" });
  });
  it("does not borrow an unrelated context time for an event snapshot", () => {
    const current = parseDeferredBrowseLayers({ weekEvents: [{ slug: "event" }], sourceHealth: { context: { status: "current", unavailable: [], asOf: at } } });
    const failed = parseDeferredBrowseLayers({ sourceHealth: { events: { status: "unavailable", unavailable: ["Events"], asOf: later } } });
    expect(mergeDeferredBrowseLayerGroup(current, failed, "events").sourceHealth.events?.asOf).toBeUndefined();
  });
});
