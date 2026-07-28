/**
 * Geocode events with an address but no coords yet. New addresses are sent to
 * Google once, then served from the verified venue cache. Published event pins
 * are reconciled against that cache on later passes so legacy/unprovenanced
 * coordinates cannot survive indefinitely.
 *
 * Spec said Mapbox; we don't have Mapbox — using Google Geocoding API on
 * the existing GOOGLE_PLACES_API_KEY (enable "Geocoding API" in GCP).
 *
 * Venue cache: most events repeat at the same place (city hall, library
 * branches, parks). We check `venue_geocache` by normalized address first
 * and seed it only from explicitly verified catalog places.
 */
import type { Sql } from "postgres";
import { normalizeForCache } from "./location";
import { PLACES } from "@/data/places";
import { isValidCoord, type LngLat } from "@/lib/geo";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const RATE_DELAY_MS = 120; // ~500/min, well under Google limits
const GEOCODE_TIMEOUT_MS = 8_000;
const GEOCODE_CALL_BUDGET_MS = GEOCODE_TIMEOUT_MS + RATE_DELAY_MS + 500;
const GEOCODE_ROUTE_RESERVE_MS = 5_000;
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
  /** Published pins whose address is anchored to a current trusted cache row. */
  revalidated: number;
  /** Trusted cache coordinates that corrected a published event pin. */
  repaired: number;
  /** Published pins cleared because no current trusted provenance exists. */
  cleared: number;
  status: "ok" | "degraded";
  degradedReason?: GeocodeDegradedReason;
  upstreamStatus?: number | string;
  budgetStopped: number;
};

export type GeocodePendingOptions = {
  /**
   * Absolute route deadline. The worker refuses to begin a Google request
   * unless a full timeout window plus a small DB/finalization reserve remains.
   */
  deadlineAt?: number;
};

/**
 * Convert a route's remaining wall-clock budget into a worst-case-safe batch
 * size. This prevents a 400/800-row tail from starting after the feed ingest
 * has already consumed most of a Vercel function's lifetime.
 */
export function geocodeLimitForRemaining(
  remainingMs: number,
  requestedLimit: number,
): number {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(requestedLimit)) return 0;
  const usableMs = Math.max(0, remainingMs - GEOCODE_ROUTE_RESERVE_MS);
  return Math.max(
    0,
    Math.min(Math.floor(requestedLimit), Math.floor(usableMs / GEOCODE_CALL_BUDGET_MS)),
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
  | "timeout";

export type GoogleGeocodeOutcome =
  | { kind: "match"; coordinate: LngLat }
  | { kind: "reject"; reason: GoogleGeocodeRejectReason }
  | {
      kind: "system";
      reason: GoogleGeocodeSystemReason;
      status?: number | string;
    }
  | { kind: "disabled" };

/**
 * Address-level results are useful even when Google interpolates the street
 * number. Venue results need to remain valid too: parks, fairgrounds, schools,
 * and named businesses commonly arrive as a premise / establishment /
 * point_of_interest with GEOMETRIC_CENTER rather than street_address.
 */
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

/**
 * Trust boundary for Google Geocoding responses.
 *
 * A result is publishable only when it is:
 *   - a complete match;
 *   - address- or venue-shaped (never a town, ZIP, county, or state centroid);
 *   - precise enough to place a pin; and
 *   - inside the real Frederick County outline plus the documented municipal
 *     straddle allowance.
 *
 * We may skip an area-level or imprecise suggestion to reach the first usable
 * address/venue result. Once a result has both a usable type and precision,
 * it is authoritative for this response: an out-of-county result is rejected
 * rather than fishing later results for an in-county alternative.
 */
export function parseGoogleGeocodeResponse(json: unknown): GoogleGeocodeOutcome {
  const payload = json as GoogleGeocodeResponse | null;
  if (!payload || typeof payload.status !== "string") {
    return { kind: "system", reason: "malformed-response" };
  }
  if (payload.status === "ZERO_RESULTS") {
    return { kind: "reject", reason: "zero-results" };
  }
  if (payload.status !== "OK") {
    const statusReason: GoogleGeocodeSystemReason =
      payload.status === "OVER_QUERY_LIMIT" || payload.status === "OVER_DAILY_LIMIT"
        ? "quota"
        : payload.status === "REQUEST_DENIED"
          ? "auth"
          : payload.status === "INVALID_REQUEST"
            ? "invalid-request"
            : "upstream";
    return { kind: "system", reason: statusReason, status: payload.status };
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

/**
 * Only explicitly verified catalog coordinates and Google rows written
 * through the validator above may leave the cache. Legacy `curated` and
 * `google` rows predate these trust boundaries, so they are deliberately
 * revalidated/replaced without a schema migration.
 */
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

/**
 * Prime venue_geocache from genuinely verified catalog rows in one statement.
 * Google-verified entries always win: the catalog seed may repair legacy cache
 * provenance, but it must never downgrade a response that passed the current
 * Google precision/boundary validator.
 */
export async function seedVenueCache(sql: Sql): Promise<number> {
  const rowsByAddress = new Map(
    PLACES
      .filter((p) => p.is_verified && p.address && isValidCoord(p.geom))
      .map((p) => ({
        norm: normalizeForCache(`${p.address}, ${p.city}, MD ${p.postal_code ?? ""}`),
        lat: p.geom.lat,
        lng: p.geom.lng,
      }))
      .filter((r) => r.norm.length > 4)
      .map((r) => [r.norm, r] as const),
  );
  const rows = [...rowsByAddress.values()];
  if (rows.length === 0) return 0;

  const result = await sql`
    insert into venue_geocache (norm_address, lat, lng, source)
    ${sql(
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
    )}
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

/**
 * Reconcile every currently publishable event pin against address-level cache
 * provenance before selecting new work.
 *
 * `ingested_events` predates provenance on each event, so there is no reliable
 * timestamp or flag that separates legacy pins from pins created by the
 * current validator. The cache does carry provenance. A single set-based
 * reconciliation therefore:
 *
 *   - keeps and counts pins backed by a current verified cache source;
 *   - repairs coordinates that drift from that trusted row; and
 *   - clears every other current pin so an unverified legacy result cannot
 *     remain public while it waits for a fresh geocode.
 *
 * The address expression mirrors normalizeForCache. This is intentionally run
 * on every pass: after the first cleanup it is a read plus writes only when
 * provenance or coordinates no longer agree.
 */
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

export async function googleGeocode(address: string): Promise<GoogleGeocodeOutcome> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { kind: "disabled" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const query = /\b(?:md|maryland)\b/i.test(address)
      ? address
      : `${address}, Maryland`;
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&region=us&key=${key}`;
    const res = await fetch(url, { signal: controller.signal });

    let parsed: GoogleGeocodeOutcome;
    try {
      parsed = parseGoogleGeocodeResponse(await res.json());
    } catch {
      return {
        kind: "system",
        reason: "malformed-response",
        status: res.status,
      };
    }

    // Google is migrating some API statuses from HTTP 200 to 4xx/5xx. A
    // 404 carrying ZERO_RESULTS is still a definitive address miss; every
    // other non-OK transport status is infrastructure, quota, or auth.
    if (!res.ok) {
      if (res.status === 404 && parsed.kind === "reject" && parsed.reason === "zero-results") {
        return parsed;
      }
      return {
        kind: "system",
        reason:
          res.status === 429
            ? "quota"
            : res.status === 401 || res.status === 403
              ? "auth"
              : res.status >= 500
                ? "upstream"
                : "http",
        status: res.status,
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
  const googleEnabled = Boolean(process.env.GOOGLE_PLACES_API_KEY);
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

  // A batch can contain several occurrences at one venue. Remember the
  // address outcome so a definitive reject costs one API call, not one call
  // per occurrence selected before the first review row is inserted.
  const outcomeByAddress = new Map<string, GoogleGeocodeOutcome>();

  for (let index = 0; index < pending.length; index++) {
    const ev = pending[index];
    const norm = normalizeForCache(ev.address);
    let outcome = outcomeByAddress.get(norm);
    let calledGoogle = false;

    if (!outcome) {
      const cached = await sql<{ lat: number; lng: number; source: string }[]>`
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
        outcome = await googleGeocode(ev.address);
        if (outcome.kind === "match") {
          const coords = outcome.coordinate;
          await sql`
            insert into venue_geocache (norm_address, lat, lng, source)
            values (${norm}, ${coords.lat}, ${coords.lng}, ${VERIFIED_GOOGLE_CACHE_SOURCE})
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
      // A quota/auth/upstream/network problem affects the batch, not the
      // address. Stop immediately so one outage cannot fan out into hundreds
      // of calls or pollute the human review queue.
      stats.failed++;
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
        values (${ev.source_domain}, ${ev.source_uid}, ${ev.address})
        on conflict (source_domain, source_uid) do update
        set raw_location = excluded.raw_location,
            seen_at = now()
      `;
      if (calledGoogle) {
        await new Promise((resolve) => setTimeout(resolve, RATE_DELAY_MS));
      }
      continue;
    }

    const coords = outcome.coordinate;
    await sql`
      update ingested_events
      set lat = ${coords.lat}, lng = ${coords.lng}, geocoded_at = now()
      where id = ${ev.id}
    `;

    // Only a source event whose address changed can carry a stale review row
    // into a successful attempt. Routine successes avoid an unconditional
    // delete query.
    if (ev.has_stale_review) {
      await sql`
        delete from unparseable_locations
        where source_domain = ${ev.source_domain}
          and source_uid = ${ev.source_uid}
      `;
    }

    if (calledGoogle) {
      await new Promise((resolve) => setTimeout(resolve, RATE_DELAY_MS));
    }
  }
  return stats;
}
