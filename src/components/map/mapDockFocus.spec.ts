// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { focusMapBeforeDockDismiss } from "./mapDockFocus";

afterEach(() => {
  document.body.replaceChildren();
});

function mapDockFixture({ canvas = true }: { canvas?: boolean } = {}) {
  const host = document.createElement("div");
  host.className = "dock-host";

  const mapCanvas = document.createElement("canvas");
  mapCanvas.className = "mapboxgl-canvas";
  mapCanvas.tabIndex = 0;
  if (canvas) host.append(mapCanvas);

  const dock = document.createElement("div");
  dock.dataset.mapDock = "true";
  const paneButton = document.createElement("button");
  paneButton.textContent = "Done";
  dock.append(paneButton);
  host.append(dock);
  document.body.append(host);

  return { dock, mapCanvas, paneButton };
}

describe("map dock focus handoff", () => {
  it("moves focus to the map before an open pane becomes hidden and inert", () => {
    const { dock, mapCanvas, paneButton } = mapDockFixture();
    paneButton.focus();
    expect(document.activeElement).toBe(paneButton);

    expect(focusMapBeforeDockDismiss(dock)).toBe(true);
    expect(document.activeElement).toBe(mapCanvas);

    dock.setAttribute("inert", "");
    dock.setAttribute("aria-hidden", "true");
    expect(dock.contains(document.activeElement)).toBe(false);
  });

  it("blurs focused dock content when the map canvas is unavailable", () => {
    const { dock, paneButton } = mapDockFixture({ canvas: false });
    paneButton.focus();

    expect(focusMapBeforeDockDismiss(dock)).toBe(true);
    expect(document.activeElement).not.toBe(paneButton);
  });

  it("does not steal focus that is already outside the dock", () => {
    const { dock, mapCanvas } = mapDockFixture();
    mapCanvas.focus();

    expect(focusMapBeforeDockDismiss(dock)).toBe(false);
    expect(document.activeElement).toBe(mapCanvas);
  });
});
