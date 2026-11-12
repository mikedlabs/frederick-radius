import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapSpotPeek from "./MapSpotPeek";

type Props = ComponentProps<typeof MapSpotPeek>;
const spot = { lng: -77.41, lat: 39.414 };
const empty: Props["context"] = { place: null, parking: null, transit: null, event: null, road: null };
const ORIGIN = "Distances are measured from this spot.";

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(createElement(MapSpotPeek, {
    spot,
    context: empty,
    utilities: [],
    onClose: vi.fn(),
    onOpenPlace: vi.fn(),
    ...overrides,
  }));
}

describe("MapSpotPeek distance origin", () => {
  it("names the selected spot as the origin of every nearby distance", () => {
    const html = render({
      context: { ...empty, parking: { name: "Test Garage", lng: -77.411, lat: 39.414, available: null, distM: 90 } },
      utilities: [{ label: "Restroom", distM: 120 }],
    });
    expect(html).toContain("data-map-spot-distance-origin");
    expect(html).toContain(ORIGIN);
    expect(html.indexOf(ORIGIN)).toBeLessThan(html.indexOf("Test Garage"));
  });

  it("keeps the origin line on a temporary result that still lists nearby context", () => {
    expect(render({ temporary: true, utilities: [{ label: "Restroom", distM: 120 }] })).toContain(ORIGIN);
  });

  it("omits the origin line when there is no distance to explain", () => {
    expect(render()).not.toContain(ORIGIN);
  });
});
