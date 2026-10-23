export const TRANSIT_ROUTE_FOCUS_EVENT = "fr:transit-route-focus";
export const TRANSIT_VEHICLE_FOCUS_EVENT = "fr:transit-vehicle-focus";
export const TRANSIT_STOP_FOCUS_EVENT = "fr:transit-stop-focus";
const TRANSIT_ROUTE_FOCUS_KEY = "fr:transit-route-focus:v1";
const TRANSIT_VEHICLE_FOCUS_KEY = "fr:transit-vehicle-focus:v1";
const TRANSIT_STOP_FOCUS_KEY = "fr:transit-stop-focus:v1";
export const TRANSIT_VEHICLE_POSITION_FRESH_MS = 40_000;

export type TransitRouteFocusDetail = {
  routeId: string;
};

/** Stop identity is resolved from the current GTFS catalog by each consumer.
 * External event payloads never supply a stop's coordinates or name. */
export type TransitStopFocusDetail = {
  stopId: string;
  /** Only the explicit map-preview action changes the rider's chosen stop. */
  selectForRider?: boolean;
};

export function isTransitStopFocusDetail(
  value: unknown,
): value is TransitStopFocusDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<TransitStopFocusDetail>;
  return (
    typeof detail.stopId === "string" &&
    detail.stopId.trim().length > 0 &&
    (detail.selectForRider === undefined || typeof detail.selectForRider === "boolean")
  );
}

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
  tripId?: string;
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
  expectedTripId,
  feedCurrent,
  nowMs,
}: {
  vehicles: readonly T[];
  vehicleId: string | undefined;
  expectedRouteId?: string;
  expectedTripId?: string;
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
  if (
    expectedTripId &&
    vehicle.tripId !== expectedTripId
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

/** One latest typed request is shared by the launcher and the lazy map. */
export type PendingTransitFocus =
  | { kind: "route"; detail: TransitRouteFocusDetail }
  | { kind: "stop"; detail: TransitStopFocusDetail }
  | { kind: "vehicle"; detail: TransitVehicleFocusDetail };

export function isTransitRouteFocusDetail(value: unknown): value is TransitRouteFocusDetail {
  return Boolean(value && typeof value === "object"
    && typeof (value as TransitRouteFocusDetail).routeId === "string"
    && (value as TransitRouteFocusDetail).routeId.trim());
}

// Window ownership avoids sharing a visitor's request with server renders or
// another document. A null value is an intentional tombstone: a failed storage
// removal must not resurrect an older request after this document consumed it.
const pendingByWindow = new WeakMap<Window, PendingTransitFocus | null>();
const FOCUS_KEYS = {
  route: TRANSIT_ROUTE_FOCUS_KEY,
  vehicle: TRANSIT_VEHICLE_FOCUS_KEY,
  stop: TRANSIT_STOP_FOCUS_KEY,
};

function copyIntent(intent: PendingTransitFocus): PendingTransitFocus {
  if (intent.kind === "route") return { kind: "route", detail: { routeId: intent.detail.routeId } };
  if (intent.kind === "stop") return { kind: "stop", detail: {
    stopId: intent.detail.stopId,
    ...(intent.detail.selectForRider == null ? {} : { selectForRider: intent.detail.selectForRider }),
  } };
  const detail = intent.detail;
  return { kind: "vehicle", detail: {
    vehicleId: detail.vehicleId,
    ...(detail.routeId == null ? {} : { routeId: detail.routeId }),
    bus: { lng: detail.bus.lng, lat: detail.bus.lat },
    stop: { lng: detail.stop.lng, lat: detail.stop.lat },
    ...(detail.stopId == null ? {} : { stopId: detail.stopId }),
    ...(detail.stopName == null ? {} : { stopName: detail.stopName }),
  } };
}

/** Retain without redispatching: the lazy launcher can capture direct events. */
export function retainPendingTransitFocus(intent: PendingTransitFocus): boolean {
  if (typeof window === "undefined") return false;
  if (!(intent?.kind === "route" ? isTransitRouteFocusDetail(intent.detail)
    : intent?.kind === "stop" ? isTransitStopFocusDetail(intent.detail)
      : intent?.kind === "vehicle" && isTransitVehicleFocusDetail(intent.detail))) return false;
  const safe = copyIntent(intent);
  pendingByWindow.set(window, safe);
  // All three old keys are kept for compatibility with a pending hard-navigation
  // request. In-memory ownership takes precedence if any storage operation fails.
  for (const key of Object.values(FOCUS_KEYS)) {
    try { window.sessionStorage.removeItem(key); } catch { /* Device storage can be blocked. */ }
  }
  try {
    window.sessionStorage.setItem(FOCUS_KEYS[safe.kind],
      safe.kind === "route" ? safe.detail.routeId : JSON.stringify(safe.detail));
  } catch { /* The typed in-memory request still survives a deferred mount. */ }
  return true;
}

/** Non-consuming; activation must leave the request for the actual map. */
export function peekPendingTransitFocus(): PendingTransitFocus | null {
  if (typeof window === "undefined") return null;
  if (pendingByWindow.has(window)) {
    const pending = pendingByWindow.get(window);
    return pending ? copyIntent(pending) : null;
  }
  try {
    const vehicleRaw = window.sessionStorage.getItem(TRANSIT_VEHICLE_FOCUS_KEY);
    if (vehicleRaw) {
      try {
        const detail: unknown = JSON.parse(vehicleRaw);
        if (isTransitVehicleFocusDetail(detail)) return copyIntent({ kind: "vehicle", detail });
      } catch { /* A corrupt older key does not hide a valid stop or route. */ }
    }
    const stopRaw = window.sessionStorage.getItem(TRANSIT_STOP_FOCUS_KEY);
    if (stopRaw) {
      try {
        const detail: unknown = JSON.parse(stopRaw);
        if (isTransitStopFocusDetail(detail)) return copyIntent({ kind: "stop", detail });
      } catch { /* A corrupt older key does not hide a valid route. */ }
    }
    const routeId = window.sessionStorage.getItem(TRANSIT_ROUTE_FOCUS_KEY);
    return isTransitRouteFocusDetail({ routeId }) ? { kind: "route", detail: { routeId: routeId! } } : null;
  } catch {
    return null;
  }
}

function clearPendingKind(kind: PendingTransitFocus["kind"]): void {
  if (typeof window === "undefined") return;
  if (pendingByWindow.get(window)?.kind === kind) pendingByWindow.set(window, null);
  try { window.sessionStorage.removeItem(FOCUS_KEYS[kind]); } catch { /* No device-storage requirement. */ }
}

function takePendingKind(kind: PendingTransitFocus["kind"]): PendingTransitFocus | null {
  const pending = peekPendingTransitFocus();
  if (!pending || pending.kind !== kind) {
    clearPendingKind(kind);
    return null;
  }
  pendingByWindow.set(window, null);
  for (const key of Object.values(FOCUS_KEYS)) {
    try { window.sessionStorage.removeItem(key); } catch { /* The tombstone prevents stale replay. */ }
  }
  return pending;
}

export function requestTransitRouteFocus(routeId: string): void {
  const intent = { kind: "route", detail: { routeId } } as const;
  if (!retainPendingTransitFocus(intent)) return;
  window.dispatchEvent(new CustomEvent<TransitRouteFocusDetail>(TRANSIT_ROUTE_FOCUS_EVENT, { detail: intent.detail }));
}

export function requestTransitVehicleFocus(detail: TransitVehicleFocusDetail): boolean {
  const intent = { kind: "vehicle", detail } as const;
  if (!retainPendingTransitFocus(intent)) return false;
  window.dispatchEvent(new CustomEvent<TransitVehicleFocusDetail>(TRANSIT_VEHICLE_FOCUS_EVENT, { detail: copyIntent(intent).detail as TransitVehicleFocusDetail }));
  return true;
}

export function requestTransitStopFocus(detail: TransitStopFocusDetail): boolean {
  const intent = { kind: "stop", detail } as const;
  if (!retainPendingTransitFocus(intent)) return false;
  window.dispatchEvent(new CustomEvent<TransitStopFocusDetail>(TRANSIT_STOP_FOCUS_EVENT, { detail: copyIntent(intent).detail as TransitStopFocusDetail }));
  return true;
}

export function takePendingTransitRouteFocus(): string | null {
  const pending = takePendingKind("route");
  return pending?.kind === "route" ? pending.detail.routeId : null;
}
export function takePendingTransitVehicleFocus(): TransitVehicleFocusDetail | null {
  const pending = takePendingKind("vehicle");
  return pending?.kind === "vehicle" ? pending.detail : null;
}
export function takePendingTransitStopFocus(): TransitStopFocusDetail | null {
  const pending = takePendingKind("stop");
  return pending?.kind === "stop" ? pending.detail : null;
}
export function clearPendingTransitRouteFocus(): void { clearPendingKind("route"); }
export function clearPendingTransitVehicleFocus(): void { clearPendingKind("vehicle"); }
export function clearPendingTransitStopFocus(): void { clearPendingKind("stop"); }
