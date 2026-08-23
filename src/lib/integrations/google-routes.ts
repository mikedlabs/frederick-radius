/**
 * Google Routes API (computeRouteMatrix) — real walk / drive / transit times.
 *
 * Replaces straight-line haversine for the cases users actually feel:
 * "is it walkable", "how long to drive there". A dedicated Routes key is
 * preferred so its API restriction and quota can be isolated from Places;
 * the existing Places key remains a non-breaking fallback during rotation.
 *
 * Cost: Route Matrix is billed per element (origins × destinations). We
 * keep matrices tiny (1 origin × ≤25 destinations). Shared planning calls
 * are cached; consented device-origin calls deliberately are not.
 */

import { unstable_cache } from "next/cache";
import { meterUsage } from "@/lib/usage-meter";

const URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ROUTES_REQUEST_TIMEOUT_MS = 6_000;

export type TravelMode = "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";

export type TravelLeg = {
  destinationIndex: number;
  /** seconds */
  duration: number;
  /** meters */
  meters: number;
};

function key(): string | null {
  return (
    process.env.GOOGLE_ROUTES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    null
  );
}

export function routesConfigured(): boolean {
  return Boolean(key());
}

type LatLng = { lat: number; lng: number };

async function computeMatrixUncached(
  origin: LatLng,
  destinations: LatLng[],
  mode: TravelMode,
): Promise<TravelLeg[]> {
  const k = key();
  if (!k) throw new Error("Google Routes is not configured");

  // Meter at the upstream boundary so every count represents a Google call.
  // Shared callers reach this boundary only on cache misses; private callers
  // reach it after an explicit user action and are never persisted.
  meterUsage(
    mode === "DRIVE"
      ? "google_routes_matrix_pro"
      : "google_routes_matrix_essentials",
    destinations.length,
  );
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": k,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: [
        {
          waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        },
      ],
      destinations: destinations.map((d) => ({
        waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
      })),
      travelMode: mode,
      ...(mode === "DRIVE" ? { routingPreference: "TRAFFIC_AWARE" } : {}),
    }),
    // Travel time is a convenience, never a reason to hold a place sheet or a
    // serverless function open. Both walk and drive calls fail soft below.
    signal: AbortSignal.timeout(ROUTES_REQUEST_TIMEOUT_MS),
    // The caller owns any permitted caching. Device-origin requests pass
    // through here with no cache layer at all.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`[routes] HTTP ${res.status}`);
  }
  const rows = (await res.json()) as Array<{
    destinationIndex?: number;
    duration?: string; // e.g. "732s"
    distanceMeters?: number;
    condition?: string;
  }>;
  return rows
    .filter((r) => r.condition === "ROUTE_EXISTS" && r.duration)
    .map((r) => ({
      destinationIndex: r.destinationIndex ?? 0,
      duration: parseInt(String(r.duration).replace("s", ""), 10),
      meters: r.distanceMeters ?? 0,
    }))
    .sort((a, b) => a.destinationIndex - b.destinationIndex);
}

const computeMatrixCached = unstable_cache(
  computeMatrixUncached,
  ["google-routes-matrix-v1"],
  { revalidate: 3600 },
);

/**
 * One origin → many destinations, single mode. Returns legs sorted by
 * destinationIndex. Empty array if not configured or on error (callers
 * fall back to haversine).
 */
export async function computeMatrix(
  origin: LatLng,
  destinations: LatLng[],
  mode: TravelMode = "WALK"
): Promise<TravelLeg[]> {
  const k = key();
  if (!k || destinations.length === 0) return [];
  // Routes API caps matrix elements; 1×25 is safe and cheap.
  const dests = destinations.slice(0, 25);
  try {
    return await computeMatrixCached(origin, dests, mode);
  } catch (err) {
     
    console.error("[routes] failed:", err);
    return [];
  }
}

/**
 * User-specific route matrix. Unlike `computeMatrix`, this never enters
 * Next's persistent data cache: a consented device position is transient
 * request data, not a reusable application artifact.
 */
export async function computePrivateMatrix(
  origin: LatLng,
  destinations: LatLng[],
  mode: TravelMode = "WALK",
): Promise<TravelLeg[]> {
  if (!key() || destinations.length === 0) return [];
  try {
    return await computeMatrixUncached(origin, destinations.slice(0, 25), mode);
  } catch (err) {
    console.error("[routes] private matrix failed:", err);
    return [];
  }
}

/** Walk + drive minutes from origin to a single point. */
export async function travelTimes(
  origin: LatLng,
  dest: LatLng
): Promise<{ walkMin?: number; driveMin?: number }> {
  const [walk, drive] = await Promise.all([
    computeMatrix(origin, [dest], "WALK"),
    computeMatrix(origin, [dest], "DRIVE"),
  ]);
  return {
    walkMin: walk[0] ? Math.round(walk[0].duration / 60) : undefined,
    driveMin: drive[0] ? Math.round(drive[0].duration / 60) : undefined,
  };
}

/** Walk + drive minutes for a transient, user-specific origin. */
export async function privateTravelTimes(
  origin: LatLng,
  dest: LatLng,
): Promise<{ walkMin?: number; driveMin?: number }> {
  const [walk, drive] = await Promise.all([
    computePrivateMatrix(origin, [dest], "WALK"),
    computePrivateMatrix(origin, [dest], "DRIVE"),
  ]);
  return {
    walkMin: walk[0] ? Math.round(walk[0].duration / 60) : undefined,
    driveMin: drive[0] ? Math.round(drive[0].duration / 60) : undefined,
  };
}
