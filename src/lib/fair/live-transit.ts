import type { LiveVehicle, LiveVehiclesSnap } from "@/components/transit/useLiveVehicles";

// The same visible arrival extent as the Fair map, not a claim of Fair service.
export function fairNearbyVehicles(snapshot: LiveVehiclesSnap, now = Date.now()): LiveVehicle[] {
  if (!snapshot.available || snapshot.stale || !snapshot.loaded) return [];
  return snapshot.vehicles.filter((vehicle) => {
    const age = now / 1000 - (vehicle.timestamp ?? 0);
    return Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng) &&
      vehicle.lng >= -77.405 && vehicle.lng <= -77.3825 &&
      vehicle.lat >= 39.395 && vehicle.lat <= 39.43 &&
      age >= -30 && age <= 120;
  });
}
