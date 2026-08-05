import { describe, expect, it } from "vitest";
import type { OsmPlace } from "@/lib/integrations/overpass";
import {
  MUNI_LABELS_GEOJSON,
  activeAmenityCategorySlugs,
  buildDotGeoJson,
  buildEventScrubTimes,
  buildPlaceDupeIndex,
  buildRingGeoJson,
  buildRouteGeoJson,
  buildSelectedGeoJson,
  makeOsmDupeCheck,
} from "./mapGeoJsonSources";
import type { MapPinPlace } from "./types";

const downtown = { lng: -77.4105, lat: 39.4143 };

function pin(overrides: Partial<MapPinPlace> = {}): MapPinPlace {
  return {
    slug: "carroll-creek-park",
    name: "Carroll Creek Park",
    category: "parks",
    geom: downtown,
    source: "curated",
    ...overrides,
  } as MapPinPlace;
}

describe("place dupe index + OSM dupe check", () => {
  it("folds an OSM point that duplicates a curated place next door", () => {
    const idx = buildPlaceDupeIndex([pin()]);
    const isDupe = makeOsmDupeCheck(idx);
    const osmTwin = {
      osm_id: "node/1",
      name: "Carroll Creek Park",
      lng: downtown.lng + 0.0002,
      lat: downtown.lat + 0.0002,
    } as OsmPlace;
    expect(isDupe(osmTwin)).toBe(true);
  });

  it("keeps a distinct OSM place with an unrelated name", () => {
    const idx = buildPlaceDupeIndex([pin()]);
    const isDupe = makeOsmDupeCheck(idx);
    const other = {
      osm_id: "node/2",
      name: "Baker Park Bandshell",
      lng: downtown.lng,
      lat: downtown.lat,
    } as OsmPlace;
    expect(isDupe(other)).toBe(false);
  });

  it("never folds a nameless OSM point", () => {
    const isDupe = makeOsmDupeCheck(buildPlaceDupeIndex([pin()]));
    expect(isDupe({ osm_id: "node/3", name: "", lng: downtown.lng, lat: downtown.lat } as OsmPlace)).toBe(false);
  });
});

describe("activeAmenityCategorySlugs", () => {
  it("is empty when no groups are selected", () => {
    expect(activeAmenityCategorySlugs(new Set()).size).toBe(0);
  });

  it("expands a selected group into its category slugs", () => {
    const cats = activeAmenityCategorySlugs(new Set(["restroom"]));
    expect(cats.size).toBeGreaterThan(0);
  });
});

describe("location source builders", () => {
  it("renders nothing without a fix", () => {
    expect(buildRingGeoJson(null).features).toHaveLength(0);
    expect(buildDotGeoJson(null).features).toHaveLength(0);
  });

  it("renders the reach ring and dot at the fix", () => {
    expect(buildRingGeoJson(downtown).features).toHaveLength(1);
    const dot = buildDotGeoJson(downtown).features[0];
    expect(dot?.geometry.coordinates).toEqual([downtown.lng, downtown.lat]);
  });
});

describe("buildRouteGeoJson", () => {
  const place = { geom: { lng: -77.42, lat: 39.42 } };

  it("falls back to the straight connector when no routed geometry", () => {
    const fc = buildRouteGeoJson({
      userLoc: downtown,
      selectedPlace: place,
      routedWalkActive: false,
      routedCoordinates: undefined,
    });
    expect(fc.features[0]?.properties.routed).toBe(false);
    expect(fc.features[0]?.geometry.coordinates).toHaveLength(2);
  });

  it("uses the routed polyline when active", () => {
    const routed = [
      [downtown.lng, downtown.lat],
      [-77.415, 39.417],
      [place.geom.lng, place.geom.lat],
    ];
    const fc = buildRouteGeoJson({
      userLoc: downtown,
      selectedPlace: place,
      routedWalkActive: true,
      routedCoordinates: routed,
    });
    expect(fc.features[0]?.properties.routed).toBe(true);
    expect(fc.features[0]?.geometry.coordinates).toHaveLength(3);
  });
});

describe("buildSelectedGeoJson", () => {
  it("is empty with no selection and one brick feature with one", () => {
    expect(buildSelectedGeoJson(null).features).toHaveLength(0);
    expect(buildSelectedGeoJson({ geom: downtown }).features).toHaveLength(1);
  });
});

describe("buildEventScrubTimes", () => {
  it("derives Frederick wall-clock hours and a day key per event", () => {
    const [t] = buildEventScrubTimes([
      { starts_at: "2026-08-05T23:00:00.000Z", ends_at: "2026-08-06T01:00:00.000Z" },
    ]);
    // 23:00Z on Aug 5 is 19:00 in Frederick (EDT).
    expect(t.startH).toBeCloseTo(19, 5);
    expect(t.endH).toBeCloseTo(21, 5);
    expect(t.dayKey).toBe("2026-08-05");
  });

  it("marks a missing end as NaN so the scrubber treats it as open-ended", () => {
    const [t] = buildEventScrubTimes([{ starts_at: "2026-08-05T23:00:00.000Z" }]);
    expect(Number.isNaN(t.endH)).toBe(true);
  });
});

describe("MUNI_LABELS_GEOJSON", () => {
  it("labels every municipality with a priority tier", () => {
    expect(MUNI_LABELS_GEOJSON.features.length).toBeGreaterThanOrEqual(12);
    for (const f of MUNI_LABELS_GEOJSON.features) {
      expect([0, 1, 2]).toContain(f.properties.labelPriority);
    }
  });
});
