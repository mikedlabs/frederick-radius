import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");
const dock = readFileSync("src/components/map/MapDock.tsx", "utf8");
const location = readFileSync("src/components/map/useMapLocation.ts", "utf8");
const resultSurface = readFileSync("src/components/map/MapResultSurface.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

describe("user-first map contracts", () => {
  it("asks for location as a first-use choice without an automatic browser prompt", () => {
    expect(dock).toContain("Use my location");
    expect(dock).toContain("Browse county");
    expect(dock).toContain("map-location-offer");
    expect(dock).toContain("locationOfferVisible && pane === null && !searchPanelOpen");
    expect(dock).toContain("shouldOfferMapLocationForUrl(sp)");
    expect(location).toContain("requestIfGranted: refreshGrantedGeolocation");
    expect(location).not.toContain("navigator.geolocation.getCurrentPosition");
    expect(dock).not.toContain('className="dock-locate');
  });

  it("keeps the first-use location choice from blocking a deliberate map task", () => {
    expect(dock).toContain("dismissLocationIntro();\n              setSearchPanelOpen(true);");
    expect(dock).toContain("dismissLocationIntro();\n              togglePane(\"contents\");");
    expect(dock).not.toContain('setPane((current) => current ?? "location")');
  });

  it("keeps the first chooser focused and preserves access to detailed map controls", () => {
    const start = dock.indexOf('{pane === "contents" && (');
    const end = dock.indexOf('{pane === "amenities" && (', start);
    const contents = dock.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    for (const label of [
      "Public essentials",
      "Nearby",
      "Happening",
      "Get around",
      "Conditions",
    ]) {
      expect(contents).toContain(`<strong>${label}</strong>`);
    }
    expect(contents).not.toContain("<strong>Area</strong>");
    expect(contents).toContain("whatChangedScene && !whatChangedUnavailable");
    expect(contents).toContain("onClick={applyNearbyOutcome}");
    expect(contents).toContain('openContentsPane("when")');
    expect(contents).toContain('openContentsPane("layers")');
    expect(contents).toContain('openContentsPane("conditions")');
    expect(dock).toContain('setPane("what")');
  });

  it("restores focus for explicit closes but hands a map gesture back to the canvas", () => {
    const railStart = dock.indexOf('className="map-context-rail-open"');
    const railEnd = dock.indexOf('className="map-context-rail-clear', railStart);
    const rail = dock.slice(railStart, railEnd);

    expect(dock).toContain("focusMapBeforeDockDismiss(dockRef.current)");
    expect(dock).toContain("clearPaneState();");
    expect(dock).toContain("window.requestAnimationFrame(() => restoreTarget?.focus?.())");
    expect(rail).toContain('role="status"');
    expect(rail).not.toContain("togglePane");
    expect(rail).not.toContain("onClick");
  });

  it("keeps mobile map result chrome honest and reachable", () => {
    expect(resultSurface).not.toContain("map-result-handle");
    expect(css).not.toContain(".map-result-handle");
    expect(css).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.map-result-surface \{[\s\S]*?bottom: 8px;/,
    );
    expect(css).toMatch(
      /\.map-entity-contact a \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/,
    );
  });

  it("never moves the camera while a person is still typing", () => {
    const start = appMap.indexOf("// On-map search remains Radius-first");
    const end = appMap.indexOf("const placesBySlug", start);
    const searchEffect = appMap.slice(start, end);
    const pickStart = appMap.indexOf("const pickSearch = async");
    const pickEnd = appMap.indexOf("const ringGeoJson", pickStart);
    const explicitPick = appMap.slice(pickStart, pickEnd);

    expect(start).toBeGreaterThan(-1);
    expect(searchEffect).not.toMatch(
      /smoothFocus\(|\.flyTo\(|\.easeTo\(|\.fitBounds\(|\.jumpTo\(/,
    );
    expect(explicitPick).toMatch(/smoothFocus\(|\.easeTo\(/);
  });

  it("gives the first selected entity one Back-close history entry", () => {
    expect(appMap).toContain("selectionHistoryEntryRef.current");
    expect(appMap).toContain("window.history.pushState(");
    expect(appMap).toContain("markMapSelectionHistoryState(");
    expect(appMap).toContain("readMapSelectionHistorySnapshot(");
    expect(appMap).toContain("window.history.back();");
    expect(appMap).toContain(
      "beginMapSelectionHistory(resultKind ? undefined : next);",
    );
    expect(appMap).toContain("writeMapSelectionSession(next)");
    expect(appMap).toContain("params.set(MAP_SELECTION_TOKEN_PARAM, selectionToken)");
    expect(appMap).toContain("applyMapSelection(historySelection);");
    expect(appMap).toContain("isMapSelectionHistoryState(event.state)");
    expect(appMap).toContain("setSelectedSlug(place.slug)");
    expect(appMap).toContain("setSelectedEvent(eventPin)");
    expect(appMap).toContain("routePlaceSelection");
    expect(appMap).toContain("routeEventSelection");
    expect(appMap).toContain("routeResultSelection");
    expect(appMap).toContain('params.set("result", resultKind)');
    expect(appMap).toContain("Next's App Router can temporarily disconnect");
    expect(appMap).toContain("restoreMapSelectionOpenerFocus();");
    expect(appMap).toMatch(/kind: "place", value: place \},\s*\{ addHistory: false \}/);
    expect(appMap).toMatch(/kind: "event", value: event \},\s*\{ addHistory: false \}/);
    expect(appMap).toContain("clearMapSelection={dismissMapSelection}");
  });

  it("closes locally-owned live popups through the same history contract", () => {
    const liveLayerSources = [
      "LiveBuses.tsx",
      "LiveMarcTrains.tsx",
      "LiveIncidents.tsx",
      "LiveRotorcraft.tsx",
      "RoadWorkZones.tsx",
      "SnowRoutes.tsx",
      "FloodContext.tsx",
    ].map((file) =>
      readFileSync(`src/components/map/${file}`, "utf8"),
    );

    expect(appMap).toContain("onDidClose: dismissMapSelection");
    for (const source of liveLayerSources) {
      expect(source).toContain("gate?.onWillOpen()");
      expect(source).toContain("gate?.onDidClose()");
    }
    expect(liveLayerSources[0]).toContain("closeOnClick={false}");
    expect(liveLayerSources[1]).toContain("closeOnClick={false}");
  });

  it("lets a focused public-essential task own the map canvas", () => {
    expect(appMap).toMatch(
      /const operationalLayerActive =\s*amenityLayerActive \|\|\s*Boolean\(activeSceneId\)/,
    );
    expect(dock).toContain("The closest result opens first.");
    expect(dock).toContain("amenityGroupCounts[firstAmenityKey]");
  });

  it("distinguishes an unavailable live source from an empty map layer", () => {
    expect(dock).toContain("mapLayerSourceHealth");
    expect(dock).toContain('className="dock-source-health"');
    expect(dock).toContain(
      "An empty layer does not mean there are no results.",
    );
    expect(dock).toContain(
      "Available results are still shown.",
    );
    expect(dock).toContain("retryMapLayerGroups?.(degradedPaneSourceGroups)");
    expect(dock).toContain("Check again");
  });
});
