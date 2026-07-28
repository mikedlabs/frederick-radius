export const TRANSIT_ROUTE_FOCUS_EVENT = "fr:transit-route-focus";
export const TRANSIT_VEHICLE_FOCUS_EVENT = "fr:transit-vehicle-focus";
const TRANSIT_ROUTE_FOCUS_KEY = "fr:transit-route-focus:v1";
const TRANSIT_VEHICLE_FOCUS_KEY = "fr:transit-vehicle-focus:v1";
export const TRANSIT_VEHICLE_POSITION_FRESH_MS = 40_000;

export type TransitRouteFocusDetail = {
  routeId: string;
};

export type TransitFocusPoint = {
  lng: number;
  lat: number;
};

export type TransitVehicleFocusDetail = {
  vehicleId: string;
  routeId?: string;
  bus: TransitFocusPoint;
  stop: TransitFocusPoint;
  stopId?: string;
  stopName?: string;
};

export type TransitVehiclePosition = TransitFocusPoint & {
  vehicleId: string;
  routeId?: string;
  timestamp?: number;
};

function isPoint(value: unknown): value is TransitFocusPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<TransitFocusPoint>;
  return (
    typeof point.lng === "number" &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180 &&
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90
  );
}

export function isTransitVehicleFocusDetail(
  value: unknown,
): value is TransitVehicleFocusDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<TransitVehicleFocusDetail>;
  return (
    typeof detail.vehicleId === "string" &&
    detail.vehicleId.trim().length > 0 &&
    (detail.routeId == null ||
      (typeof detail.routeId === "string" &&
        detail.routeId.trim().length > 0)) &&
    (detail.stopId == null ||
      (typeof detail.stopId === "string" &&
        detail.stopId.trim().length > 0)) &&
    (detail.stopName == null ||
      (typeof detail.stopName === "string" &&
        detail.stopName.trim().length > 0)) &&
    isPoint(detail.bus) &&
    isPoint(detail.stop)
  );
}

/**
 * Resolve an arrival's exact vehicle only while the shared vehicle snapshot
 * and the individual reported position are current. A missing per-vehicle
 * timestamp falls back to the already-vetted feed-level freshness.
 */
export function findCurrentTransitVehicle<
  T extends TransitVehiclePosition,
>({
  vehicles,
  vehicleId,
  expectedRouteId,
  feedCurrent,
  nowMs,
}: {
  vehicles: readonly T[];
  vehicleId: string | undefined;
  expectedRouteId?: string;
  feedCurrent: boolean;
  nowMs: number;
}): T | null {
  if (!vehicleId || !feedCurrent || !Number.isFinite(nowMs) || nowMs <= 0) {
    return null;
  }
  const vehicle = vehicles.find(
    (candidate) => candidate.vehicleId === vehicleId,
  );
  if (!vehicle || !isPoint(vehicle)) return null;
  if (
    expectedRouteId &&
    vehicle.routeId &&
    vehicle.routeId !== expectedRouteId
  ) {
    return null;
  }
  if (vehicle.timestamp != null) {
    if (!Number.isFinite(vehicle.timestamp) || vehicle.timestamp <= 0) {
      return null;
    }
    const timestampMs =
      vehicle.timestamp > 1_000_000_000_000
        ? vehicle.timestamp
        : vehicle.timestamp * 1000;
    const age = nowMs - timestampMs;
    if (
      age > TRANSIT_VEHICLE_POSITION_FRESH_MS ||
      age < -TRANSIT_VEHICLE_POSITION_FRESH_MS
    ) {
      return null;
    }
  }
  return vehicle;
}

/**
 * The route finder can hydrate before the deferred Mapbox chunk. Keep one
 * pending selection in session storage as well as dispatching the live event,
 * so a tap made during that gap is not lost.
 */
export function requestTransitRouteFocus(routeId: string): void {
  clearPendingTransitVehicleFocus();
  try {
    window.sessionStorage.setItem(TRANSIT_ROUTE_FOCUS_KEY, routeId);
  } catch {
    // The live event still works when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<TransitRouteFocusDetail>(TRANSIT_ROUTE_FOCUS_EVENT, {
      detail: { routeId },
    }),
  );
}

/**
 * Dispatch a typed same-page vehicle handoff and retain one pending request
 * for the deferred Mapbox chunk. Invalid coordinates never reach the map.
 */
export function requestTransitVehicleFocus(
  detail: TransitVehicleFocusDetail,
): boolean {
  if (!isTransitVehicleFocusDetail(detail)) return false;
  clearPendingTransitRouteFocus();
  try {
    window.sessionStorage.setItem(
      TRANSIT_VEHICLE_FOCUS_KEY,
      JSON.stringify(detail),
    );
  } catch {
    // The live event still works when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<TransitVehicleFocusDetail>(
      TRANSIT_VEHICLE_FOCUS_EVENT,
      { detail },
    ),
  );
  return true;
}

export function takePendingTransitRouteFocus(): string | null {
  try {
    const routeId = window.sessionStorage.getItem(TRANSIT_ROUTE_FOCUS_KEY);
    window.sessionStorage.removeItem(TRANSIT_ROUTE_FOCUS_KEY);
    return routeId;
  } catch {
    return null;
  }
}

export function takePendingTransitVehicleFocus(): TransitVehicleFocusDetail | null {
  try {
    const raw = window.sessionStorage.getItem(TRANSIT_VEHICLE_FOCUS_KEY);
    window.sessionStorage.removeItem(TRANSIT_VEHICLE_FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isTransitVehicleFocusDetail(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingTransitRouteFocus(): void {
  try {
    window.sessionStorage.removeItem(TRANSIT_ROUTE_FOCUS_KEY);
  } catch {
    // No action required.
  }
}

export function clearPendingTransitVehicleFocus(): void {
  try {
    window.sessionStorage.removeItem(TRANSIT_VEHICLE_FOCUS_KEY);
  } catch {
    // No action required.
  }
}
