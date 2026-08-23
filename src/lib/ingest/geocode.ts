import type { Sql } from "postgres";
import { normalizeForCache } from "./location";
import { PLACES } from "@/data/places";
import { isValidCoord, type LngLat } from "@/lib/geo";
import { meterUsage, reserveDailyUsage } from "@/lib/usage-meter";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const RATE_DELAY_MS = 120;
const GEOCODE_TIMEOUT_MS = 8_000;
const GEOCODE_CALL_BUDGET_MS = GEOCODE_TIMEOUT_MS + RATE_DELAY_MS + 500;
const GEOCODE_ROUTE_RESERVE_MS = 5_000;
const GOOGLE_GEOCODE_DEFAULT_DAILY_CAP = 50;
const GOOGLE_GEOCODE_MAX_DAILY_CAP = 100;

export const VERIFIED_GOOGLE_CACHE_SOURCE = "google-verified-v1";
export const VERIFIED_CATALOG_CACHE_SOURCE = "catalog-verified-v1";

export type GeocodeDegradedReason =
  | GoogleGeocodeSystemReason
  | "disabled"
  | "route-budget";

export type GeocodeStats = {
  fromCache: number;
  fromApi: number;
  failed: number;
  seeded: number;
  revalidated: number;
  repaired: number;
  cleared: number;
  status: "ok" | "degraded";
  degradedReason?: GeocodeDegradedReason;
  upstreamStatus?: number | string;
  budgetStopped: number;
};

export type GeocodePendingOptions = {
  deadlineAt?: number;
};

export function geocodeLimitForRemaining(
  remainingMs: number,
  requestedLimit: number,
): number {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(requestedLimit)) return 0;
  const usableMs = Math.max(0, remainingMs - GEOCODE_ROUTE_RESERVE_MS);
  return Math.max(
    0,
    Math.min(
      Math.floor(requestedLimit),
      Math.floor(usableMs / GEOCODE_CALL_BUDGET_MS),
    ),
  );
}

type GoogleGeocodeResult = {
  partial_match?: unknown;
  types?: unknown;
  geometry?: {
    location?: { lat?: unknown; lng?: unknown };
    location_type?: unknown;
  };
};

type GoogleGeocodeResponse = {
  status?: unknown;
  results?: unknown;
  error_message?: unknown;
};

export type GoogleGeocodeRejectReason =
  | "zero-results"
  | "partial-match"
  | "unsupported-address"
  | "imprecise"
  | "outside-county";

export type GoogleGeocodeSystemReason =
  | "http"
  | "quota"
  | "auth"
  | "upstream"
  | "invalid-request"
  | "malformed-response"
  | "network"
  | "timeout"
  | "daily-budget";

export type GoogleGeocodeOutcome =
  | { kind: "match"; coordinate: LngLat }
  | { kind: "reject"; reason: GoogleGeocodeRejectReason }
  | {
      kind: "system";
      reason: GoogleGeocodeSystemReason;
      status?: number | string;
    }
  | { kind: "disabled" };

/** Operators may lower the shared daily Google geocoding budget without a
 * deploy. Invalid values retain the safe default, and no environment value
 * can raise the immutable ceiling. */
export function resolveGoogleGeocodeDailyCap(
  rawCap = process.env.GOOGLE_GEOCODE_DAILY_CAP,
): number {
  if (typeof rawCap !== "string" || !/^\d+$/.test(rawCap.trim())) {
    return GOOGLE_GEOCODE_DEFAULT_DAILY_CAP;
  }
  const requested = Number(rawCap.trim());
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return GOOGLE_GEOCODE_DEFAULT_DAILY_CAP;
  }
  return Math.min(requested, GOOGLE_GEOCODE_MAX_DAILY_CAP);
}

function googleGeocodingKey(): string | null {
  return (
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    null
  );
}

const ADDRESS_RESULT_TYPES = new Set([
  "street_address",
  "street_number",
  "premise",
  "subpremise",
  "intersection",
]);

const VENUE_RESULT_TYPES = new Set([
  "establishment",
  "point_of_interest",
  "premise",
  "park",
  "campground",
  "stadium",
  "school",
  "university",
  "library",
  "museum",
  "church",
  "synagogue",
  "mosque",
  "city_hall",
  "local_government_office",
  "community_center",
  "event_venue",
  "tourist_attraction",
  "performing_arts_theater",
  "movie_theater",
  "lodging",
  "restaurant",
  "cafe",
  "bar",
]);

const USABLE_LOCATION_TYPES = new Set([
  "ROOFTOP",
  "RANGE_INTERPOLATED",
  "GEOMETRIC_CENTER",
]);

function hasUsableResultType(types: string[]): boolean {
  return types.some(
    (type) => ADDRESS_RESULT_TYPES.has(type) || VENUE_RESULT_TYPES.has(type),
  );
}

export function parseGoogleGeocodeResponse(json: unknown): GoogleGeocodeOutcome {
  const payload = json as GoogleGeocodeResponse | null;
  if (!payload || typeof payload.status !== "string") {
    return { kind: "system", reason: "malformed-response" };
  }
  if (payload.status === "ZERO_RESULTS") {
    return { kind: "reject", reason: "zero-results" };
  }
  if (payload.status !== "OK") {
    const reason: GoogleGeocodeSystemReason =
      payload.status === "OVER_QUERY_LIMIT" ||
      payload.status === "OVER_DAILY_LIMIT"
        ? "quota"
        : payload.status === "REQUEST_DENIED"
          ? "auth"
          : payload.status === "INVALID_REQUEST"
            ? "invalid-request"
            : "upstream";
    return { kind: "system", reason, status: payload.status };
  }
  if (!Array.isArray(payload.results)) {
    return { kind: "system", reason: "malformed-response" };
  }

  let sawUsableType = false;
  for (const raw of payload.results) {
    const result = raw as GoogleGeocodeResult;
    const types = Array.isArray(result.types)
      ? result.types.filter((type): type is string => typeof type === "string")
      : [];
    if (!hasUsableResultType(types)) continue;
    sawUsableType = true;

    const locationType = result.geometry?.location_type;
    if (
      typeof locationType !== "string" ||
      !USABLE_LOCATION_TYPES.has(locationType)
    ) {
      continue;
    }
    if (result.partial_match === true) {
      return { kind: "reject", reason: "partial-match" };
    }

    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return { kind: "system", reason: "malformed-response" };
    }

    const coordinate = { lat, lng };
    return isValidCoord(coordinate)
      ? { kind: "match", coordinate }
      : { kind: "reject", reason: "outside-county" };
  }

  return {
    kind: "reject",
    reason: sawUsableType ? "imprecise" : "unsupported-address",
  };
}

type VenueCacheEntry = {
  lat: number | string;
  lng: number | string;
  source: string;
};

export function trustedCachedCoordinate(entry: VenueCacheEntry): LngLat | null {
  if (
    entry.source !== VERIFIED_CATALOG_CACHE_SOURCE &&
    entry.source !== VERIFIED_GOOGLE_CACHE_SOURCE
  ) {
    return null;
  }
  const coordinate = { lat: Number(entry.lat), lng: Number(entry.lng) };
  return isValidCoord(coordinate) ? coordinate : null;
}

export async function seedVenueCache(sql: Sql): Promise<number> {
  const rowsByAddress = new Map(
    PLACES.filter((place) =>
      Boolean(place.is_verified && place.address && isValidCoord(place.geom)),
    )
      .map((place) => ({
        norm: normalizeForCache(
          `${place.address}, ${place.city}, MD ${place.postal_code ?? ""}`,
        ),
        lat: place.geom.lat,
        lng: place.geom.lng,
      }))
      .filter((row) => row.norm.length > 4)
      .map((row) => [row.norm, row] as const),
  );
  const rows = [...rowsByAddress.values()];
  if (rows.length === 0) return 0;

  const values = sql(
    rows.map((row) => ({
      norm_address: row.norm,
      lat: row.lat,
      lng: row.lng,
      source: VERIFIED_CATALOG_CACHE_SOURCE,
    })),
    "norm_address",
    "lat",
    "lng",
    "source",
  );

  // postgres.js' object helper emits the column list itself. Adding a second
  // explicit `(norm_address, ...)` list makes invalid SQL before the values.
  const result = await sql`
    insert into venue_geocache ${values}
    on conflict (norm_address) do update
    set lat = excluded.lat,
        lng = excluded.lng,
        source = excluded.source,
        cached_at = now()
    where venue_geocache.source <> ${VERIFIED_GOOGLE_CACHE_SOURCE}
  `;
  return result.count ?? 0;
}

type PublishedGeocodeReconciliation = {
  revalidated: number | string;
  repaired: number | string;
  cleared: number | string;
};

export async function reconcilePublishedGeocodes(
  sql: Sql,
): Promise<{ revalidated: number; repaired: number; cleared: number }> {
  const rows = await sql<PublishedGeocodeReconciliation[]>`
    with published as (
      select
        e.id,
        cache.lat as cache_lat,
        cache.lng as cache_lng,
        cache.norm_address is not null as trusted
      from ingested_events e
      left join venue_geocache cache
        on cache.norm_address = btrim(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(e.address), '[.,#]', ' ', 'g'),
              '\\m(suite|ste|unit)\\M',
              ' ',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        )
       and cache.source in (
         ${VERIFIED_CATALOG_CACHE_SOURCE},
         ${VERIFIED_GOOGLE_CACHE_SOURCE}
       )
      where e.geocoded_at is not null
        and coalesce(e.ends_at_utc, e.starts_at_utc) >= now() - interval '6 hours'
    ),
    reconciled as (
      update public.ingested_events e
      set lat = case when published.trusted then published.cache_lat else null end,
          lng = case when published.trusted then published.cache_lng else null end,
          geocoded_at = case when published.trusted then e.geocoded_at else null end
      from published
      where e.id = published.id
        and (
          not published.trusted
          or e.lat is distinct from published.cache_lat
          or e.lng is distinct from published.cache_lng
        )
      returning published.trusted
    )
    select
      count(*) filter (where published.trusted) as revalidated,
      (select count(*) from reconciled where reconciled.trusted) as repaired,
      (select count(*) from reconciled where not reconciled.trusted) as cleared
    from published
  `;
  const row = rows[0];
  return {
    revalidated: Number(row?.revalidated ?? 0),
    repaired: Number(row?.repaired ?? 0),
    cleared: Number(row?.cleared ?? 0),
  };
}

export async function googleGeocode(
  address: string,
): Promise<GoogleGeocodeOutcome> {
  // Prefer a key restricted to the Geocoding API. Keep the shared Places key
  // as an explicit migration fallback until Production has the split key.
  const key = googleGeocodingKey();
  if (!key) return { kind: "disabled" };

  // This is the single Google Geocoding provider boundary. Cache hits never
  // reach it. The database reservation is atomic across cron workers and
  // fails closed when the counter table is unavailable or today's shared cap
  // is exhausted.
  const reservation = await reserveDailyUsage(
    "budget_google_geocode",
    resolveGoogleGeocodeDailyCap(),
  );
  if (!reservation?.reserved) {
    return { kind: "system", reason: "daily-budget" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const query = /\b(?:md|maryland)\b/i.test(address)
      ? address
      : `${address}, Maryland`;
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&region=us&key=${key}`;
    meterUsage("google_geocode");
    const response = await fetch(url, { signal: controller.signal });

    let parsed: GoogleGeocodeOutcome;
    try {
      parsed = parseGoogleGeocodeResponse(await response.json());
    } catch {
      return {
        kind: "system",
        reason: "malformed-response",
        status: response.status,
      };
    }

    if (!response.ok) {
      if (
        response.status === 404 &&
        parsed.kind === "reject" &&
        parsed.reason === "zero-results"
      ) {
        return parsed;
      }
      return {
        kind: "system",
        reason:
          response.status === 429
            ? "quota"
            : response.status === 401 || response.status === 403
              ? "auth"
              : response.status >= 500
                ? "upstream"
                : "http",
        status: response.status,
      };
    }
    return parsed;
  } catch (error) {
    return {
      kind: "system",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodePending(
  sql: Sql,
  limit = 500,
  options: GeocodePendingOptions = {},
): Promise<GeocodeStats> {
  const googleEnabled = Boolean(googleGeocodingKey());
  const stats: GeocodeStats = {
    fromCache: 0,
    fromApi: 0,
    failed: 0,
    seeded: 0,
    revalidated: 0,
    repaired: 0,
    cleared: 0,
    status: googleEnabled ? "ok" : "degraded",
    degradedReason: googleEnabled ? undefined : "disabled",
    budgetStopped: 0,
  };

  stats.seeded = await seedVenueCache(sql);
  const reconciliation = await reconcilePublishedGeocodes(sql);
  stats.revalidated = reconciliation.revalidated;
  stats.repaired = reconciliation.repaired;
  stats.cleared = reconciliation.cleared;

  const pending = await sql<{
    id: string;
    address: string;
    source_domain: string;
    source_uid: string;
    has_stale_review: boolean;
  }[]>`
    select e.id,
           e.address,
           e.source_domain,
           e.source_uid,
           exists (
             select 1
             from unparseable_locations stale_review
             where stale_review.source_domain = e.source_domain
               and stale_review.source_uid = e.source_uid
               and stale_review.raw_location <> e.address
           ) as has_stale_review
    from ingested_events e
    where e.geocoded_at is null
      and e.address is not null
      and length(e.address) > 4
      and coalesce(e.ends_at_utc, e.starts_at_utc) >= now() - interval '6 hours'
      and not exists (
        select 1
        from unparseable_locations reviewed_address
        where reviewed_address.raw_location = e.address
      )
    order by e.starts_at_utc asc
    limit ${limit}
  `;

  const outcomeByAddress = new Map<string, GoogleGeocodeOutcome>();

  for (let index = 0; index < pending.length; index++) {
    const event = pending[index];
    const norm = normalizeForCache(event.address);
    let outcome = outcomeByAddress.get(norm);
    let calledGoogle = false;

    if (!outcome) {
      const cached = await sql<
        Array<{ lat: number | string; lng: number | string; source: string }>
      >`
        select lat, lng, source from venue_geocache
        where norm_address = ${norm}
        limit 1
      `;
      const cachedCoordinate =
        cached.length > 0 ? trustedCachedCoordinate(cached[0]) : null;

      if (cachedCoordinate) {
        outcome = { kind: "match", coordinate: cachedCoordinate };
        stats.fromCache++;
      } else {
        if (
          googleEnabled &&
          options.deadlineAt !== undefined &&
          options.deadlineAt - Date.now() < GEOCODE_CALL_BUDGET_MS
        ) {
          stats.status = "degraded";
          stats.degradedReason = "route-budget";
          stats.budgetStopped = pending.length - index;
          break;
        }

        calledGoogle = true;
        outcome = await googleGeocode(event.address);
        if (outcome.kind === "match") {
          const coordinates = outcome.coordinate;
          await sql`
            insert into venue_geocache (norm_address, lat, lng, source)
            values (
              ${norm},
              ${coordinates.lat},
              ${coordinates.lng},
              ${VERIFIED_GOOGLE_CACHE_SOURCE}
            )
            on conflict (norm_address) do update
            set lat = excluded.lat,
                lng = excluded.lng,
                source = excluded.source,
                cached_at = now()
          `;
          stats.fromApi++;
        }
      }
      outcomeByAddress.set(norm, outcome);
    }

    if (outcome.kind === "system") {
      if (outcome.reason === "daily-budget") {
        stats.budgetStopped = pending.length - index;
      } else {
        stats.failed++;
      }
      stats.status = "degraded";
      stats.degradedReason = outcome.reason;
      stats.upstreamStatus = outcome.status;
      break;
    }

    if (outcome.kind === "disabled") {
      stats.status = "degraded";
      stats.degradedReason = "disabled";
      stats.budgetStopped = pending.length - index;
      break;
    }

    if (outcome.kind === "reject") {
      stats.failed++;
      await sql`
        insert into unparseable_locations
          (source_domain, source_uid, raw_location)
        values (${event.source_domain}, ${event.source_uid}, ${event.address})
        on conflict (source_domain, source_uid) do update
        set raw_location = excluded.raw_location,
            seen_at = now()
      `;
      if (calledGoogle) {
        await new Promise((resolve) => setTimeout(resolve, RATE_DELAY_MS));
      }
      continue;
    }

    const coordinates = outcome.coordinate;
    await sql`
      update ingested_events
      set lat = ${coordinates.lat},
          lng = ${coordinates.lng},
          geocoded_at = now()
      where id = ${event.id}
    `;

    if (event.has_stale_review) {
      await sql`
        delete from unparseable_locations
        where source_domain = ${event.source_domain}
          and source_uid = ${event.source_uid}
      `;
    }

    if (calledGoogle) {
      await new Promise((resolve) => setTimeout(resolve, RATE_DELAY_MS));
    }
  }

  return stats;
}
