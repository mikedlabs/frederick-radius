import "server-only";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import { photoUrl } from "@/lib/integrations/google-places";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isEventToday } from "@/lib/eventWhenLabel";
import { askFrederick } from "@/lib/ask/answer";
import { getSql } from "@/lib/db/client";
import { publicPlaces } from "@/lib/loaders/places";
import { publishableGooglePhotoNames } from "@/lib/google-photo-policy";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import {
  getPulsePointIncidentsResult,
  pulsepointConfigured,
} from "@/lib/integrations/pulsepoint";
import ENRICHMENT from "@/data/places-enrichment.json" with { type: "json" };
import BUSINESS_INFO from "@/data/business-info.json" with { type: "json" };
import VENUE_EVENTS from "@/data/venue-events.json" with { type: "json" };

/**
 * End-to-end tripwires — the daily checks for the failure classes that
 * degrade POLITELY and therefore stay invisible.
 *
 * July 2026, one week: Google rotated its photo names and every thumbnail
 * app-wide quietly became the initials tile; the transit feed renamed a
 * field and /transit rendered zero routes; the FCPL ingest outgrew its
 * time budget and died mid-run for two months; the ask box lost its date
 * grounding and told a Reddit user it didn't know what day it was. Every
 * one was found by a human notice, not a system. These checks make each
 * class a red line on the existing anomaly channel instead.
 *
 * Contract: each check is FAIL-SOFT and returns [] when the thing it
 * needs isn't available in this environment (no Google key, no network),
 * so the cron can never be broken by its own watchdog.
 */

type EnrichmentRow = {
  photo_names?: string[];
  photo_attributions?: GooglePhotoAttribution[];
};

/** Catch the other global-thumbnail failure: the upstream resource names may
 * still resolve, but Radius cannot legally/truthfully publish them because the
 * exact per-photo attribution records never reached the dataset. */
export function photoMetadataCoverageAnomaly(
  rows: readonly EnrichmentRow[],
): Anomaly | null {
  const named = rows.filter((row) => (row.photo_names?.length ?? 0) > 0);
  if (named.length === 0) return null;
  const publishable = named.filter(
    (row) =>
      publishableGooglePhotoNames(
        row.photo_names ?? [],
        row.photo_attributions ?? [],
      ).length > 0,
  ).length;
  const ratio = publishable / named.length;
  return ratio < 0.25
    ? {
        source: "google-photo-metadata",
        kind: "photo_rot",
        detail:
          `${publishable}/${named.length} photo-bearing enrichment rows have an exact publishable attribution pair. ` +
          "Run the request-capped photo-attribution backfill and review its PR.",
      }
    : null;
}

/**
 * Sample real photo names across the catalog and fetch them at thumbnail
 * size. Healthy: most resolve (the proxy's self-heal covers stragglers).
 * Red: half or more fail — the token-rotation class that took down every
 * thumbnail. Deterministic sample (every Nth slug, sorted) so the same
 * places are probed day over day and a flap is visible as a flap.
 */
export async function photoTripwire(sample = 6): Promise<Anomaly[]> {
  const rows = Object.entries(ENRICHMENT as Record<string, EnrichmentRow>)
    .filter(([, v]) => Array.isArray(v.photo_names) && v.photo_names.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (rows.length === 0) return [];
  const metadataAnomaly = photoMetadataCoverageAnomaly(
    rows.map(([, row]) => row),
  );
  // Do not spend photo-media requests proving that legacy names resolve when
  // the app is intentionally suppressing them for missing attribution.
  if (metadataAnomaly) return [metadataAnomaly];
  const step = Math.max(1, Math.floor(rows.length / sample));
  const picks = Array.from({ length: sample }, (_, i) => rows[Math.min(i * step, rows.length - 1)]);

  let failed = 0;
  const failures: string[] = [];
  for (const [slug, v] of picks) {
    const url = photoUrl(v.photo_names![0], 80);
    if (!url) return []; // no key in this environment — nothing to measure
    try {
      const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        failed++;
        failures.push(`${slug}:${res.status}`);
      }
    } catch {
      failed++;
      failures.push(`${slug}:fetch-error`);
    }
  }
  if (failed * 2 < picks.length) return [];
  return [
    {
      source: "google-photos",
      kind: "photo_rot",
      detail: `${failed}/${picks.length} sampled photo names failed upstream (${failures.join(", ")}) — the dataset's photo references have rotated; thumbnails are on the self-heal path or the placeholder. Regenerate photo names.`,
    },
  ];
}

/** The /transit zero-routes class: the upstream schema changed and the
 *  normalizer silently dropped every route. Healthy is ~15 route groups;
 *  single digits means the feed or the mapping broke. */
export async function transitTripwire(): Promise<Anomaly[]> {
  try {
    const routes = await getFrederickTransitRoutes();
    if (routes.length >= 8) return [];
    return [
      {
        source: "transit-frederick",
        kind: "transit_empty",
        detail: `Transit normalizer returned ${routes.length} route group(s) (healthy ≈ 15). Upstream schema drift or feed outage — /transit is degraded.`,
      },
    ];
  } catch (err) {
    return [
      {
        source: "transit-frederick",
        kind: "transit_empty",
        detail: `Transit fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/** A county with zero public events on ANY day means the assembly (not one
 *  feed — the whole unified pipeline) broke. */
export async function eventsTripwire(now: Date = new Date()): Promise<Anomaly[]> {
  try {
    const { publicEvents } = await assembleUnifiedEvents(now);
    const today = publicEvents.filter((e) => isEventToday(e.starts_at, now)).length;
    if (today > 0) return [];
    return [
      {
        source: "unified-events",
        kind: "events_empty",
        detail: "assembleUnifiedEvents returned ZERO public events for today — the unified pipeline (feeds + classification + time-sanity) is broken upstream of every events surface.",
      },
    ];
  } catch (err) {
    return [
      {
        source: "unified-events",
        kind: "events_empty",
        detail: `assembleUnifiedEvents threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/** One canary ask a day: the question from the Reddit screenshot. Red on a
 *  missing answer, date-blindness, or raw markdown reaching users. Costs
 *  one cached model call daily. */
export async function askCanaryTripwire(): Promise<Anomaly[]> {
  try {
    const res = await askFrederick("Music tonight");
    if (!res.configured) return []; // no AI provider in this environment
    const problems: string[] = [];
    if (!res.answer) problems.push("no answer");
    if (res.answer && /don'?t (have|know) (today'?s|the) date/i.test(res.answer)) problems.push("date-blindness");
    if (res.answer && /\*\*|`/.test(res.answer)) problems.push("raw markdown");
    if (problems.length === 0) return [];
    return [
      {
        source: "ask-frederick",
        kind: "ask_degraded",
        detail: `Canary ask ("Music tonight") degraded: ${problems.join(", ")}. Answer: ${(res.answer ?? "").slice(0, 140)}`,
      },
    ];
  } catch (err) {
    return [
      {
        source: "ask-frederick",
        kind: "ask_degraded",
        detail: `askFrederick threw: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

/**
 * The scheduled extraction agents (business deep-info, venue lineups)
 * commit their output to the repo — so a HEALTHY pipeline means the
 * bundled JSON carries recent fetchedAt stamps. When the newest stamp
 * ages past the window, the agent has stopped extracting, whatever its
 * workflow badge claims: the business-info agent ran 49 straight GREEN
 * no-ops over seven weeks with an empty ANTHROPIC_API_KEY secret before
 * a human noticed the data was frozen (July 2026). This makes "the moat
 * stopped growing" a red line on the same channel as everything else.
 *
 * Windows are generous multiples of each agent's daily schedule so a
 * few no-runner days (account-level Actions limits) don't flap.
 */
export function ingestFreshnessTripwire(now: Date = new Date()): Anomaly[] {
  const out: Anomaly[] = [];
  const check = (
    name: string,
    stamps: Array<string | undefined>,
    maxDays: number,
    hint: string,
  ) => {
    const newest = stamps.filter(Boolean).sort().at(-1);
    if (!newest) return; // dataset empty/never run — nothing to measure
    const days = Math.floor((now.getTime() - Date.parse(newest)) / 86_400_000);
    if (Number.isFinite(days) && days > maxDays) {
      out.push({
        source: name,
        kind: "ingest_stale",
        detail: `${name} newest fetchedAt is ${days}d old (window ${maxDays}d) — the extraction agent has stopped committing. ${hint}`,
      });
    }
  };
  check(
    "business-info",
    Object.values(BUSINESS_INFO as Record<string, { source?: { fetchedAt?: string } }>).map(
      (v) => v.source?.fetchedAt,
    ),
    10,
    "Check the ingest-business-info workflow and the ANTHROPIC_API_KEY repo secret.",
  );
  check(
    "venue-events",
    (VENUE_EVENTS as Array<{ source?: { fetchedAt?: string } }>).map((v) => v.source?.fetchedAt),
    10,
    "Check the ingest-venues workflow and the ANTHROPIC_API_KEY repo secret.",
  );
  return out;
}

export type AvailabilityCheck = {
  source: string;
  available: boolean;
};

/** Turn a successful-empty vs unavailable distinction into operator-visible
 * anomalies. These feeds power "all clear" claims, so a quiet response is only
 * green when the upstream actually answered. */
export function availabilityAnomalies(
  checks: AvailabilityCheck[],
): Anomaly[] {
  return checks
    .filter((check) => !check.available)
    .map((check) => ({
      source: check.source,
      kind: "live_source_failed" as const,
      detail:
        "The live source could not be verified. Public surfaces must show an unavailable state, not an all-clear.",
    }));
}

async function within<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), 10_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Canary the live-condition sources whose empty sets can otherwise look like
 * good news. PulsePoint participates only when the deployment intentionally
 * configures it; its absence is already reported by the feed registry. */
export async function conditionsTripwire(): Promise<Anomaly[]> {
  const [traffic, power, schools, weather, safety] = await Promise.all([
    within(
      getChartIncidentsFrederickResult(),
      { data: [], available: false },
    ),
    within(
      getFrederickOutagesResult(),
      { data: { total_out: 0, total_served: 0, munis: [] }, available: false },
    ),
    within(getFcpsAlertsResult(), { data: [], available: false }),
    within(getNwsAlertsResult(), { alerts: [], available: false }),
    pulsepointConfigured()
      ? within(
          getPulsePointIncidentsResult(),
          { data: [], available: false, configured: true },
        )
      : Promise.resolve(null),
  ]);

  const checks: AvailabilityCheck[] = [
    { source: "MDOT CHART", available: traffic.available },
    { source: "Potomac Edison", available: power.available },
    { source: "FCPS", available: schools.available },
    { source: "NWS alerts", available: weather.available },
  ];
  if (safety) {
    checks.push({ source: "PulsePoint", available: safety.available });
  }
  return availabilityAnomalies(checks);
}

export type TripwireReport = {
  anomalies: Anomaly[];
  /** One line per check: name + green/red. */
  checks: Array<{ name: string; green: boolean }>;
};

/**
 * The semantic half of Ask, checked for a pulse.
 *
 * hybridPlaceSearch() fuses Postgres FTS + pgvector and returns [] on ANY
 * failure so lexical search always survives. That contract is right, but it
 * also means an EMPTY index is indistinguishable from a healthy one at the
 * call site: hybridSearchConfigured() only proves a database and a gateway
 * key exist, never that a single document was ever embedded. The index is
 * populated by `npm run build:radius-search`, a script run by hand — so the
 * failure mode is simply "nobody ran it," and the app degrades to
 * keyword-only search without a word of complaint. (Found July 2026:
 * radius_search_documents held ZERO rows in production while the feature
 * had been shipped for months.)
 *
 * Red when the index is empty, or has fallen far behind the catalog it is
 * supposed to cover. Silent when hybrid search is deliberately off
 * (RADIUS_HYBRID_SEARCH=0) or there is no database here — neither is a fault.
 */
export async function semanticIndexTripwire(): Promise<Anomaly[]> {
  if (process.env.RADIUS_HYBRID_SEARCH === "0") return []; // switched off on purpose
  const sql = getSql();
  if (!sql) return []; // no database in this environment — nothing to measure
  try {
    const rows = (await sql`
      select count(*)::int as total, count(embedding)::int as embedded
      from radius_search_documents
    `) as unknown as Array<{ total: number; embedded: number }>;
    const embedded = rows?.[0]?.embedded ?? 0;
    const expected = publicPlaces().length;
    if (embedded === 0) {
      return [
        {
          source: "semantic-search",
          kind: "index_empty",
          detail:
            `radius_search_documents holds 0 embedded documents, so every semantic lookup returns nothing and Ask is running on keyword matching alone. ` +
            `Run \`npm run build:radius-search\` (needs DATABASE_URL + AI Gateway auth) to embed the ${expected} public places.`,
        },
      ];
    }
    // Well behind the catalog: new places are invisible to meaning-based search.
    if (expected > 0 && embedded < expected * 0.8) {
      return [
        {
          source: "semantic-search",
          kind: "index_stale",
          detail:
            `radius_search_documents covers ${embedded} of ${expected} public places (${Math.round((embedded / expected) * 100)}%). ` +
            `Re-run \`npm run build:radius-search\`; it is incremental, so it only embeds what changed.`,
        },
      ];
    }
    return [];
  } catch {
    // Table missing (migration 0025 unapplied) or database unreachable. Both
    // are real, but the /admin/data-health database gate already speaks to
    // them; staying quiet here keeps this watchdog from double-reporting.
    return [];
  }
}

/** Run every tripwire (concurrently — they're independent networks). */
export async function runTripwires(now: Date = new Date()): Promise<TripwireReport> {
  const [photos, transit, events, ask, conditions, semantic] = await Promise.all([
    photoTripwire(),
    transitTripwire(),
    eventsTripwire(now),
    askCanaryTripwire(),
    conditionsTripwire(),
    semanticIndexTripwire(),
  ]);
  const ingest = ingestFreshnessTripwire(now);
  return {
    anomalies: [...photos, ...transit, ...events, ...ask, ...conditions, ...semantic, ...ingest],
    checks: [
      { name: "photos", green: photos.length === 0 },
      { name: "transit", green: transit.length === 0 },
      { name: "events-today", green: events.length === 0 },
      { name: "ask-canary", green: ask.length === 0 },
      { name: "live-conditions", green: conditions.length === 0 },
      { name: "semantic-index", green: semantic.length === 0 },
      { name: "ingest-freshness", green: ingest.length === 0 },
    ],
  };
}
