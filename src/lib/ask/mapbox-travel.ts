import "server-only";

import type { LngLat } from "@/lib/geo";
import {
  getMapboxTravelMatrix,
  type MapboxMatrixProfile,
  type MapboxMatrixResponse,
} from "@/lib/integrations/mapboxMatrix";

export const ASK_TRAVEL_MODES = ["walking", "driving", "cycling"] as const;

export type AskTravelMode = (typeof ASK_TRAVEL_MODES)[number];

export type AskTravelCandidate = {
  slug: string;
  name: string;
  geom: LngLat;
};

export type AskTravelTime = {
  slug: string;
  name: string;
  mode: AskTravelMode;
  minutes: number;
  distanceMeters: number | null;
  label: string;
};

export type AskTravelTimesResult =
  | {
      available: true;
      mode: AskTravelMode;
      routes: AskTravelTime[];
    }
  | {
      available: false;
      mode: AskTravelMode;
      reason: string;
      routes: [];
    };

type MatrixLookup = (
  input: unknown,
  options?: { timeoutMs?: number },
) => Promise<MapboxMatrixResponse>;

export function mapboxProfileForAskTravel(
  mode: AskTravelMode,
): MapboxMatrixProfile {
  return mode === "driving" ? "driving-traffic" : mode;
}

export function formatAskTravelTime(
  mode: AskTravelMode,
  minutes: number,
): string {
  const noun =
    mode === "walking" ? "walk" : mode === "cycling" ? "bike" : "drive";
  return `${minutes} min ${noun}`;
}

export function shortlistAskTravelCandidates(
  candidates: AskTravelCandidate[],
): AskTravelCandidate[] {
  const unique: AskTravelCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    unique.push(candidate);
    if (unique.length === 9) break;
  }
  return unique;
}

/**
 * Compare only the Radius candidates the agent has already retrieved.
 *
 * Mapbox refines a grounded shortlist; it never discovers or substitutes a
 * place. The shared Matrix integration privacy-rounds the origin, enforces the
 * Frederick County boundary, meters usage, and fails soft when routing is
 * disabled or unavailable.
 */
export async function getAskTravelTimes(
  {
    origin,
    candidates,
    mode,
    timeoutMs = 2_300,
  }: {
    origin: LngLat;
    candidates: AskTravelCandidate[];
    mode: AskTravelMode;
    timeoutMs?: number;
  },
  matrixLookup: MatrixLookup = getMapboxTravelMatrix,
): Promise<AskTravelTimesResult> {
  const shortlisted = shortlistAskTravelCandidates(candidates);
  if (shortlisted.length < 2) {
    return {
      available: false,
      mode,
      reason: "not-enough-grounded-candidates",
      routes: [],
    };
  }

  const matrix = await matrixLookup(
    {
      profile: mapboxProfileForAskTravel(mode),
      origin,
      destinations: shortlisted.map((candidate) => candidate.geom),
    },
    { timeoutMs },
  );
  if (!matrix.ok) {
    return {
      available: false,
      mode,
      reason: matrix.reason,
      routes: [],
    };
  }

  const routes = matrix.legs
    .flatMap((leg): AskTravelTime[] => {
      const candidate = shortlisted[leg.destinationIndex];
      if (!candidate || !leg.reachable || leg.minutes == null) return [];
      return [
        {
          slug: candidate.slug,
          name: candidate.name,
          mode,
          minutes: leg.minutes,
          distanceMeters: leg.distanceMeters,
          label: formatAskTravelTime(mode, leg.minutes),
        },
      ];
    })
    .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name));

  if (routes.length === 0) {
    return {
      available: false,
      mode,
      reason: "no-routed-candidates",
      routes: [],
    };
  }

  return { available: true, mode, routes };
}
