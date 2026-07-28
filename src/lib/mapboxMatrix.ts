import type { LngLat, TravelMode } from "@/lib/geo";
import { roundCoord } from "@/lib/walkTime";

/**
 * Mapbox's traffic-aware Matrix profile accepts at most 10 coordinates.
 * One is the origin, leaving nine destinations. We use the same bounded
 * shape for every mode so the client has one predictable contract.
 */
export const MATRIX_MIN_DESTINATIONS = 2;
export const MATRIX_MAX_DESTINATIONS = 9;

export type MatrixTravelMode = Extract<TravelMode, "walk" | "bike" | "drive">;

export type MatrixDestination = {
  id: string;
  lng: number;
  lat: number;
};

export type MatrixEtaSuccess = {
  ok: true;
  mode: MatrixTravelMode;
  durations: Record<string, number>;
};

export type MatrixEtaFailure = {
  ok: false;
  reason: string;
};

export type MatrixEtaResponse = MatrixEtaSuccess | MatrixEtaFailure;

const DESTINATION_ID = /^[A-Za-z0-9:_.-]{1,96}$/;

export function isMatrixTravelMode(
  value: string,
): value is MatrixTravelMode {
  return value === "walk" || value === "bike" || value === "drive";
}

/**
 * Repeated `d` parameters keep the public request compact and preserve the
 * shortlist's deterministic order: `d=place:slug,-77.41,39.41`.
 */
export function parseMatrixDestination(
  value: string,
): MatrixDestination | null {
  const [id, lngRaw, latRaw, ...extra] = value.split(",");
  if (
    extra.length > 0 ||
    !id ||
    !DESTINATION_ID.test(id) ||
    lngRaw === undefined ||
    latRaw === undefined
  ) {
    return null;
  }
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { id, lng, lat };
}

/**
 * Build the client request with a ~100m origin, never the exact device fix.
 * Callers pass an already bounded, stable shortlist; this helper defensively
 * de-duplicates IDs and enforces the server's nine-destination ceiling too.
 */
export function matrixEtaQuery(
  origin: LngLat,
  mode: MatrixTravelMode,
  destinations: MatrixDestination[],
): string {
  const params = new URLSearchParams({
    olng: String(roundCoord(origin.lng)),
    olat: String(roundCoord(origin.lat)),
    mode,
  });
  const seen = new Set<string>();
  for (const destination of destinations) {
    if (seen.has(destination.id)) continue;
    if (
      !DESTINATION_ID.test(destination.id) ||
      !Number.isFinite(destination.lng) ||
      !Number.isFinite(destination.lat)
    ) {
      continue;
    }
    seen.add(destination.id);
    params.append(
      "d",
      `${destination.id},${destination.lng},${destination.lat}`,
    );
    if (seen.size === MATRIX_MAX_DESTINATIONS) break;
  }
  return params.toString();
}
