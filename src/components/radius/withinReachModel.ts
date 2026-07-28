import {
  MATRIX_MAX_DESTINATIONS,
  type MatrixDestination,
} from "@/lib/mapboxMatrix";

export type ReachMatrixCandidate = MatrixDestination & {
  distanceMeters: number;
};

export type ReachTimeItem = {
  matrixId: string;
  minutes: number;
};

/**
 * Pick the same small candidate set when only the radius minutes change.
 * The nearest representative for each visible kind comes in here; a
 * distance/id sort makes the final nine deterministic and cache-friendly.
 */
export function shortlistReachMatrixDestinations(
  candidates: ReachMatrixCandidate[],
): MatrixDestination[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((candidate) => {
      if (
        seen.has(candidate.id) ||
        !Number.isFinite(candidate.distanceMeters) ||
        candidate.distanceMeters < 0
      ) {
        return false;
      }
      seen.add(candidate.id);
      return true;
    })
    .sort(
      (a, b) =>
        a.distanceMeters - b.distanceMeters ||
        a.id.localeCompare(b.id, "en"),
    )
    .slice(0, MATRIX_MAX_DESTINATIONS)
    .map(({ id, lng, lat }) => ({ id, lng, lat }));
}

export function routedMinutesFor(
  durations: Record<string, number>,
  matrixId: string,
): number | null {
  const value = durations[matrixId];
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function formatReachMinutes(
  fallbackMinutes: number,
  routedMinutes: number | null,
): string {
  return routedMinutes === null
    ? `~${fallbackMinutes}m`
    : `${routedMinutes}m`;
}

/** Matrix-backed ranking when available; the straight-line estimate remains
 * the deterministic fallback for missing/unroutable cells. */
export function sortReachByTravelTime<T extends ReachTimeItem>(
  items: T[],
  durations: Record<string, number>,
): T[] {
  return [...items].sort((a, b) => {
    const aRouted = routedMinutesFor(durations, a.matrixId);
    const bRouted = routedMinutesFor(durations, b.matrixId);
    const aMinutes = aRouted ?? a.minutes;
    const bMinutes = bRouted ?? b.minutes;
    return (
      aMinutes - bMinutes ||
      Number(aRouted === null) - Number(bRouted === null) ||
      a.matrixId.localeCompare(b.matrixId, "en")
    );
  });
}
