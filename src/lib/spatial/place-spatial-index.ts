import "server-only";
import { getSql } from "@/lib/db/client";
import type { LngLat } from "@/lib/geo";
import { spatialCatalogSnapshot } from "@/lib/spatial/place-catalog";
import { roundCoord } from "@/lib/walkTime";

export type PostgisNearbyMode = "off" | "shadow" | "on";

type SpatialDistanceRow = {
  catalog_current: boolean;
  slug: string | null;
  distance_m: number | string | null;
};

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

export const POSTGIS_NEARBY_TIMEOUT_MS = 900;

export function postgisNearbyMode(
  raw = process.env.RADIUS_POSTGIS_NEARBY,
): PostgisNearbyMode {
  const value = raw?.trim().toLowerCase();
  if (value === "shadow") return "shadow";
  if (value === "1" || value === "on" || value === "true") return "on";
  return "off";
}

async function beforeDeadline<T>(
  pending: CancellablePromiseLike<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = Promise.resolve(pending).then(
    (value) => ({ status: "ok" as const, value }),
    () => ({ status: "failed" as const }),
  );
  const timed = new Promise<{ status: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });

  try {
    const outcome = await Promise.race([guarded, timed]);
    if (outcome.status === "timeout") {
      try {
        pending.cancel?.();
      } catch {
        // Cancellation is best-effort; guarded still consumes a late rejection.
      }
      return null;
    }
    return outcome.status === "ok" ? outcome.value : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isRoundedOrigin(origin: LngLat): boolean {
  return (
    Number.isFinite(origin.lng) &&
    Number.isFinite(origin.lat) &&
    origin.lng >= -180 &&
    origin.lng <= 180 &&
    origin.lat >= -90 &&
    origin.lat <= 90 &&
    roundCoord(origin.lng) === origin.lng &&
    roundCoord(origin.lat) === origin.lat
  );
}

/**
 * Return exact PostGIS distances for every canonical place inside the requested
 * radius. A matching sync checksum is mandatory. Missing credentials, a stale
 * mirror, a timeout, or malformed rows all return null so callers preserve the
 * current Haversine behavior.
 */
export async function postgisNearbyPlaceDistances(
  origin: LngLat,
  radiusM: number,
): Promise<Map<string, number> | null> {
  const sql = getSql();
  if (!sql || !isRoundedOrigin(origin)) return null;
  const boundedRadius = Math.max(500, Math.min(80_000, Math.floor(radiusM)));
  const catalog = spatialCatalogSnapshot();

  const pending = sql<SpatialDistanceRow[]>`
    with mirror_state as (
      select exists (
        select 1
        from public.place_spatial_sync_state
        where catalog_key = ${catalog.key}
          and catalog_hash = ${catalog.hash}
          and place_count = ${catalog.count}
      ) as catalog_current
    ),
    query_origin as (
      select extensions.st_setsrid(
        extensions.st_makepoint(${origin.lng}, ${origin.lat}),
        4326
      )::extensions.geography as location
    )
    select
      mirror_state.catalog_current,
      nearby.slug,
      nearby.distance_m
    from mirror_state
    left join lateral (
      select
        place.slug,
        extensions.st_distance(
          place.location,
          query_origin.location
        )::double precision as distance_m
      from public.places as place
      cross join query_origin
      where mirror_state.catalog_current
        and place.status = 'active'
        and place.deleted_at is null
        and extensions.st_dwithin(
          place.location,
          query_origin.location,
          ${boundedRadius}
        )
      order by
        place.location OPERATOR(extensions.<->) query_origin.location,
        place.slug
    ) as nearby on true
  `;
  const rows = await beforeDeadline(pending, POSTGIS_NEARBY_TIMEOUT_MS);
  if (!rows?.[0]?.catalog_current) return null;

  const distances = new Map<string, number>();
  for (const row of rows) {
    if (row.slug === null || row.distance_m === null) continue;
    const distance = Number(row.distance_m);
    if (
      !Number.isFinite(distance) ||
      distance < 0 ||
      distance > boundedRadius + 1
    ) {
      return null;
    }
    distances.set(row.slug, distance);
  }
  return distances;
}
