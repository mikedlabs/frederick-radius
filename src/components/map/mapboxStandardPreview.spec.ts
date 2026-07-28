import { describe, expect, it, vi } from "vitest";
import {
  FREDERICK_STANDARD_CONFIG,
  MAPBOX_STANDARD_STYLE_URL,
  applyMapboxStandardPreviewConfig,
  isMapboxStandardPreviewEnabled,
  mapStyleWithStandardPreview,
  mapboxStandardPreviewMode,
} from "./mapboxStandardPreview";

describe("mapboxStandardPreview", () => {
  it("defaults to off and preserves the current production style", () => {
    expect(mapboxStandardPreviewMode(undefined)).toBe("off");
    expect(isMapboxStandardPreviewEnabled("?basemap=standard", undefined)).toBe(
      false,
    );
    expect(
      mapStyleWithStandardPreview("mapbox://styles/mapbox/light-v11", "", ""),
    ).toBe("mapbox://styles/mapbox/light-v11");
  });

  it("supports a preview-deployment-wide explicit flag", () => {
    expect(mapboxStandardPreviewMode("1")).toBe("all");
    expect(isMapboxStandardPreviewEnabled("", "1")).toBe(true);
    expect(mapStyleWithStandardPreview("existing-style", "", "true")).toBe(
      MAPBOX_STANDARD_STYLE_URL,
    );
  });

  it("requires the exact query opt-in when configured in query mode", () => {
    expect(isMapboxStandardPreviewEnabled("?basemap=standard", "query")).toBe(
      true,
    );
    expect(
      isMapboxStandardPreviewEnabled(
        new URLSearchParams("basemap=STANDARD"),
        "query",
      ),
    ).toBe(true);
    expect(isMapboxStandardPreviewEnabled("?basemap=light", "query")).toBe(
      false,
    );
    expect(isMapboxStandardPreviewEnabled("", "query")).toBe(false);
  });

  it("does not touch map configuration while the preview is disabled", () => {
    const setConfigProperty = vi.fn();
    const result = applyMapboxStandardPreviewConfig(
      { setConfigProperty } as never,
      { search: "?basemap=standard", envValue: "0" },
    );

    expect(setConfigProperty).not.toHaveBeenCalled();
    expect(result).toEqual({ enabled: false, applied: [], skipped: [] });
  });

  it("applies the Frederick Standard config to the basemap import", () => {
    const setConfigProperty = vi.fn();
    const result = applyMapboxStandardPreviewConfig(
      { setConfigProperty } as never,
      {
        search: "?basemap=standard",
        envValue: "query",
        config: {
          lightPreset: "day",
          showPointOfInterestLabels: false,
        },
      },
    );

    expect(setConfigProperty).toHaveBeenNthCalledWith(
      1,
      "basemap",
      "lightPreset",
      "day",
    );
    expect(setConfigProperty).toHaveBeenNthCalledWith(
      2,
      "basemap",
      "showPointOfInterestLabels",
      false,
    );
    expect(result).toEqual({
      enabled: true,
      applied: ["lightPreset", "showPointOfInterestLabels"],
      skipped: [],
    });
  });

  it("fails soft per unsupported property and continues the preview", () => {
    const setConfigProperty = vi.fn(
      (_importId: string, property: string) => {
        if (property === "futureProperty") throw new Error("unsupported");
      },
    );
    const result = applyMapboxStandardPreviewConfig(
      { setConfigProperty } as never,
      {
        envValue: "1",
        config: {
          lightPreset: "day",
          futureProperty: true,
          showRoadLabels: true,
        },
      },
    );

    expect(setConfigProperty).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      enabled: true,
      applied: ["lightPreset", "showRoadLabels"],
      skipped: ["futureProperty"],
    });
  });

  it("keeps Radius-owned POI and transit labeling in the preview", () => {
    expect(FREDERICK_STANDARD_CONFIG.showPointOfInterestLabels).toBe(false);
    expect(FREDERICK_STANDARD_CONFIG.showTransitLabels).toBe(false);
    expect(FREDERICK_STANDARD_CONFIG.showPlaceLabels).toBe(true);
    expect(FREDERICK_STANDARD_CONFIG.showRoadLabels).toBe(true);
  });
});
