import { isValidCoord, type LngLat } from "@/lib/geo";

export type PlacementRejectionReason =
  | "missing-coordinate"
  | "invalid-coordinate"
  | "outside-county-area";

type CoordinateLike =
  | {
      lng?: unknown;
      lat?: unknown;
    }
  | null
  | undefined;

/**
 * Explain why a coordinate cannot enter the Frederick Radius catalog.
 *
 * This is deliberately separate from municipality assignment. A point must
 * first clear the real Frederick County outline (including the documented
 * 1.5 km straddle allowance) before a town label can be attached to it.
 */
export function placementRejectionReason(
  coordinate: CoordinateLike,
): PlacementRejectionReason | null {
  if (!coordinate) return "missing-coordinate";
  if (
    typeof coordinate.lng !== "number" ||
    typeof coordinate.lat !== "number" ||
    !Number.isFinite(coordinate.lng) ||
    !Number.isFinite(coordinate.lat)
  ) {
    return "invalid-coordinate";
  }
  return isValidCoord(coordinate as LngLat) ? null : "outside-county-area";
}

export type PlacementRejected<T> = {
  row: T;
  reason: PlacementRejectionReason;
};

/**
 * Lossless county partition for ingestion and review pipelines. Callers keep
 * both arrays: accepted rows may continue to municipality assignment or paid
 * enrichment; rejected rows remain available to an editor with a reason.
 */
export function partitionFrederickCountyRows<T>(
  rows: readonly T[],
  coordinateFor: (row: T) => CoordinateLike,
): {
  accepted: T[];
  rejected: Array<PlacementRejected<T>>;
} {
  const accepted: T[] = [];
  const rejected: Array<PlacementRejected<T>> = [];

  for (const row of rows) {
    const reason = placementRejectionReason(coordinateFor(row));
    if (reason) rejected.push({ row, reason });
    else accepted.push(row);
  }

  return { accepted, rejected };
}
