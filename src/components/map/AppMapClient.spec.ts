import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapLoadFailure } from "./AppMapClient";

describe("MapLoadFailure", () => {
  it("keeps a line-only trail failure honest and self-contained", () => {
    const html = renderToStaticMarkup(
      createElement(MapLoadFailure, {
        height: "420px",
        places: [],
        events: [],
        trailLineOnly: true,
      }),
    );

    expect(html).toContain("The interactive trail map did not load.");
    expect(html).toContain("The trail guide on this page still works.");
    expect(html).toContain("Reload map");
    expect(html).not.toContain("places and events here");
    expect(html).not.toContain("filters");
    expect(html).not.toContain("in this view");
    expect(html).not.toContain("switch back");
  });

  it("keeps a restroom task actionable without a map or a device fix", () => {
    const html = renderToStaticMarkup(createElement(MapLoadFailure, {
      height: "100%", places: [], events: [], groups: ["restroom"], town: "myersville",
      amenities: [
        { id: "restroom-1", kind: "restroom", name: "Park restroom", municipality: "myersville", lat: 39.5, lng: -77.56 },
        { id: "restroom-2", kind: "restroom", name: "City restroom", municipality: "frederick", lat: 39.42, lng: -77.41 },
        { id: "water-1", kind: "water", name: "Water fountain", municipality: "myersville", lat: 39.51, lng: -77.55 },
      ],
    }));
    expect(html).toContain("data-map-amenity-list");
    expect(html).toContain("Park restroom");
    expect(html).toContain("All towns");
    expect(html).toContain("destination=39.5%2C-77.56");
    expect(html).not.toContain("City restroom");
    expect(html).not.toContain("Water fountain");
    expect(html).not.toContain("places and events here");
  });

  it("retains an empty amenity filter without offering unrelated directory entries", () => {
    const html = renderToStaticMarkup(createElement(MapLoadFailure, {
      height: "100%", places: [], events: [], groups: ["restroom"], town: "brunswick", amenities: [
        { id: "water-1", kind: "water", name: "Water fountain", municipality: "brunswick", lat: 39.31, lng: -77.63 },
      ],
    }));
    expect(html).toContain("No locations are mapped for this selection.");
    expect(html).toContain("Brunswick");
    expect(html).not.toContain("places and events here");
  });

  it("covers rejected and never-settling deferred map modules", () => {
    const clientSource = readFileSync(
      "src/components/map/AppMapClient.tsx",
      "utf8",
    );
    const trailsSource = readFileSync(
      "src/components/trails/TrailsMap.tsx",
      "utf8",
    );
    const taproomSource = readFileSync(
      "src/components/beer/TaproomMap.tsx",
      "utf8",
    );

    expect(clientSource).toContain("APP_MAP_CHUNK_TIMEOUT_MS = 15_000");
    expect(clientSource).toContain("markAppMapChunkReady();");
    expect(clientSource).toContain("function loadAppMapModule()");
    expect(clientSource).toContain("export function warmAppMapChunk()");
    expect(clientSource).toContain("() => loadAppMapModule()");
    expect(clientSource).toContain("subscribeToAppMapChunkReady");
    expect(clientSource).toContain("window.setTimeout(");
    expect(clientSource).toContain("handleMapChunkFailure");
    expect(clientSource).toContain("data-map-chunk-failure");
    expect(trailsSource).toContain(
      'import AppMapClient from "@/components/map/AppMapClient"',
    );
    expect(taproomSource).toContain(
      'import AppMapClient from "@/components/map/AppMapClient"',
    );
    expect(trailsSource).not.toContain("dynamic(() => import");
    expect(taproomSource).not.toContain("dynamic(() => import");
  });
});
