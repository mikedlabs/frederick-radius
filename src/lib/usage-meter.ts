import { getSql } from "@/lib/db/client";

/**
 * usage-meter — the app's own tally of calls to the PAID upstreams, so
 * /admin/costs can answer "what is incurring cost" from our side instead of
 * waiting for a provider invoice. One row per (Eastern day, upstream) in
 * usage_counters, incremented beside each paid fetch or billable element.
 *
 * Fire-and-forget and fail-soft by contract: metering must never slow or
 * break a product request. No DB configured, table not migrated, or a
 * transient error all silently no-op. Counts are an UPPER BOUND on billable
 * calls (platform fetch caching means some metered requests never reach the
 * network), which is the safe direction for a cost readout.
 */
export type PaidUpstream =
  | "google_photo"
  | "anthropic_ask"
  | "mapbox_geocode"
  | "mapbox_isochrone"
  | "mapbox_matrix"
  | "mapbox_search_box"
  | "mapbox_static";

export function meterUsage(upstream: PaidUpstream, amount = 1): void {
  const boundedAmount = Number.isFinite(amount)
    ? Math.max(1, Math.min(10_000, Math.round(amount)))
    : 1;
  try {
    const sql = getSql();
    if (!sql) return;
    void sql`
      insert into usage_counters (day, upstream, count)
      values ((now() at time zone 'America/New_York')::date, ${upstream}, ${boundedAmount})
      on conflict (day, upstream)
      do update set count = usage_counters.count + ${boundedAmount}
    `.catch(() => {
      /* table not migrated / transient — metering is best-effort */
    });
  } catch {
    /* never throw into product code */
  }
}
