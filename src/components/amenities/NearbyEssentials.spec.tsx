import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Amenity } from "@/lib/loaders/amenities";

const mockUseGeolocation = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: mockUseGeolocation,
}));

import NearbyEssentials from "./NearbyEssentials";

const points: Amenity[] = [
  {
    id: "trash-near",
    kind: "trash",
    name: "Carroll Creek trash can",
    municipality: "frederick",
    lat: 39.4144,
    lng: -77.4106,
  },
];

beforeEach(() => {
  mockUseGeolocation.mockReset();
});

describe("NearbyEssentials", () => {
  it("keeps the cold state short and does not request location during render", () => {
    const requestHighAccuracy = vi.fn();
    mockUseGeolocation.mockReturnValue({
      state: { status: "idle" },
      requestHighAccuracy,
    });

    const html = renderToStaticMarkup(
      createElement(NearbyEssentials, { points }),
    );

    expect(html).toContain("Tap what you need.");
    expect(html).toContain("Radius asks for location only after you choose.");
    expect(requestHighAccuracy).not.toHaveBeenCalled();
  });

  it("shows one actionable nearest result from a consented location", () => {
    mockUseGeolocation.mockReturnValue({
      state: {
        status: "granted",
        position: {
          lat: 39.4143,
          lng: -77.4105,
          accuracy: 12,
          timestamp: Date.now(),
        },
      },
      requestHighAccuracy: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(NearbyEssentials, {
        points,
        initialNeed: "trash",
      }),
    );

    expect(html).toContain("Closest mapped");
    expect(html).toContain("Carroll Creek trash can");
    expect(html).toContain("Walk there");
    expect(html).toContain("amenity=trash");
  });

  it("does not present a distant county point as a nearby walking answer", () => {
    mockUseGeolocation.mockReturnValue({
      state: {
        status: "granted",
        position: {
          lat: 39.7,
          lng: -77.6,
          accuracy: 15,
          timestamp: Date.now(),
        },
      },
      requestHighAccuracy: vi.fn(),
    });

    const html = renderToStaticMarkup(
      createElement(NearbyEssentials, {
        points,
        initialNeed: "trash",
      }),
    );

    expect(html).toContain("No trash can is mapped close by.");
    expect(html).toContain("The closest known point is");
    expect(html).not.toContain("Walk there");
  });
});
