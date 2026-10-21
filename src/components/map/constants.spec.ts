import { afterEach, describe, expect, it, vi } from "vitest";
import { CAM_EASE, isAmenity, saveCachedOsm, smoothFocus } from "./constants";

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

describe("smoothFocus", () => {
  it("uses the existing bounded focus motion with temporary selected-card padding", () => {
    const easeTo = vi.fn();
    smoothFocus({ getZoom: () => 9.6, easeTo }, [-77.4438, 39.4221], {
      minZoom: 15,
      maxStep: 6,
      padding: { top: 89, right: 20, bottom: 470, left: 20 },
    });
    expect(easeTo).toHaveBeenCalledExactlyOnceWith({
      center: [-77.4438, 39.4221],
      zoom: 15,
      padding: { top: 89, right: 20, bottom: 470, left: 20 },
      retainPadding: false,
      duration: expect.any(Number),
      easing: CAM_EASE,
      essential: true,
    });
  });

  it("preserves existing default focus callers without changing camera padding", () => {
    const easeTo = vi.fn();
    smoothFocus({ getZoom: () => 10, easeTo }, [-77.41, 39.41]);
    expect(easeTo).toHaveBeenCalledExactlyOnceWith({
      center: [-77.41, 39.41],
      zoom: 12.2,
      duration: expect.any(Number),
      easing: CAM_EASE,
      essential: true,
    });
  });
});
