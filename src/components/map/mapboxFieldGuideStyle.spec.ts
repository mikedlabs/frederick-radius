import type { Map as GLMap } from "mapbox-gl";
import { describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import {
  applyMapboxFieldGuideConfig,
  installMapboxFieldGuideTerrain,
  MAPBOX_FIELD_GUIDE_CONFIG,
  MAPBOX_FIELD_GUIDE_STYLE,
} from "./mapboxFieldGuideStyle";

function mapDouble({ sourceExists = false, layerExists = false } = {}) {
  const calls = {
    getSource: vi.fn(() => sourceExists ? { id: "fr-dem" } : undefined),
    getLayer: vi.fn(() => layerExists ? { id: "fr-hillshade" } : undefined),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    setConfigProperty: vi.fn((_namespace: string, _property: string, _value: unknown) => undefined),
    setPaintProperty: vi.fn((_layer: string, _property: string, _value: unknown) => undefined),
  };
  return { map: calls as unknown as GLMap, calls };
}

describe("Mapbox field-guide style", () => {
  it("uses Standard with branded, quiet product-map defaults", () => {
    expect(MAPBOX_FIELD_GUIDE_STYLE).toBe("mapbox://styles/mapbox/standard");
    expect(MAPBOX_FIELD_GUIDE_CONFIG.basemap).toMatchObject({
      theme: "faded",
      lightPreset: "day",
      font: "Source Sans Pro",
      showPointOfInterestLabels: false,
      showTransitLabels: false,
      show3dObjects: true,
      colorLand: BRAND.colors.cream,
      colorBuildings: BRAND.colors.border,
      colorRoads: BRAND.colors.paperDeep,
      colorAdminBoundaries: BRAND.colors.controlBorder,
      colorPlaceLabels: BRAND.colors.ink,
      colorRoadLabels: BRAND.colors.mutedInk,
      colorWater: "#7FA6BA",
      colorGreenspace: "#C6D2C0",
    });
  });

  it("reapplies all current basemap properties to a recycled map", () => {
    const { map, calls } = mapDouble();
    applyMapboxFieldGuideConfig(map);
    const config = MAPBOX_FIELD_GUIDE_CONFIG.basemap as Record<string, unknown>;
    expect(calls.setConfigProperty).toHaveBeenCalledTimes(Object.keys(config).length);
    for (const [property, value] of Object.entries(config)) {
      expect(calls.setConfigProperty).toHaveBeenCalledWith("basemap", property, value);
    }
    expect(calls.addSource).not.toHaveBeenCalled();
    expect(calls.addLayer).not.toHaveBeenCalled();
  });

  it("continues applying supported colors when an older renderer rejects one option", () => {
    const { map, calls } = mapDouble();
    calls.setConfigProperty.mockImplementation((_namespace, property) => {
      if (property === "theme") throw new Error("Unsupported cached renderer option");
      return undefined;
    });
    expect(() => applyMapboxFieldGuideConfig(map)).not.toThrow();
    expect(calls.setConfigProperty).toHaveBeenCalledWith("basemap", "colorBuildings", BRAND.colors.border);
    expect(calls.setConfigProperty).toHaveBeenCalledWith("basemap", "colorAdminBoundaries", BRAND.colors.controlBorder);
    expect(calls.setConfigProperty).toHaveBeenCalledTimes(Object.keys(MAPBOX_FIELD_GUIDE_CONFIG.basemap as Record<string, unknown>).length);
  });

  it("installs the existing DEM and subtle hillshade with the current palette", () => {
    const { map, calls } = mapDouble();
    installMapboxFieldGuideTerrain(map);
    expect(calls.addSource).toHaveBeenCalledWith("fr-dem", {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
    expect(calls.addLayer).toHaveBeenCalledWith({
      id: "fr-hillshade",
      type: "hillshade",
      source: "fr-dem",
      slot: "bottom",
      paint: {
        "hillshade-shadow-color": BRAND.colors.controlBorder,
        "hillshade-highlight-color": BRAND.colors.cream,
        "hillshade-accent-color": BRAND.colors.border,
        "hillshade-exaggeration": 0.28,
        "hillshade-illumination-direction": 315,
      },
    });
    expect(calls.setPaintProperty).not.toHaveBeenCalled();
  });

  it("keeps an existing DEM source when only its hillshade layer is missing", () => {
    const { map, calls } = mapDouble({ sourceExists: true });
    installMapboxFieldGuideTerrain(map);
    expect(calls.addSource).not.toHaveBeenCalled();
    expect(calls.addLayer).toHaveBeenCalledTimes(1);
  });

  it("repaints an existing hillshade without recreating its source or layer", () => {
    const { map, calls } = mapDouble({ sourceExists: true, layerExists: true });
    installMapboxFieldGuideTerrain(map);
    expect(calls.addSource).not.toHaveBeenCalled();
    expect(calls.addLayer).not.toHaveBeenCalled();
    expect(calls.setPaintProperty.mock.calls).toEqual([
      ["fr-hillshade", "hillshade-shadow-color", BRAND.colors.controlBorder],
      ["fr-hillshade", "hillshade-highlight-color", BRAND.colors.cream],
      ["fr-hillshade", "hillshade-accent-color", BRAND.colors.border],
    ]);
  });

  it("leaves terrain optional when its existing DEM setup is unavailable", () => {
    const { map, calls } = mapDouble();
    calls.addSource.mockImplementation(() => { throw new Error("DEM unavailable"); });
    expect(() => installMapboxFieldGuideTerrain(map)).not.toThrow();
    expect(calls.addLayer).not.toHaveBeenCalled();
    expect(calls.setPaintProperty).not.toHaveBeenCalled();
  });
});
