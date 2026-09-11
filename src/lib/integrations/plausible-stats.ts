import "server-only";

/**
 * Plausible Stats API client — the shared read path for every surface
 * that shows traffic (the /admin/traffic panels, the Monday digest).
 *
 * Plausible is cookieless and aggregate-only, so everything here is
 * site-level numbers: no sessions, no people. Fail-soft everywhere —
 * a missing key or a down API yields null and the caller says so
 * quietly (same posture as weekly-digest, which this was lifted from).
 */

const API = "https://plausible.io/api/v1/stats";

export type PlausibleKeys = { key: string; site: string };

/** Both env vars or nothing — half a configuration is not a configuration. */
export function plausibleKeys(): PlausibleKeys | null {
  const key = process.env.PLAUSIBLE_API_KEY;
  const site = process.env.PLAUSIBLE_SITE_ID;
  return key && site ? { key, site } : null;
}

async function call(path: string, key: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type Aggregate = { visitors: number; pageviews: number; visitDurationSec: number };

type RawAggregate = {
  results?: {
    visitors?: { value: number };
    pageviews?: { value: number };
    visit_duration?: { value: number };
  };
};

/** Site totals for a Plausible period ("day" = today, "7d", "30d"). */
export async function fetchAggregate(keys: PlausibleKeys, period: string): Promise<Aggregate | null> {
  const raw = (await call(
    `/aggregate?site_id=${encodeURIComponent(keys.site)}&period=${period}&metrics=visitors,pageviews,visit_duration`,
    keys.key,
  )) as RawAggregate | null;
  const r = raw?.results;
  if (!r?.visitors) return null;
  return {
    visitors: r.visitors.value,
    pageviews: r.pageviews?.value ?? 0,
    visitDurationSec: r.visit_duration?.value ?? 0,
  };
}

export type BreakdownRow = { label: string; visitors: number; events: number };

/**
 * Normalize one breakdown result row. Plausible names the label field
 * after the property's tail ("page" for event:page, "name" for
 * event:name, the prop name for event:props:query), so the label is
 * whichever field isn't a metric. Pure — exported for tests.
 */
export function toBreakdownRow(raw: Record<string, unknown>): BreakdownRow | null {
  let label: string | null = null;
  for (const [k, v] of Object.entries(raw)) {
    if (k === "visitors" || k === "events" || k === "pageviews") continue;
    if (typeof v === "string" && v.trim()) {
      label = v.trim();
      break;
    }
  }
  if (!label) return null;
  const visitors = typeof raw.visitors === "number" ? raw.visitors : 0;
  const events = typeof raw.events === "number" ? raw.events : visitors;
  return { label, visitors, events };
}

/**
 * A breakdown ("top pages", "top events", "missed queries"). `property`
 * is a Plausible property path (event:page, event:name,
 * event:props:query); `filters` is their filter syntax
 * (event:name==search_empty).
 */
export async function fetchBreakdown(
  keys: PlausibleKeys,
  property: string,
  period: string,
  opts: { filters?: string; limit?: number } = {},
): Promise<BreakdownRow[] | null> {
  const params = new URLSearchParams({
    site_id: keys.site,
    period,
    property,
    metrics: "visitors,events",
    limit: String(opts.limit ?? 12),
  });
  if (opts.filters) params.set("filters", opts.filters);
  const raw = (await call(`/breakdown?${params.toString()}`, keys.key)) as {
    results?: Record<string, unknown>[];
  } | null;
  if (!raw?.results) return null;
  return raw.results
    .map(toBreakdownRow)
    .filter((r): r is BreakdownRow => r !== null);
}
