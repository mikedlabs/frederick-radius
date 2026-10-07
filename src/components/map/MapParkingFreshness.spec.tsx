// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppMapSelectionSurfaces from "./AppMapSelectionSurfaces";
import type { ParkingPin } from "@/lib/map/parking";

const garage: ParkingPin = {
  slug: "test-garage", name: "Test garage", address: "123 East Street", lng: -77.41, lat: 39.41,
  available: 12, percentFull: 40, isClosed: false, isFull: false, isFilling: false, updated: "2026-10-06T20:00:00Z",
};
function render(parking: ParkingPin[], health: ComponentProps<typeof AppMapSelectionSurfaces>["parkingSourceHealth"]) {
  const props: ComponentProps<typeof AppMapSelectionSurfaces> = {
    dock: true, compactMapViewport: false, selectedDiscovery: null, selectedDiscoveryIndex: 0, discoveryDeckLength: 0,
    showDiscoveryAt: () => {}, selectedEvent: null, selected: null, rawSelectionContext: null, civicTown: null,
    selectedAerial: null, selectedCemetery: null, marcPeek: null, marcStations: [], spotSelection: null, spotContext: null,
    peekPlace: null, parkingPeek: garage, parkingSourceHealth: health, foodTruckPeek: null, selectedTransitStop: null,
    eventGroup: null, userLoc: null, utilityPoints: [], places: [], events: [], parking,
    clearMapSelection: () => {}, openPlaceSheet: () => {}, focusPlaceFromSpot: () => {}, focusEventFromGroup: () => {},
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(AppMapSelectionSurfaces, props));
  return container;
}

describe("current and retained parking selection evidence", () => {
  it("updates an already-selected garage from its current layer pin", () => {
    const fresh = render([{ ...garage, available: 25 }], { status: "current", unavailable: [] });
    expect(fresh.textContent).toContain("25 spaces open");
    expect(fresh.textContent).not.toContain("12 spaces open");
    expect(fresh.textContent).not.toContain("Last report:");
    expect(fresh.querySelector(".map-peek-meta span")?.getAttribute("style")).toContain("var(--app-positive)");
  });

  it("labels old availability as a last report with neutral styling and usable directions", () => {
    const old = render([garage], { status: "partial", unavailable: ["City parking"], stale: true, asOf: garage.updated! });
    expect(old.textContent).toContain("Last report: 12 spaces open");
    expect(old.textContent).toContain("Current parking availability is unverified.");
    expect(old.querySelector(".map-peek-meta span")?.getAttribute("style")).toContain("var(--app-ink-3)");
    expect(old.textContent).toContain(garage.address);
    expect(old.querySelector("a")?.getAttribute("href")).toContain("39.41");
    expect(old.querySelector("a")?.getAttribute("href")).toContain("-77.41");
  });

  it("does not keep claiming the old count when a confirmed fresh layer no longer has the garage", () => {
    const missing = render([], { status: "current", unavailable: [] });
    expect(missing.textContent).toContain("Live spaces not reported");
    expect(missing.textContent).not.toContain("12 spaces open");
    expect(missing.textContent).toContain(garage.address);
    expect(missing.querySelector("a")?.textContent).toContain("Directions");
  });
});
