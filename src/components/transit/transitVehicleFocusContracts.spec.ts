import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("stop-to-bus map focus contracts", () => {
  it("offers tracking only through the shared current-vehicle resolver", () => {
    const source = readFileSync(
      "src/components/transit/TransitStopFinder.tsx",
      "utf8",
    );

    expect(source).toContain("useLiveVehicles()");
    expect(source).toContain("findCurrentTransitVehicle");
    expect(source).toContain("prediction.vehicleId");
    expect(source).toContain("Track on map");
    expect(source).toContain("requestTransitVehicleFocus");
    expect(source).toContain('"live-network-heading"');
  });

  it("frames the bus and stop before forwarding the exact vehicle to the map overlay", () => {
    const source = readFileSync(
      "src/components/transit/TransitMap.tsx",
      "utf8",
    );

    expect(source).toContain("TRANSIT_VEHICLE_FOCUS_EVENT");
    expect(source).toContain("frameVehicleAndStop");
    expect(source).toContain("detail.bus.lng");
    expect(source).toContain("detail.stop.lng");
    expect(source).toContain("focusVehicleId={vehicleFocus?.vehicleId}");
    expect(source).toContain('id="transit-rider-target-core"');
    expect(source).toContain("vehicleFocus.stopName");
  });

  it("opens an externally focused bus only from its own current feed", () => {
    const source = readFileSync(
      "src/components/map/LiveBuses.tsx",
      "utf8",
    );

    expect(source).toContain("focusVehicleId?: string");
    expect(source).toContain('feedCurrent: feedStatus === "ready"');
    expect(source).toContain("findCurrentTransitVehicle");
    expect(source).toContain("activeSelected");
    expect(source).toContain("SHAPES_BY_ROUTE");
  });
});
