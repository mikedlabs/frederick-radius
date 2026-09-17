import { describe, expect, it } from "vitest";
import { fairNearbyVehicles } from "./live-transit";
import type { LiveVehiclesSnap } from "@/components/transit/useLiveVehicles";

const now = Date.parse("2026-09-09T16:00:00Z");
const snapshot: LiveVehiclesSnap = {
  loaded: true, available: true, status: "ok", predictionsAvailable: false,
  fetchedAt: now, stale: false,
  vehicles: [{ vehicleId: "bus-1", lat: 39.4125, lng: -77.3943, timestamp: now / 1000 }],
};
describe("Fair live transit boundary", () => {
  it("shows only fresh positions inside the map arrival extent", () => {
    expect(fairNearbyVehicles(snapshot, now)).toHaveLength(1);
    for (const change of [
      { lat: 39.5 }, { lng: NaN }, { timestamp: undefined },
      { timestamp: now / 1000 - 121 }, { timestamp: now / 1000 + 31 },
    ]) {
      expect(fairNearbyVehicles({ ...snapshot, vehicles: [{ ...snapshot.vehicles[0], ...change }] }, now)).toEqual([]);
    }
  });
  it("withholds cached positions when the provider is unavailable or stale", () => {
    expect(fairNearbyVehicles({ ...snapshot, available: false }, now)).toEqual([]);
    expect(fairNearbyVehicles({ ...snapshot, stale: true }, now)).toEqual([]);
  });
});
