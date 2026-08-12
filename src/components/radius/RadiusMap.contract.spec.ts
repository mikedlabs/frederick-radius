import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RadiusMap platform parity", () => {
  it("uses the same mobile-safe camera and renderer contracts as AppMap", () => {
    const source = readFileSync("src/components/radius/RadiusMap.tsx", "utf8");

    expect(source).toContain("if (!hasWebGL()) setMapFailed(true)");
    expect(source).toContain("window.setTimeout");
    expect(source).toContain("pitch: 0");
    expect(source).toContain("maxPitch={0}");
    expect(source).toContain("clickTolerance={8}");
    expect(source).toContain("maxBounds={toFlatBounds(FREDERICK_BROWSE_MAX_BOUNDS)}");
    expect(source).toContain("reuseMaps");
    expect(source).toContain("e.target.touchZoomRotate.disableRotation()");
    expect(source).not.toContain("touchZoomRotate={false}");
  });
});
