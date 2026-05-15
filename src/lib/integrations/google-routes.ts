/**
 * Google Routes API (computeRouteMatrix) — real walk / drive / transit times.
 *
 * Replaces straight-line haversine for the cases users actually feel:
 * "is it walkable", "how long to drive there". Gated on GOOGLE_PLACES_API_KEY
 * (same key — Routes API just needs enabling in the GCP console).
 *
 * Cost: Route Matrix is billed per element (origins × destinations). We
 * keep matrices tiny (1 origin × ≤25 destinations) and cache results.
 */

const URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export type TravelMode = "WALK" | "DRIVE" | "BICYCLE" | "TRANSIT";

export type TravelLeg = {
  destinationIndex: number;
  /** seconds */
  duration: number;
  /** meters */
  meters: number;
};

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

export function routesConfigured(): boolean {
  return Boolean(key());
}

type LatLng = { lat: number; lng: number };

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
        destinations: dests.map((d) => ({
          waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
        })),
        travelMode: mode,
        ...(mode === "DRIVE" ? { routingPreference: "TRAFFIC_AWARE" } : {}),
      }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[routes] HTTP ${res.status}`);
      return [];
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[routes] failed:", err);
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
