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
    expect(dock).toMatch(/dismissLocationIntro\(\);\s+setSearchPanelOpen\(true\);/);
    expect(dock).toMatch(/dismissLocationIntro\(\);\s+togglePane\("contents"\);/);
    expect(dock).not.toContain('setPane((current) => current ?? "location")');
  });

  it("keeps Radius search usable when the interactive renderer is unavailable", () => {
    expect(appMap).toContain("useState(() => !MAP_RENDERER_CONFIGURED)");
    expect(appMap).toMatch(/\{dock && \(\s*<div\s+className="map-dock-slot"/);
    expect(appMap).toContain("mapAvailable={!mapError}");
    expect(appMap).toContain("searchMatches={searchMatchesForSurface}");
    expect(dock).toContain('data-map-available={mapAvailable ? "true" : "false"}');
    expect(dock).toContain(
      'aria-label={mapAvailable ? "Search this map" : "Search Frederick Radius"}',
    );
  });

  it("keeps the first chooser focused and preserves access to detailed map controls", () => {
    const start = dock.indexOf('{pane === "contents" && (');
    const end = dock.indexOf('{pane === "amenities" && (', start);
    const contents = dock.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // The first screen is the common needs as category tiles that apply
    // within the header scope and close the chooser (map audit MAP-05).
    expect(contents).toContain("MAP_TASK_TILES.map");
    expect(contents).toContain("onClick={() => pickTask(tile.id)}");
    expect(contents.indexOf("MAP_TASK_TILES.map")).toBeLessThan(
      contents.indexOf("<strong>Public essentials</strong>"),
    );
    for (const label of [
      "All place categories",
      "Public essentials",
      "Happening",
      "Get around",
      "Conditions",
    ]) {
      expect(contents).toContain(`<strong>${label}</strong>`);
    }
    expect(contents).toContain("More map views");
    // The header chip is the only Near me control. The Nearby row changed
    // scope from inside this sheet with no fix, so it is gone.
    expect(contents).not.toContain("<strong>Nearby</strong>");
    expect(dock).not.toContain("applyNearbyOutcome");
    expect(contents).not.toContain("<strong>Area</strong>");
    expect(contents).toContain("whatChangedScene && !whatChangedUnavailable");
    expect(contents).toContain('openContentsPane("what", "categories")');
    expect(contents).toContain('openContentsPane("when")');
    expect(contents).toContain('openContentsPane("layers")');
    expect(contents).toContain('openContentsPane("conditions")');
    expect(dock).toMatch(/const pickTask = \(id: MapTaskId\) => \{[\s\S]*?closePane\(\);/);
  });

  it("offers likely-open instead of a disabled Open now row and drops the count headline", () => {
    expect(dock).not.toContain("Open now unavailable");
    expect(dock).not.toContain("disabled={props.openNowAvailable === false}");
    expect(dock).toContain('onClick={() => pickTask("likely-open")}');
    expect(dock).not.toContain("countLine(");
    expect(dock).toContain('boxShadow: "0 -16px 0 var(--app-bg-elevated-solid)"');
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

  it("answers a query with the same story on the map and in the list", () => {
    // The source, not just the paint, follows the newest task: clusters are
    // counted before styling, so emphasis alone drew the whole catalog.
    expect(appMap).toContain(
      "const sourceMatchSet = searchPlaceSet ?? clientTaskSet ?? matchSet;",
    );
    expect(appMap).toContain(
      "curatedPlacesForMapSource(filteredPlaces, sourceMatchSet)",
    );
    // Enter with nothing highlighted submits the phrase instead of opening
    // the first row, and "Show all results" stays on the map.
    const enter = dock.slice(
      dock.indexOf('if (event.key === "Enter") {'),
      dock.indexOf('if (event.key === "Escape") {'),
    );
    expect(enter).toContain("searchResultsVisible && activeSearchResult");
    expect(enter).toContain("submitTypedSearch();");
    expect(dock).toContain("Show all results");
    expect(appMap).toContain("submitSearch={submitMapSearch}");
    const submit = appMap.slice(
      appMap.indexOf("const submitMapSearch = (raw: string) => {"),
      appMap.indexOf("const searchThisArea = () => {"),
    );
    expect(submit).not.toMatch(/smoothFocus\(|\.flyTo\(|\.easeTo\(|\.fitBounds\(|\.jumpTo\(/);
    expect(submit).toContain("mapQueryRoute(text)");
  });

  it("offers Search this area only while a task is active and makes it raise the list", () => {
    expect(appMap).not.toContain("Show results here");
    expect(appMap).toContain("Search this area");
    expect(appMap).toContain(
      "const searchAreaVisible = showResultsHere && mapTaskActive;",
    );
    expect(appMap).toContain("onClick={searchThisArea}");
    const area = appMap.slice(
      appMap.indexOf("const searchThisArea = () => {"),
      appMap.indexOf("const openPlaceFromTaskList"),
    );
    expect(area).toContain("area: viewport.bounds");
    expect(area).toContain("expanded: true");
  });

  it("never measures rows from the map center", () => {
    expect(appMap).not.toContain("from map center");
    expect(dock).not.toContain("from map center");
    expect(appMap).toContain('searchDistanceOriginLabel={userLoc ? "from you" : null}');
    expect(appMap).toContain("placesInViewOrigin={userLoc}");
  });

  it("keeps stock alarm colors and Tailwind defaults off the map", () => {
    expect(appMap).not.toContain("events-heatmap");
    expect(appMap).not.toContain('type="heatmap"');
    expect(appMap).not.toMatch(/rgba\(255,\s*0,\s*0/);
    const scenic = appMap.slice(
      appMap.indexOf('<Source id="scenic-routes-source"'),
      appMap.indexOf("<MapOverlays"),
    );
    for (const hex of ["#eab308", "#ef4444", "#f97316"]) {
      expect(scenic).not.toContain(hex);
      expect(dock).not.toContain(hex);
    }
    expect(appMap).toContain('"line-color": BRAND.colors.forest');
    expect(appMap).toContain('"line-color": BRAND.colors.creek');
  });

  it("draws the attribution toggle as a quiet outline mark, not a filled card", () => {
    const rule = css.slice(
      css.indexOf(".dock-host .mapboxgl-ctrl-attrib-button::before {"),
      css.indexOf("}", css.indexOf(".dock-host .mapboxgl-ctrl-attrib-button::before {")),
    );
    expect(rule).toContain("background-color: var(--app-ink-3);");
    expect(rule).toContain("width: 20px;");
    expect(rule).toContain("mask: url(");
    expect(css).toMatch(
      /\.dock-host \.mapboxgl-ctrl-attrib-button \{[^}]*background-image: none !important;[^}]*box-shadow: none !important;/,
    );
    // The 44px hit area stays.
    expect(css).toMatch(
      /\.mapboxgl-map \.mapboxgl-ctrl-attrib-button \{[^}]*min-height: 44px !important;/,
    );
  });

  it("rotates a terminal Search Box session and reopens from bounded tab memory", () => {
    expect(appMap).toContain("searchSessionStartedAtRef");
    expect(appMap).toContain("now - searchSessionStartedAtRef.current > 150_000");
    expect(appMap).not.toContain("searchSessionLastUsedRef");
    expect(appMap).not.toContain("sessionStart:");
    expect(appMap).toContain("readTemporaryMapboxResult(");
    expect(appMap).toContain("writeTemporaryMapboxResult(");
    const reset = appMap.indexOf("resetSearchBoxSession(sessionToken);");
    const retrieve = appMap.indexOf('fetch("/api/map/search-fallback"', reset);
    const staleGuard = appMap.indexOf(
      "temporaryMapboxRetrieveIsCurrent(",
      retrieve,
    );
    const clearOpening = appMap.indexOf(
      "setSearchOpeningId((current)",
      staleGuard,
    );
    expect(reset).toBeGreaterThan(-1);
    expect(retrieve).toBeGreaterThan(reset);
    expect(staleGuard).toBeGreaterThan(retrieve);
    expect(clearOpening).toBeGreaterThan(staleGuard);
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
