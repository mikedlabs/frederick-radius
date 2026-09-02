import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("map interaction state contracts", () => {
  it("keeps embedded Mapbox legal controls above the mobile navigation", () => {
    const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(appMap).toContain('data-map-embedded={!dock ? "true" : undefined}');
    expect(styles).toContain(
      '[data-map-embedded="true"] .mapboxgl-ctrl-bottom-left',
    );
    expect(styles).toContain(
      '[data-map-embedded="true"] .mapboxgl-ctrl-bottom-right',
    );
    expect(styles).toContain("top: 8px !important;");
    expect(styles).toContain("bottom: auto !important;");
  });

  it("uses the shared geolocation request instead of a private map request", () => {
    // The geolocation cluster moved to useMapLocation (#77); the contract
    // follows it there, and BOTH files stay free of private browser requests.
    const source = readFileSync("src/components/map/useMapLocation.ts", "utf8");
    const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");

    expect(source).toContain("requestHighAccuracy: requestSharedGeolocation");
    expect(source).toContain("requestSharedGeolocation()");
    expect(source).toContain("requestIfGranted: refreshGrantedGeolocation");
    expect(source).toContain("void refreshGrantedGeolocation()");
    expect(source).toContain(
      "cached && isInFrederickCounty(cached.lng, cached.lat)",
    );
    expect(source).toContain("GEOLOCATION_CHANGE_EVENT");
    expect(source).not.toContain("navigator.geolocation.getCurrentPosition");
    expect(appMap).not.toContain("navigator.geolocation.getCurrentPosition");
  });

  it("uses auth-aware place follows in the compact map card", () => {
    const source = readFileSync("src/components/map/MapPeek.tsx", "utf8");

    expect(source).toContain("useIsFollowed(place.slug)");
    expect(source).toContain('useToggleFollow(place.slug, "map_peek")');
    expect(source).not.toContain('useToggleSave("place"');
    expect(source).not.toContain('useIsSaved("place"');
  });

  it("keeps selected-place alternatives inside the existing Around here disclosure", () => {
    const source = readFileSync("src/components/map/MapPeek.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");
    const disclosureStart = source.indexOf('<details className="map-peek-around">');
    const alternatives = source.indexOf("data-map-decision-alternatives");
    const disclosureEnd = source.indexOf("</details>", disclosureStart);

    expect(source).toContain("buildMapPeekDecisionSurface");
    expect(source).toContain("data-map-decision-lead");
    expect(disclosureStart).toBeGreaterThan(-1);
    expect(alternatives).toBeGreaterThan(disclosureStart);
    expect(alternatives).toBeLessThan(disclosureEnd);
    expect(source).toContain(
      'className="ml-1 inline-flex min-h-11 items-center',
    );
    expect(source).toContain(
      'className="inline-flex min-h-11 items-center align-middle underline',
    );
    expect(css).toMatch(
      /\.map-peek-around summary\s*\{[^}]*min-height:\s*44px/,
    );
  });

  it("remounts the selected-place peek so its decision clock cannot leak across pins", () => {
    const source = readFileSync(
      "src/components/map/AppMapSelectionSurfaces.tsx",
      "utf8",
    );

    expect(source).toMatch(/<MapPeek\s+key=\{peekPlace\.slug\}/);
  });

  it("clears a cached map search when the route no longer has q", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");

    expect(source).toContain("const liveRouteQuery");
    expect(source).toContain(
      "liveRouteQuery !== searchLiveQueryRef.current",
    );
    expect(source).toContain("searchLiveQueryRef.current = liveRouteQuery");
    expect(source).toContain("invalidateTemporaryMapboxRetrieve();");
    expect(source).toContain("setQ(liveRouteQuery);");
    expect(source).toContain("pendingLocalQueryRef.current = null");
    expect(source).not.toContain("if (!routeQuery) return;");
  });

  it("keeps map search visibly pending while a retry begins", () => {
    const mapSource = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const dockSource = readFileSync("src/components/map/MapDock.tsx", "utf8");

    expect(mapSource).toContain('setSearchUnavailableQuery("");');
    expect(mapSource).toContain('setSearchSettledQuery("");');
    expect(dockSource).toContain(
      "onPointerDown={(event) => event.preventDefault()}",
    );
  });

  it("uses category artwork instead of unattributed remote event photos on pins", () => {
    const mapSource = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const pageSource = readFileSync("src/app/(app)/map/page.tsx", "utf8");
    const typeSource = readFileSync("src/components/map/types.ts", "utf8");

    expect(mapSource).toContain("<CategoryIcon");
    expect(mapSource).toContain("slug={lead.category}");
    expect(mapSource).not.toContain("lead.hero_image");
    expect(pageSource).not.toContain("hero_image: e.hero_image");
    expect(typeSource).not.toContain("hero_image?: string;");
  });

  it("hands the branded loading scene to the first idle map frame", () => {
    const mapSource = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const clientSource = readFileSync("src/components/map/AppMapClient.tsx", "utf8");
    const sceneSource = readFileSync("src/components/map/MapLoadingScene.tsx", "utf8");
    const mapPageSource = readFileSync("src/app/(app)/map/page.tsx", "utf8");

    expect(clientSource).toContain('<MapLoadingScene height="100%" ready={mapVisualReady} />');
    expect(clientSource).toContain("onVisualReady={handleMapVisualReady}");
    expect(clientSource).toContain("hasReportedMapVisualReady.current");
    expect(clientSource).toContain("<MapChunkBoundary");
    expect(mapSource).toContain("onVisualReady?.();");
    expect(mapSource).not.toContain('<MapLoadingScene height="100%" ready={mapVisualReady} />');
    expect(mapPageSource).toContain('<MapLoadingScene height="100%" />');
    expect(mapPageSource).toContain("fallback={<MapLoadingSurface />}");
    expect(sceneSource).toContain('data-state={ready ? "ready" : "loading"}');
    expect(sceneSource).toContain("aria-hidden={ready || undefined}");
  });

  it("uses one-shot selection and location acknowledgement rings", () => {
    const mapSource = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(mapSource).toContain("data-map-selection-lock");
    expect(mapSource).toContain("data-map-location-lock");
    expect(mapSource).toContain('className="map-marker-pass-through"');
    expect(css).toContain(".dock-host .map-marker-pass-through");
    expect(css).toContain("pointer-events: none !important;");
    expect(css).toContain("animation: map-lock-on 520ms");
    expect(css).not.toContain("animation: map-lock-on 520ms var(--app-ease-out) infinite");
  });

  it("keeps the mobile map flat while preserving pinch zoom and forgiving taps", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");

    expect(source).toContain("dragRotate={false}");
    expect(source).toContain("touchPitch={false}");
    expect(source).toContain("e.target.touchZoomRotate.disableRotation()");
    expect(source).toContain("clickTolerance={8}");
    expect(source).not.toContain("touchZoomRotate={false}");
  });

  it("bounds render-frame mark readiness checks when Mapbox Standard never idles", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const onRenderStart = source.indexOf("onRender={(e) => {");
    const onRenderEnd = source.indexOf("onMoveEnd={(e) => {", onRenderStart);
    const onRender = source.slice(onRenderStart, onRenderEnd);

    expect(onRenderStart).toBeGreaterThan(-1);
    expect(onRenderEnd).toBeGreaterThan(onRenderStart);
    expect(onRender).toContain("MAP_RENDER_READINESS_PROBE_INTERVAL_MS");
    expect(onRender).toContain("MAP_RENDER_READINESS_MAX_ATTEMPTS");
    expect(onRender).toContain('e.target.isSourceLoaded("curated-places")');
    expect(onRender).toContain('e.target.isSourceLoaded("amenities")');
    expect(onRender).toContain("placeProbe.settled = true");
    expect(onRender).toContain("amenityProbe.settled = true");
    expect(onRender).toContain('setPlaceMarksHealth(visibleMarks > 0 ? "ready" : "missing")');
    expect(onRender).toContain("setAmenityMarksHealth(");
    expect(source).toContain("resetMapRenderReadinessProbe();");
    expect(source).toContain("e.target.triggerRepaint();");
  });
});
