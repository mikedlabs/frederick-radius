import { after, NextResponse } from "next/server";
import { DEFAULT_NEARBY_RADIUS_M, nearbyNow } from "@/lib/connect";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import {
  postgisNearbyMode,
  postgisNearbyPlaceDistances,
} from "@/lib/spatial/place-spatial-index";
import { roundCoord } from "@/lib/walkTime";
import { clientPlacesWithinRadius } from "@/lib/loaders/places-client";
import {
  loadLivePlaceEvidence,
  MAX_LIVE_PLACE_EVIDENCE_SLUGS,
} from "@/lib/loaders/livePlaceEvidence";

/**
 * GET /api/nearby?lng=&lat=&limit=&radiusM=
 *
 * Server-side join: given the user's position, return the typed
 * NearbyContext (resolved municipality, civic anchors, open places,
 * live + upcoming events nearest first). NearbyNow used to call
 * `nearbyNow()` directly on the client, which pulled
 * lib/connect → places-client.json (~2MB) into the /now route's
 * client bundle. This endpoint moves that join to the edge.
 *
 * Result is time-sensitive (open hours, live events), so caching is
 * short — s-maxage=60 with SWR=300 lets the edge collapse repeat
 * pings within a minute while staying fresh.
 *
 * Inputs are bounded so a malformed client can't blow up the index:
 *   - lng in [-180, 180], lat in [-90, 90]
 *   - limit clamped to [1, 24]
 *   - radiusM clamped to [500, 80_000] (half-mile to ~50mi)
 */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (await isRateLimited(request, "nearby", 120, 60)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const url = new URL(request.url);
  const lngRaw = url.searchParams.get("lng");
  const latRaw = url.searchParams.get("lat");
  // Number(null) and Number("") are both 0. Without checking the raw values
  // first, a request missing either required coordinate was accepted as (0,0)
  // and returned a confident-looking empty Frederick result.
  const lng = lngRaw?.trim() ? Number(lngRaw) : NaN;
  const lat = latRaw?.trim() ? Number(latRaw) : NaN;

  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return NextResponse.json(
      { error: "lng and lat are required and must be finite coordinates" },
      { status: 400 },
    );
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? 6);
  const limit = Number.isFinite(limitRaw) ? clamp(Math.floor(limitRaw), 1, 24) : 6;

  const radiusRaw = Number(url.searchParams.get("radiusM") ?? NaN);
  const radiusM = Number.isFinite(radiusRaw)
    ? clamp(Math.floor(radiusRaw), 500, 80_000)
    : undefined;

  // Legitimate clients already snap before sending. Re-round here so a
  // handcrafted request cannot make an exact location part of the response
  // or explode the public edge-cache key space.
  const approximateOrigin = { lng: roundCoord(lng), lat: roundCoord(lat) };
  if (lng !== approximateOrigin.lng || lat !== approximateOrigin.lat) {
    const canonical = new URL(request.url);
    canonical.searchParams.set("lng", String(approximateOrigin.lng));
    canonical.searchParams.set("lat", String(approximateOrigin.lat));
    return NextResponse.redirect(canonical, {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const now = new Date();
  const effectiveRadiusM = radiusM ?? DEFAULT_NEARBY_RADIUS_M;
  const baseOptions = {
    now,
    limit,
    ...(radiusM ? { radiusM } : {}),
  };
  const mode = postgisNearbyMode();
  // Start the current-evidence read while the optional PostGIS lookup runs.
  // Haversine is sufficient for choosing the bounded candidate set; PostGIS
  // remains authoritative for final distances when its verified mirror is on.
  const evidenceCandidates = clientPlacesWithinRadius(
    approximateOrigin,
    effectiveRadiusM,
  )
    .slice(0, MAX_LIVE_PLACE_EVIDENCE_SLUGS)
    .map((place) => place.slug);
  const evidencePromise = loadLivePlaceEvidence(evidenceCandidates);
  let distances: Map<string, number> | null = null;

  if (mode === "on") {
    distances = await postgisNearbyPlaceDistances(
      approximateOrigin,
      effectiveRadiusM,
    );
  }
  const placeEvidence = await evidencePromise;
  const ctx = nearbyNow(approximateOrigin, {
    ...baseOptions,
    ...(distances ? { placeDistances: distances } : {}),
    placeEvidence,
  });

  if (mode === "shadow") {
    // Shadow work cannot change the response or add latency. It records only
    // aggregate parity—never the query origin, place slugs, or raw distances.
    after(async () => {
      const distances = await postgisNearbyPlaceDistances(
        approximateOrigin,
        effectiveRadiusM,
      );
      if (!distances) {
        console.info("[postgis-nearby-shadow]", {
          available: false,
          baselinePlaceCount: ctx.openPlaces.length,
        });
        return;
      }
      const shadow = nearbyNow(approximateOrigin, {
        ...baseOptions,
        placeDistances: distances,
        placeEvidence,
      });
      const baselinePlaces = ctx.openPlaces;
      const shadowPlaces = shadow.openPlaces;
      const shadowBySlug = new Map(
        shadowPlaces.map((place) => [place.slug, place.distance_m]),
      );
      const distanceDeltas = baselinePlaces.flatMap((place) => {
        const shadowDistance = shadowBySlug.get(place.slug);
        return typeof place.distance_m === "number" &&
          typeof shadowDistance === "number"
          ? [Math.abs(place.distance_m - shadowDistance)]
          : [];
      });
      console.info("[postgis-nearby-shadow]", {
        available: true,
        baselinePlaceCount: baselinePlaces.length,
        shadowPlaceCount: shadowPlaces.length,
        sameFirstPlace:
          (baselinePlaces[0]?.slug ?? null) ===
          (shadowPlaces[0]?.slug ?? null),
        samePlaceOrder:
          baselinePlaces.map((place) => place.slug).join("\0") ===
          shadowPlaces.map((place) => place.slug).join("\0"),
        maxDistanceDeltaM:
          distanceDeltas.length > 0 ? Math.max(...distanceDeltas) : null,
      });
    });
  }

  return NextResponse.json(ctx, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
