import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ParkingPin } from "@/lib/map/parking";
import MapParkingPeek from "./MapParkingPeek";

const pin: ParkingPin = {
  slug: "test-garage",
  name: "Test Garage",
  address: "1 Test St",
  lng: -77.41,
  lat: 39.414,
  available: null,
  percentFull: null,
  isClosed: false,
  isFull: false,
  isFilling: false,
  updated: null,
};

function render(userLoc: { lng: number; lat: number } | null) {
  return renderToStaticMarkup(createElement(MapParkingPeek, { pin, userLoc, onClose: vi.fn() }));
}

describe("MapParkingPeek distance", () => {
  it("names the device fix as the origin of the garage distance", () => {
    const html = render({ lng: -77.42, lat: 39.414 });
    expect(html).toMatch(/1 Test St · [^<]+ from you/);
    expect(html).not.toContain(" away");
  });

  it("prints no distance without a device fix", () => {
    const html = render(null);
    expect(html).toContain("1 Test St");
    expect(html).not.toContain("from you");
    expect(html).not.toContain(" away");
  });
});
