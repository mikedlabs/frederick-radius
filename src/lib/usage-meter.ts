import { getSql } from "@/lib/db/client";

/**
 * usage-meter — the app's own tally of calls to the PAID upstreams, so
 * /admin/costs can answer "what is incurring cost" from our side instead of
 * waiting for a provider invoice. One row per (Eastern day, upstream) in
 * usage_counters, incremented beside each validated paid fetch attempt.
 * Cache-aware call sites put the meter inside their cache-miss function so a
 * reused result does not increment the tally.
 *
 * Fire-and-forget and fail-soft by contract: metering must never slow or
 * break a product request. No DB configured, table not migrated, or a
 * transient error all silently no-op. Counts are an UPPER BOUND on billable
 * calls because a provider can still reject or fail a request after receiving
 * it, and a few older call sites rely on platform fetch caching that is not
 * observable here. Provider consoles remain the billing source of truth.
 */
export type PaidUpstream =
  | "google_photo"
  | "google_place_details_pro"
  | "google_place_details_enterprise"
  | "google_place_details_enterprise_atmosphere"
  | "google_text_search_pro"
  | "google_text_search_enterprise"
  | "google_text_search_enterprise_atmosphere"
  | "google_routes_matrix_essentials"
  | "google_routes_matrix_pro"
  | "google_geocode"
  | "anthropic_ask"
  | "mapbox_geocode"
  | "mapbox_directions"
  | "mapbox_matrix"
  | "mapbox_isochrone"
  | "mapbox_search_box"
  | "mapbox_static"
  | "google_routes_matrix"
  | "firecrawl_visit_frederick";

export type UsageReservation = {
  reserved: boolean;
  count: number;
};

/** Internal guardrail rows share the atomic counter table but are not provider
 * SKUs. The provider-specific meter still records the actual field-mask tier;
 * these namespaces only prevent a public route from spending without bound. */
export type UsageBudgetNamespace =
  | PaidUpstream
  | "budget_google_place_enrich_basic"
  | "budget_google_place_enrich_experience"
  | "budget_google_routes_private"
  | "budget_google_geocode"
  | "budget_google_hours_refresh"
  | "budget_google_business_status";

export type UsageIntervalLease = {
  acquired: boolean;
};

/**
 * Own one sliding refresh interval across concurrent serverless workers.
 *
 * The stable sentinel row stores an expiry minute, not a billable count.
 * PostgreSQL's clock and one conditional UPSERT make acquisition atomic even
 * when deliveries straddle a wall-clock bucket. It is deliberately
 * fail-closed: without the database, a scheduled worker keeps the last
 * durable snapshot rather than racing another fetch.
 */
export async function reserveUsageIntervalLease(
  namespace: "visit_frederick_refresh",
  intervalMs: number,
): Promise<UsageIntervalLease | null> {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 60_000
  ) {
    return null;
  }
  const leaseKey = `lease:${namespace}`;
  try {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql<Array<{ count: number | string }>>`
      insert into usage_counters (day, upstream, count)
      values (
        date '1970-01-01',
        ${leaseKey},
        floor(
          extract(
            epoch from (
              now() + (${intervalMs} * interval '1 millisecond')
            )
          ) / 60
        )::integer
      )
      on conflict (day, upstream)
      do update set count = excluded.count
      where usage_counters.count <=
        floor(extract(epoch from now()) / 60)::integer
      returning count
    `;
    return { acquired: rows.length > 0 };
  } catch {
    return null;
  }
}

/**
 * Atomically reserve one paid call under a hard daily ceiling.
 *
 * Unlike best-effort metering, this fails closed: a caller must not spend when
 * the database is unavailable, the counter table is missing, or the cap is
 * already exhausted. The INSERT ... ON CONFLICT predicate makes concurrent
 * serverless workers share one real limit instead of racing process memory.
 */
export async function reserveDailyUsage(
  upstream: UsageBudgetNamespace,
  limit: number,
): Promise<UsageReservation | null> {
  if (!Number.isSafeInteger(limit) || limit <= 0) return null;
  try {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql<Array<{ count: number | string }>>`
      insert into usage_counters (day, upstream, count)
      values ((now() at time zone 'America/New_York')::date, ${upstream}, 1)
      on conflict (day, upstream)
      do update set count = usage_counters.count + 1
      where usage_counters.count < ${limit}
      returning count
    `;
    const count = Number(rows[0]?.count);
    return rows.length > 0 && Number.isSafeInteger(count)
      ? { reserved: true, count }
      : { reserved: false, count: limit };
  } catch {
    return null;
  }
}

export function meterUsage(upstream: PaidUpstream, increment = 1): void {
  try {
    // Matrix products are billed by element, so callers may add more than one
    // unit for a single upstream request. Invalid increments fail closed; all
    // existing one-argument callers retain the original +1 behavior.
    if (!Number.isSafeInteger(increment) || increment <= 0) return;
    const sql = getSql();
    if (!sql) return;
    void sql`
      insert into usage_counters (day, upstream, count)
      values ((now() at time zone 'America/New_York')::date, ${upstream}, ${increment})
      on conflict (day, upstream)
      do update set count = usage_counters.count + ${increment}
    `.catch(() => {
      /* table not migrated / transient — metering is best-effort */
    });
  } catch {
    /* never throw into product code */
  }
}
