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
  | "anthropic_ask"
  | "mapbox_geocode"
  | "mapbox_directions"
  | "mapbox_matrix"
  | "mapbox_isochrone"
  | "mapbox_static"
  | "google_routes_matrix";

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
