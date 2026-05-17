import { describe, it, expect, afterEach } from "vitest";
import {
  normalizeMapillaryFeatures,
  mapillaryConfigured,
  fetchMapillaryTrash,
} from "@/lib/integrations/mapillary";

// A point inside Frederick County (downtown) and one well outside it.
const IN = [-77.4105, 39.4143];
const OUT = [-74.0, 40.7]; // NYC — must be dropped

const feat = (id: string, lng: number, lat: number, v = "object--trash-can") => ({
  id,
  object_value: v,
  geometry: { type: "Point", coordinates: [lng, lat] },
});

describe("normalizeMapillaryFeatures", () => {
  it("maps valid in-county detections to OsmPlace trash points", () => {
    const out = normalizeMapillaryFeatures({ data: [feat("a", IN[0], IN[1])] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      osm_id: "mly-a",
      category_slug: "trash",
      lng: IN[0],
      lat: IN[1],
    });
    expect(out[0].osm_tag).toContain("mapillary=");
  });

  it("drops out-of-bbox, malformed, and non-array input", () => {
    expect(normalizeMapillaryFeatures({ data: [feat("x", OUT[0], OUT[1])] })).toEqual([]);
    expect(normalizeMapillaryFeatures({ data: [{ id: "y", geometry: {} }] })).toEqual([]);
    expect(normalizeMapillaryFeatures({ data: [{ id: "z", geometry: { coordinates: ["a", "b"] } }] })).toEqual([]);
    expect(normalizeMapillaryFeatures({})).toEqual([]);
    expect(normalizeMapillaryFeatures(null)).toEqual([]);
  });

  it("dedupes the same can seen from many images by rounded coordinate", () => {
    const out = normalizeMapillaryFeatures({
      data: [feat("a", IN[0], IN[1]), feat("b", IN[0] + 0.00001, IN[1])],
    });
    expect(out).toHaveLength(1);
  });
});

describe("gating — dormant by default", () => {
  const saved = { tok: process.env.MAPILLARY_TOKEN, flag: process.env.MAPILLARY_TRASH };
  afterEach(() => {
    process.env.MAPILLARY_TOKEN = saved.tok;
    process.env.MAPILLARY_TRASH = saved.flag;
  });

  it("mapillaryConfigured is false without BOTH token and flag", () => {
    delete process.env.MAPILLARY_TOKEN;
    delete process.env.MAPILLARY_TRASH;
    expect(mapillaryConfigured()).toBe(false);
    process.env.MAPILLARY_TOKEN = "MLY|test";
    expect(mapillaryConfigured()).toBe(false); // flag still off
    process.env.MAPILLARY_TRASH = "1";
    expect(mapillaryConfigured()).toBe(true);
  });

  it("fetchMapillaryTrash returns [] (no network) when not fully activated", async () => {
    delete process.env.MAPILLARY_TRASH;
    process.env.MAPILLARY_TOKEN = "MLY|test";
    expect(await fetchMapillaryTrash()).toEqual([]); // dormant flag off
    process.env.MAPILLARY_TRASH = "1";
    delete process.env.MAPILLARY_TOKEN;
    expect(await fetchMapillaryTrash()).toEqual([]); // no token
  });
});
