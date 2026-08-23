import { afterEach, describe, expect, it, vi } from "vitest";
import { isAmenity, saveCachedOsm } from "./constants";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAmenity", () => {
  it("keeps moderated community reports in the grouped map source", () => {
    expect(isAmenity({
      osm_id: "report:1",
      name: "Downed branch",
      category_slug: "report-hazard",
      osm_tag: "debris",
      lng: -77.41,
      lat: 39.41,
    })).toBe(true);
  });
});

describe("OSM browser cache", () => {
  it("does not persist an empty provider response", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { setItem },
    });

    saveCachedOsm([]);

    expect(setItem).not.toHaveBeenCalled();
  });
});
