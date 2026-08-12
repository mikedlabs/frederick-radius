import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RadiusMap platform parity", () => {
  it("uses the same mobile-safe camera and renderer contracts as AppMap", () => {
    const source = readFileSync("src/components/radius/RadiusMap.tsx", "utf8");

    expect(source).toContain("if (!MAPBOX_TOKEN || !hasWebGL()) setMapFailed(true)");
    expect(source).toContain("window.setTimeout");
    expect(source).toContain("MAP_LOAD_WATCHDOG_MS = 18_000");
    expect(source).toContain("isFatalMapboxError(msg, mapLoadedRef.current)");
    expect(source).toContain(
      'import { isFatalMapboxError } from "@/components/map/mapboxFailure"',
    );
    expect(source).toContain("pitch: 0");
    expect(source).toContain("maxPitch={0}");
    expect(source).toContain("clickTolerance={8}");
    expect(source).toContain("maxBounds={toFlatBounds(FREDERICK_BROWSE_MAX_BOUNDS)}");
    expect(source).toContain("reuseMaps");
    expect(source).toContain("e.target.touchZoomRotate.disableRotation()");
    expect(source).not.toContain("touchZoomRotate={false}");
  });

  it("reserves separate shelves for Radius controls and Mapbox legal marks", () => {
    const source = readFileSync("src/components/radius/RadiusMap.tsx", "utf8");
    const trails = readFileSync("src/components/trails/TrailsMap.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(source).toContain("data-radius-move-hint");
    expect(source).toContain("absolute left-3 top-28");
    expect(source).toContain("data-radius-layer-menu");
    expect(source).toContain('right: "calc(100% + 0.5rem)"');
    expect(trails).toContain("data-trail-map-legend");
    expect(trails).toContain("absolute left-3 top-12");
    expect(css).toContain(".radius-map-canvas .mapboxgl-ctrl-bottom-left");
    expect(css).toContain(".radius-map-canvas .mapboxgl-ctrl-bottom-right");
  });
});
