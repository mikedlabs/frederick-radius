import "server-only";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import { photoUrl } from "@/lib/integrations/google-places";
import { getFrederickTransitRoutes } from "@/lib/integrations/transitFrederick";
import {
  assembleUnifiedEvents,
  type EventSourceHealth,
} from "@/lib/loaders/unifiedEvents";
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
import HOURS_REFRESH from "@/data/places-hours-refresh.json" with { type: "json" };
import { HOURS_SNAPSHOT_MAX_AGE_DAYS } from "@/lib/quality/curated-freshness";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";

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

  const probes = await Promise.all(
    picks.map(async ([slug, v]) => {
      const url = photoUrl(v.photo_names![0], 80);
      if (!url) return { configured: false, failure: null };
      try {
        const res = await fetch(url, {
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        return {
          configured: true,
          failure: res.ok ? null : `${slug}:${res.status}`,
        };
      } catch {
        return { configured: true, failure: `${slug}:fetch-error` };
      }
    }),
  );
  // No Google key in this environment — there is nothing to measure.
  if (probes.some((probe) => !probe.configured)) return [];
  const failures = probes
    .map((probe) => probe.failure)
    .filter((failure): failure is string => Boolean(failure));
  const failed = failures.length;
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

const EVENT_SOURCE_FAILURE_THRESHOLD = 2;
const BROAD_EVENT_SOURCE_FAILURES = new Set(["municipal calendars"]);

/**
 * A populated event board is not proof that its runtime sources are healthy:
 * curated seed rows and committed venue snapshots deliberately survive a live
 * outage. Turn broad source degradation into its own operator signal.
 *
 * One named provider may fail transiently, and the raw data-health pull already
 * reports that provider by name. The unified-board gate goes red when at least
 * two source paths are unavailable, or when one umbrella failure represents
 * the whole municipal-calendar fanout.
 */
export function eventSourceHealthAnomaly(
  sourceHealth: EventSourceHealth,
): Anomaly | null {
  const unavailable = [...new Set(sourceHealth.unavailable)]
    .map((source) => source.trim())
    .filter(Boolean)
    .sort();
  if (!sourceHealth.degraded || unavailable.length === 0) return null;

  const broadFailure = unavailable.some((source) =>
    BROAD_EVENT_SOURCE_FAILURES.has(source),
  );
  if (
    !broadFailure
    && unavailable.length < EVENT_SOURCE_FAILURE_THRESHOLD
  ) {
    return null;
  }

  return {
    source: "unified-events",
    kind: "events_sources_degraded",
    detail:
      `${unavailable.length} runtime event source${unavailable.length === 1 ? "" : "s"} unavailable (${unavailable.join(", ")}). ` +
      "Curated or cached fallback events may still keep the board populated; treat event coverage as partial until the sources recover.",
  };
}

/** A county with zero public events on ANY day means the assembly (not one
 *  feed — the whole unified pipeline) broke. Source coverage is checked
 *  separately so one surviving fallback card cannot make the gate green. */
export async function eventsTripwire(now: Date = new Date()): Promise<Anomaly[]> {
  try {
    const { publicEvents, sourceHealth } = await assembleUnifiedEvents(now);
    const today = publicEvents.filter((e) => isEventToday(e.starts_at, now)).length;
    const sourceAnomaly = eventSourceHealthAnomaly(sourceHealth);
    const anomalies: Anomaly[] = sourceAnomaly ? [sourceAnomaly] : [];
    if (today === 0) {
      anomalies.unshift({
        source: "unified-events",
        kind: "events_empty",
        detail: "assembleUnifiedEvents returned ZERO public events for today — the unified pipeline (feeds + classification + time-sanity) is broken upstream of every events surface.",
      });
    }
    return anomalies;
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
  // The most load-bearing committed artifact in the repo, and until now the
  // only one this watchdog did not watch. Every open/closed claim the app
  // makes comes from these rows, and they expire 7 days after their own
  // stamps (HOURS_MAX_AGE_DAYS) — so when the writer stalls, coverage does
  // not decay gently, it reaches zero the day the newest row ages out. A
  // six-day window is one day of daylight before that.
  check(
    "places-hours-refresh",
    Object.entries(HOURS_REFRESH as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .map(([, value]) => (value as { refreshed_at?: string })?.refreshed_at),
    HOURS_SNAPSHOT_MAX_AGE_DAYS,
    "The Vercel hours cron has stopped landing rows. Verify HOURS_REFRESH_CRON=1, GOOGLE_PLACES_API_KEY, DATABASE_URL and CRON_SECRET in Production, then run the data-steward workflow.",
  );
  // The newest-stamp check above answers "did the WRITER stop". It cannot
  // answer "did DELIVERY stop", and delivery is what actually failed: the
  // refresh rotates a sixth of the catalog per day, so when the committed
  // artifact stops being updated, coverage does not fall off a cliff, it
  // decays as a ramp. Measured on the real artifact, publishable rows go
  // 1160, 1160, 950, 765, 593, 372, 203, 0 across seven days of staleness.
  // The newest-stamp alarm is still green at day five, when 68% of the
  // county's hours are already gone, and first turns red at day six with 203
  // rows left. It sat green through the August blackout for that reason.
  //
  // Measure what the reader actually loses. Below 85% publishable fires on
  // day two and leaves five days to act.
  const hoursRows = Object.entries(HOURS_REFRESH as Record<string, unknown>)
    .filter(([key]) => !key.startsWith("_"))
    .map(([, value]) => value as { refreshed_at?: string; weekday_hours?: unknown });
  const withSchedule = hoursRows.filter((row) => Array.isArray(row.weekday_hours));
  if (withSchedule.length > 0) {
    const publishable = withSchedule.filter((row) =>
      isHoursFresh(row.refreshed_at, now),
    ).length;
    const share = publishable / withSchedule.length;
    if (share < HOURS_PUBLISHABLE_MIN_SHARE) {
      out.push({
        source: "places-hours-refresh",
        kind: "ingest_stale",
        detail:
          `Only ${Math.round(share * 100)}% of the ${withSchedule.length} committed hour schedules are still inside the ${HOURS_MAX_AGE_DAYS}-day publishing window ` +
          `(${publishable} rows). Open and closed states are already going dark across the county. The refresh itself may be healthy — check whether the data-steward PR is merging, not just whether the cron ran.`,
      });
    }
  }
  return out;
}

/**
 * The share of committed hour schedules that must still be publishable before
 * the artifact counts as delivered. Set from the real decay ramp: a healthy
 * artifact sits at 100%, one day of missed delivery holds at 100%, and two
 * days drops to 82%.
 */
export const HOURS_PUBLISHABLE_MIN_SHARE = 0.85;

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

export const TRIPWIRE_DEADLINE_MS = 20_000;

/**
 * No single watchdog may consume the whole cron budget. A timed-out check is
 * red, never silently skipped, so bounding the work preserves health coverage
 * while guaranteeing the board can still be delivered.
 */
export async function tripwireWithDeadline(
  source: string,
  promise: Promise<Anomaly[]>,
  timeoutMs = TRIPWIRE_DEADLINE_MS,
): Promise<Anomaly[]> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.catch((err) => [{
      source,
      kind: "tripwire_failed" as const,
      detail: `The ${source} tripwire failed: ${err instanceof Error ? err.message : String(err)}`,
    }]),
    new Promise<Anomaly[]>((resolve) => {
      timer = setTimeout(
        () => resolve([{
          source,
          kind: "tripwire_failed",
          detail: `The ${source} tripwire exceeded its ${timeoutMs}ms deadline.`,
        }]),
        timeoutMs,
      );
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
 * Ask's private local-search index, checked for a pulse.
 *
 * Postgres FTS is the required baseline. Direct OpenAI embeddings are an
 * optional recall layer because AI Gateway does not support embedding models.
 * The index is populated by `/api/cron/radius-search`, with
 * `npm run build:radius-search` as the one-off bootstrap.
 *
 * Red when searchable rows are empty or stale. Vector coverage is only a
 * fault when OPENAI_API_KEY is configured and the optional backfill is
 * expected to be operating.
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
    const total = rows?.[0]?.total ?? 0;
    const embedded = rows?.[0]?.embedded ?? 0;
    const expected = publicPlaces().length;
    if (total === 0) {
      return [
        {
          source: "semantic-search",
          kind: "index_empty",
          detail:
            `radius_search_documents holds 0 searchable documents, so Ask cannot use its private local index. ` +
            `Enable the radius-search cron or run \`npm run build:radius-search\` with DATABASE_URL to index the ${expected} public places.`,
        },
      ];
    }
    if (expected > 0 && total < expected * 0.8) {
      return [
        {
          source: "semantic-search",
          kind: "index_stale",
          detail:
            `radius_search_documents covers ${total} of ${expected} public places (${Math.round((total / expected) * 100)}%). ` +
            `Check the radius-search cron or re-run \`npm run build:radius-search\`; both are incremental.`,
        },
      ];
    }
    if (
      process.env.OPENAI_API_KEY &&
      embedded < Math.max(1, total * 0.8)
    ) {
      return [
        {
          source: "semantic-search",
          kind: "embedding_stale",
          detail:
            `${embedded} of ${total} local search documents have optional semantic vectors. ` +
            `OPENAI_API_KEY is configured, so check the radius-search cron or re-run \`npm run build:radius-search\` to continue the backfill.`,
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
export async function runTripwires(
  now: Date = new Date(),
  timeoutMs = TRIPWIRE_DEADLINE_MS,
): Promise<TripwireReport> {
  const [photos, transit, events, ask, conditions, semantic] = await Promise.all([
    tripwireWithDeadline("photos", photoTripwire(), timeoutMs),
    tripwireWithDeadline("transit", transitTripwire(), timeoutMs),
    tripwireWithDeadline("events", eventsTripwire(now), timeoutMs),
    tripwireWithDeadline("ask-canary", askCanaryTripwire(), timeoutMs),
    tripwireWithDeadline("live-conditions", conditionsTripwire(), timeoutMs),
    tripwireWithDeadline("semantic-index", semanticIndexTripwire(), timeoutMs),
  ]);
  const ingest = ingestFreshnessTripwire(now);
  return {
    anomalies: [...photos, ...transit, ...events, ...ask, ...conditions, ...semantic, ...ingest],
    checks: [
      { name: "photos", green: photos.length === 0 },
      { name: "transit", green: transit.length === 0 },
      {
        name: "events-today",
        green: !events.some((anomaly) => anomaly.kind === "events_empty"),
      },
      {
        name: "event-sources",
        green: !events.some(
          (anomaly) => anomaly.kind === "events_sources_degraded",
        ),
      },
      { name: "ask-canary", green: ask.length === 0 },
      { name: "live-conditions", green: conditions.length === 0 },
      { name: "semantic-index", green: semantic.length === 0 },
      { name: "ingest-freshness", green: ingest.length === 0 },
    ],
  };
}
