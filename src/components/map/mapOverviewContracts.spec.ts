import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCuratedGeoJson } from "./mapGeoJsonSources";
import type { MapPinPlace } from "./types";

const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");
const browse = readFileSync("src/components/map/BrowseMapClient.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

function layerBlock(id: string): string {
  const start = appMap.indexOf(`id="${id}"`);
  expect(start, `${id} layer`).toBeGreaterThan(-1);
  const end = appMap.indexOf("/>}", start);
  return appMap.slice(start, end);
}

describe("place names on the map (map audit, Oct 2026)", () => {
  it("puts the name inside the place symbol instead of a separate layer", () => {
    expect(appMap).not.toContain('id="curated-labels"');
    for (const id of ["curated-icons", "curated-active-icons"]) {
      const block = layerBlock(id);
      expect(block).toContain('"text-field": curatedPlaceLabelField(');
      expect(block).toContain('"text-optional": true');
      expect(block).toContain('"text-variable-anchor": ["right", "left", "top"]');
      expect(block).toContain('"symbol-sort-key": curatedPlaceSortKey(selectedSlug)');
      expect(block).toContain('"text-color": BRAND.colors.ink');
      expect(block).toContain('"text-halo-color": BRAND.colors.cream');
    }
  });

  it("draws the symbol from z14 so early names exist before the pucks", () => {
    const block = layerBlock("curated-icons");
    expect(block).toContain("minzoom={compactSubjectMap ? 10.5 : PLACE_LABEL_EARLY_ZOOM}");
    expect(block).not.toContain("minzoom={15.8}");
    // Invisible pucks never block a name before street zoom.
    expect(block).toContain('"icon-allow-overlap": ["step", ["zoom"], true, 16, false]');
    expect(block).toContain('"icon-ignore-placement": ["step", ["zoom"], true, 16, false]');
  });

  it("gives every curated feature a label rank", () => {
    const place = {
      slug: "test-cafe",
      name: "Test Cafe",
      category: "coffee",
      geom: { lng: -77.41, lat: 39.414 },
      is_verified: true,
      field_notes: false,
      local_favorite: true,
      short_blurb: "",
      open_status: { state: "unknown" },
    } as unknown as MapPinPlace;
    const [feature] = buildCuratedGeoJson([place], {
      amenitiesActive: false,
      visualMatchSet: null,
      searchPlaceSet: null,
    }).features;
    expect(feature.properties.labelRank).toBe(2);
  });
});

describe("the untouched county overview", () => {
  it("marks event times from the browse map's event week", () => {
    expect(browse).toContain("overviewEvents={weekEvents}");
    expect(appMap).toContain("overviewEventMarkers(overviewEvents");
    expect(appMap).toContain('className="fr-overview-event"');
    expect(appMap).toContain('className="fr-overview-event-dot"');
    expect(appMap).toContain("marker.showPill &&");
  });

  it("asks for the event archive only once the untouched overview is drawn", () => {
    expect(appMap).toMatch(
      /const overviewUntouched =\s*quietCountyOverview && !dock\?\.timeModeExplicit && !dock\?\.musicTonight;/,
    );
    expect(appMap).toContain("const overviewMarksEvents = overviewUntouched && mapLoaded;");
    expect(appMap).toMatch(/dock\?\.musicTonight \|\| overviewMarksEvents\) groups\.add\("events"\)/);
  });

  it("draws a published truck stop as a hollow scheduled puck", () => {
    expect(appMap).toMatch(
      /overviewUntouched\s*\?\s*foodTruckPinsForOverview\(liveFoodTruckPins, discoveryClockMs\)/,
    );
    expect(appMap).toContain("drawnFoodTruckPins.map(");
    expect(appMap).toContain('className="fr-food-truck-schedule"');
    expect(css).toMatch(
      /\.fr-food-truck-marker\[data-availability="published-stop"\] \.fr-food-truck-glyph \{[^}]*width: 28px;[^}]*border: 1\.5px solid var\(--app-ink-2\);[^}]*background: var\(--app-bg-elevated-solid\);/,
    );
    // The operator beacon keeps its filled Brick puck and pulse.
    expect(css).toMatch(/\.fr-food-truck-glyph \{[^}]*background: var\(--app-brand\);/);
    expect(appMap).toContain('pin.availability === "operator-live" ? (\n                    <span aria-hidden className="fr-food-truck-pulse" />');
  });

  it("draws the overview event as a 10px Brick dot with a Cream ring", () => {
    expect(css).toMatch(
      /\.fr-overview-event-dot \{[^}]*width: 10px;[^}]*height: 10px;[^}]*background: var\(--app-brand\);[^}]*box-shadow: 0 0 0 2px var\(--app-bg\);/,
    );
    expect(css).toMatch(/\.fr-overview-event \{[^}]*min-height: 44px;/);
  });
});
