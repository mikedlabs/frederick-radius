import { describe, expect, it } from "vitest";
import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
  MAP_LAYER_GROUPS,
  canonicalMapLayerGroupSearch,
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
