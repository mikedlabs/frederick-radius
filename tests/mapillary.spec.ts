import { describe, it, expect, afterEach } from "vitest";
import {
  normalizeMapillaryFeatures,
  mapillaryConfigured,
  mapillaryToken,
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

describe("token gating + sanitization", () => {
  const saved = process.env.MAPILLARY_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.MAPILLARY_TOKEN;
    else process.env.MAPILLARY_TOKEN = saved;
  });

  it("strips the trailing | / quotes / whitespace that broke it for rounds", () => {
    process.env.MAPILLARY_TOKEN = "MLY|123|abc|";
    expect(mapillaryToken()).toBe("MLY|123|abc");
    process.env.MAPILLARY_TOKEN = '  "MLY|123|abc"  ';
    expect(mapillaryToken()).toBe("MLY|123|abc");
    process.env.MAPILLARY_TOKEN = "MLY|123|abc";
    expect(mapillaryToken()).toBe("MLY|123|abc");
  });

  it("configured only with a clean 3-part token", () => {
    delete process.env.MAPILLARY_TOKEN;
    expect(mapillaryConfigured()).toBe(false);
    process.env.MAPILLARY_TOKEN = "MLY|123"; // 2 parts
    expect(mapillaryConfigured()).toBe(false);
    process.env.MAPILLARY_TOKEN = "MLY|123|abc|"; // trailing | tolerated
    expect(mapillaryConfigured()).toBe(true);
  });

  it("fetchMapillaryTrash returns [] (no network) when no/!valid token", async () => {
    delete process.env.MAPILLARY_TOKEN;
    expect(await fetchMapillaryTrash()).toEqual([]);
    process.env.MAPILLARY_TOKEN = "MLY|123"; // not 3 parts
    expect(await fetchMapillaryTrash()).toEqual([]);
  });
});
