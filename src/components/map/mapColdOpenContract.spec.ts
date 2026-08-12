import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapPage = readFileSync("src/app/(app)/map/page.tsx", "utf8");
const browseClient = readFileSync(
  "src/components/map/BrowseMapClient.tsx",
  "utf8",
);
const layerClient = readFileSync(
  "src/components/map/mapLayersClient.ts",
  "utf8",
);
const layerRoute = readFileSync("src/app/api/map/layers/route.ts", "utf8");

describe("map cold-open contract", () => {
  it("keeps optional provider fan-out out of the page render", () => {
    expect(mapPage).toContain("const countyBoundary = await getCountyBoundary()");
    expect(mapPage).not.toContain("assembleUnifiedEvents(");
    expect(mapPage).not.toContain("getCurrentSituationSnapshot(");
    expect(mapPage).not.toContain("fetchMapillaryTrash(");
    expect(mapPage).not.toContain("getFrederickTrailShapes(");
    expect(mapPage).not.toContain("getFrederickTransitRouteShapes(");
  });

  it("starts optional layers only after the committed place request succeeds", () => {
    expect(browseClient).toContain(
      'if (placeLoad.status !== "ready") return;',
    );
    expect(browseClient).toContain('loadMapLayers(["context"])');
    expect(layerClient).toContain("fetch(`/api/map/layers?groups=");
    expect(browseClient.indexOf('if (placeLoad.status !== "ready") return;'))
      .toBeLessThan(browseClient.indexOf('loadMapLayers(["context"])'));
  });

  it("uses intent-gated provider groups and the durable event archive", () => {
    expect(layerRoute).toContain('wants("amenities")');
    expect(layerRoute).toContain('wants("roads")');
    expect(layerRoute).toContain('wants("events")');
    expect(layerRoute).toContain("loadTodayEventSnapshot(now)");
    expect(layerRoute).not.toContain("assembleUnifiedEvents(");
  });
});
