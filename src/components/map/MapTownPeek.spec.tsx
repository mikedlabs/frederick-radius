// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppMapSelectionSurfaces from "./AppMapSelectionSurfaces";
import { MapTownPeek } from "./MapEntityPeek";
import type { LngLat } from "@/lib/geo";
import type { MapLineFC } from "./types";
import { MUNICIPALITIES } from "@/data/municipalities";

function html(node: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

describe("MapTownPeek", () => {
  it("leads with Town and the town's own line when no civic contact is on file", () => {
    const peek = html(
      createElement(MapTownPeek, {
        title: "Walkersville",
        blurb: "Walkersville sits along the Monocacy River.",
        contacts: [],
        onClose: () => {},
      }),
    );
    expect(peek.querySelector(".map-peek-cat")?.textContent).toBe("Town");
    expect(peek.textContent).toContain("Walkersville sits along the Monocacy River.");
    expect(peek.textContent).not.toContain("Civic details are not available");
    expect(peek.textContent).not.toContain("You are in");
  });

  it("says nothing instead of an apology when there is no line either", () => {
    const peek = html(
      createElement(MapTownPeek, { title: "Woodsboro", contacts: [], onClose: () => {} }),
    );
    expect(peek.querySelectorAll(".map-peek-detail")).toHaveLength(0);
    expect(peek.textContent).not.toContain("not available");
  });
});

describe("the town peek on the map", () => {
  const frederick = MUNICIPALITIES.find((town) => town.slug === "frederick")!;
  const boundaries: MapLineFC = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { slug: "frederick", name: "Frederick" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-77.5, 39.35], [-77.33, 39.35], [-77.33, 39.48], [-77.5, 39.48], [-77.5, 39.35]]],
        },
      },
    ],
  };

  function render(userLoc: LngLat | null, municipalBoundaries?: MapLineFC) {
    const props: ComponentProps<typeof AppMapSelectionSurfaces> = {
      dock: true, compactMapViewport: true, selectedDiscovery: null, selectedDiscoveryIndex: 0, discoveryDeckLength: 0,
      showDiscoveryAt: () => {}, selectedEvent: null, selected: null, rawSelectionContext: null,
      civicTown: { name: "Frederick", slug: "frederick", lng: -77.41, lat: 39.414 },
      selectedAerial: null, selectedCemetery: null, marcPeek: null, marcStations: [], spotSelection: null, spotContext: null,
      peekPlace: null, parkingPeek: null, foodTruckPeek: null, selectedTransitStop: null,
      eventGroup: null, userLoc, municipalBoundaries, utilityPoints: [], places: [], events: [], parking: [],
      clearMapSelection: () => {}, openPlaceSheet: () => {}, focusPlaceFromSpot: () => {}, focusEventFromGroup: () => {},
    };
    return html(createElement(AppMapSelectionSurfaces, props));
  }

  it("says You are in only for a device fix inside the town boundary", () => {
    const inside = render({ lng: -77.41, lat: 39.414 }, boundaries);
    expect(inside.querySelector(".map-peek-cat")?.textContent).toBe("You are in");
  });

  it("says Town for a fix outside, no fix, or no loaded boundary", () => {
    expect(render({ lng: -77.2, lat: 39.6 }, boundaries).querySelector(".map-peek-cat")?.textContent).toBe("Town");
    expect(render(null, boundaries).querySelector(".map-peek-cat")?.textContent).toBe("Town");
    expect(render({ lng: -77.41, lat: 39.414 }).querySelector(".map-peek-cat")?.textContent).toBe("Town");
  });

  it("never prints the old civic apology for a tapped town", () => {
    const peek = render(null, boundaries);
    expect(peek.textContent).not.toContain("Civic details are not available");
    expect(peek.textContent).toContain(frederick.name);
  });
});
