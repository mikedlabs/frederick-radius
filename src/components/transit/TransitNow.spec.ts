import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLiveVehicles = vi.hoisted(() => vi.fn());

vi.mock("./useLiveVehicles", () => ({
  useLiveVehicles: mockUseLiveVehicles,
}));

vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    state: { status: "idle" },
    request: vi.fn(),
    clear: vi.fn(),
  }),
}));

import TransitNow from "./TransitNow";
import type { LiveVehiclesSnap } from "./useLiveVehicles";

const EMPTY_MARC_BOARD = {
  stations: [],
  serviceToday: false,
};

function renderWith(snapshot: LiveVehiclesSnap): string {
  mockUseLiveVehicles.mockReturnValue(snapshot);
  return renderToStaticMarkup(
    createElement(TransitNow, { board: EMPTY_MARC_BOARD }),
  );
}

beforeEach(() => {
  mockUseLiveVehicles.mockReset();
});

describe("TransitNow live bus status", () => {
  it("explains when the provider is unavailable", () => {
    const html = renderWith({
      vehicles: [],
      loaded: true,
      available: false,
      status: "unavailable",
      predictionsAvailable: false,
      fetchedAt: 0,
      stale: false,
    });

    expect(html).toContain("Live bus positions are unavailable.");
    expect(html).not.toContain("No buses are reporting right now.");
  });

  it("uses a distinct message for an available feed with no reporting buses", () => {
    const html = renderWith({
      vehicles: [],
      loaded: true,
      available: true,
      status: "ok",
      predictionsAvailable: true,
      feedTimestamp: 1_785_000_123,
      fetchedAt: 1_785_000_123_000,
      stale: false,
    });

    expect(html).toContain("No buses are reporting right now.");
    expect(html).not.toContain("Live bus positions are unavailable.");
  });

  it("keeps vehicle positions useful while stating that predictions are degraded", () => {
    const html = renderWith({
      vehicles: [
        {
          vehicleId: "bus-15",
          routeId: "9349",
          lat: 39.414,
          lng: -77.411,
        },
      ],
      loaded: true,
      available: true,
      status: "degraded",
      predictionsAvailable: false,
      feedTimestamp: 1_785_000_456,
      fetchedAt: 1_785_000_456_000,
      stale: false,
    });

    expect(html).toContain("1 reporting now");
    expect(html).toContain(
      "Positions are live. Arrival estimates are unavailable.",
    );
    expect(html).not.toContain("Live bus positions are unavailable.");
    expect(html).not.toContain("Buses moving now");
  });
});
