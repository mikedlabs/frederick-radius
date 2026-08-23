/**
 * Nightly data-health recompute. Two passes:
 *
 *   1. Place-side: re-run dedup, copy scoring, coord divergence, hours
 *      coverage. The committed artifacts (places-dedup.json,
 *      copy-scores.json) are regenerated at build time by `npm run
 *      dedup` / `npm run copy:scores`; this is the report only.
 *
 *   2. Reporter-side: read the bounded feed-worker and event-archive
 *      heartbeats plus rolling snapshots, run database/tripwire checks,
 *      deliver the one coherent external report, and record the final board
 *      heartbeat.
 *
 * Fresh feed snapshotting, durable event archiving, and retention are
 * independently scheduled routes. This keeps one database backlog or upstream
 * fetch from consuming the final report's entire function window.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { PLACES } from "@/data/places";
import PLACES_DFP_RAW from "@/data/places-dfp.json" with { type: "json" };
import PLACES_CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import { buildDedup } from "@/lib/dedup";
import { classifyDescription, type CopyQuality } from "@/lib/copy-quality";
import { auditCoordDivergence, type CoordAuditPlace } from "@/lib/coord-audit";
import {
  getAnomalies,
  hydrateSnapshotsStrict,
} from "@/lib/integrations/feed-snapshot";
import { sendAnomalyAlert } from "@/lib/integrations/alerts";
import { computePlaceTrustReport } from "@/lib/quality/trust-report";
import { curatedFreshnessAnomalies } from "@/lib/quality/curated-freshness";
import {
  evaluateDbHealth,
  getLatestHoursRefreshAt,
  getRecentIngestRuns,
  type DbHealthEvaluation,
} from "@/lib/quality/db-health";
import { evaluateHoursPromotionHealth } from "@/lib/quality/hours-promotion-health";
import { runTripwires } from "@/lib/quality/tripwires";
import { deliverDataHealthReport } from "@/lib/integrations/github-alerts";
import {
  startIngestRunStrict,
  finishIngestRunStrict,
} from "@/lib/ingest/run-log";
import { readStoredFoodTruckSchedule } from "@/lib/food-trucks/schedule-store";
import { evaluateFoodTruckScheduleHealth } from "@/lib/quality/food-truck-schedule-health";
import { summarizeHoursRefreshArtifact } from "@/lib/quality/operator-coverage";
import { isGooglePlaceId } from "@/lib/provenance";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import {
  DATA_HEALTH_FEEDS_RUN,
  DATA_HEALTH_RETENTION_RUN,
  EVENT_ARCHIVE_RUN,
  evaluateDataHealthPhase,
} from "@/lib/quality/data-health-phases";
import { monitorCronResponse } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const HYDRATE_DEADLINE_MS = 8_000;
const DB_HEALTH_DEADLINE_MS = 18_000;
const HOURS_PROMOTION_DEADLINE_MS = 8_000;
const PHASE_HEARTBEAT_DEADLINE_MS = 8_000;
const FOOD_TRUCK_DEADLINE_MS = 8_000;
const TRIPWIRE_OUTER_DEADLINE_MS = 25_000;
const DELIVERY_DEADLINE_MS = 32_000;
const REPORT_HEARTBEAT_DEADLINE_MS = 8_000;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  return monitorCronResponse(
    "data-health",
    {
      schedule: "30 9 * * *",
      checkinMarginMinutes: 15,
      maxRuntimeMinutes: 3,
    },
    runDataHealthReport,
  );
}

async function runDataHealthReport() {
  const startedAt = Date.now();

  const dedup = buildDedup(PLACES);
  const folded = Object.entries(dedup).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(dedup).map((v) => v.canonical)).size;

  const clientPlaces = PLACES_CLIENT_RAW as Array<{
    slug: string;
    name: string;
    short_blurb?: string;
    description_reviewed?: boolean;
    google_place_id?: string;
  }>;
  const copy: Record<CopyQuality, number> = {
    none: 0,
    scraped: 0,
    auto_clean: 0,
    reviewed: 0,
  };
  for (const place of clientPlaces) {
    copy[
      classifyDescription(
        place.name,
        place.short_blurb,
        Boolean(place.description_reviewed),
      )
    ]++;
  }

  // Trust report (Section 8 gates, made measurable): provenance coverage,
  // current fresh-hours eligibility, the confidence distribution, and the
  // count of open/closed assertions whose hours verification is stale.
  const trust = computePlaceTrustReport();
  const googleBackedSlugs = new Set(
    clientPlaces
      .filter((place) => isGooglePlaceId(place.google_place_id))
      .map((place) => place.slug),
  );
  const hoursArtifact = summarizeHoursRefreshArtifact(
    HOURS_REFRESH_RAW as Record<string, unknown>,
    googleBackedSlugs,
  );

  // Coordinate-divergence regression gate: a curated place whose
  // coordinates disagree with the geocoded DFP record for the same
  // business by >200m is almost always a hand-entry error that renders
  // in the wrong place. This must stay at zero.
  const dfpRows = PLACES_DFP_RAW as Array<{
    name?: string;
    title?: string;
    address?: string;
    geom?: { lat: number; lng: number };
  }>;
  const coordFlags = auditCoordDivergence(
    PLACES.filter((p) => p.source !== "dfp").map(
      (p): CoordAuditPlace => ({ name: p.name, address: p.address, geom: p.geom }),
    ),
    dfpRows.map(
      (r): CoordAuditPlace => ({
        name: r.name ?? r.title ?? "",
        address: r.address,
        geom: r.geom,
      }),
    ),
    200,
  );

  // Read the fresh worker's persisted snapshots, but never let a telemetry read
  // hold the final reporter. The independently scheduled feed phase is the
  // authoritative freshness heartbeat when this read misses its deadline.
  const hydrateStartedAt = Date.now();
  const hydrateOutcome = await withDeadlineOutcome(
    hydrateSnapshotsStrict(),
    HYDRATE_DEADLINE_MS,
  );
  const hydrateMs = Date.now() - hydrateStartedAt;
  const anomalies = getAnomalies();
  const freshnessAnomalies = curatedFreshnessAnomalies();

  // Read the worker heartbeats before starting the DB-heavy checks. Production
  // commonly uses a max:1 Supabase pool; putting this required eight-second
  // read behind several nominally concurrent queries could make a healthy
  // worker look missing while its query simply waited in the connection queue.
  const healthWorkStartedAt = Date.now();
  const retentionPruneEnabled =
    process.env.DATA_RETENTION_PRUNE === "1";
  const phaseRunsOutcome = await withDeadlineOutcome(
    getRecentIngestRuns(),
    PHASE_HEARTBEAT_DEADLINE_MS,
  );
  // SEQUENTIALLY. The comment directly above already names the hazard, and
  // this Promise.all walked straight into it: Supavisor runs this app at
  // max: 1, so evaluateDbHealth() and readStoredFoodTruckSchedule() do not
  // overlap, they queue. Whichever loses the race sits in the connection
  // queue until its deadline fires and is then reported as a FAILURE.
  //
  // The consequence was not subtle. A starved evaluateDbHealth() yields
  // status "unavailable", the route's own contract turns that into a 503,
  // and the reporter heartbeat never lands. So the nightly data-health run
  // 503'd every night while the database was demonstrably fine (direct psql
  // in 253ms, other crons writing rows the same morning), and the tripwire
  // board froze at 2026-07-26 for 24 days. The one job whose entire purpose
  // is noticing that something broke was the thing that was broken, which is
  // a large part of why a county-wide hours blackout ran unnoticed.
  const dbOutcome = await withDeadlineOutcome(
    evaluateDbHealth(),
    DB_HEALTH_DEADLINE_MS,
  );
  const hoursPromotionOutcome = await withDeadlineOutcome(
    getLatestHoursRefreshAt(),
    HOURS_PROMOTION_DEADLINE_MS,
  );
  const foodTruckOutcome = await withDeadlineOutcome(
    readStoredFoodTruckSchedule(),
    FOOD_TRUCK_DEADLINE_MS,
  );
  const tripwireOutcome = await withDeadlineOutcome(
    runTripwires(),
    TRIPWIRE_OUTER_DEADLINE_MS,
  );
  const dbHealth: DbHealthEvaluation =
    dbOutcome.status === "fulfilled"
      ? dbOutcome.value
      : {
          status: "unavailable",
          reason: "query_failed",
          anomalies: [{
            source: "database",
            kind: "infrastructure_unavailable",
            detail: "Database health did not finish inside the reporter deadline.",
          }],
        };
  const tripwires =
    tripwireOutcome.status === "fulfilled"
      ? tripwireOutcome.value
      : {
          anomalies: [{
            source: "tripwires",
            kind: "tripwire_failed" as const,
            detail: "The tripwire group did not finish inside the reporter deadline.",
          }],
          checks: [{ name: "tripwire-execution", green: false }],
        };
  const storedFoodTruckSchedule =
    foodTruckOutcome.status === "fulfilled"
      ? foodTruckOutcome.value
      : null;
  const phaseRuns =
    phaseRunsOutcome.status === "fulfilled"
      ? phaseRunsOutcome.value
      : [];
  const feedPhase = evaluateDataHealthPhase(
    DATA_HEALTH_FEEDS_RUN,
    phaseRuns,
  );
  const eventArchivePhase = evaluateDataHealthPhase(
    EVENT_ARCHIVE_RUN,
    phaseRuns,
  );
  const retentionPhase = retentionPruneEnabled
    ? evaluateDataHealthPhase(
        DATA_HEALTH_RETENTION_RUN,
        phaseRuns,
      )
    : null;
  const phaseAnomalies = [
    feedPhase.anomaly,
    eventArchivePhase.anomaly,
    retentionPhase?.anomaly ?? null,
    ...(hydrateOutcome.status === "fulfilled"
      ? []
      : [{
          source: "feed-snapshot-hydration",
          kind: "tripwire_failed" as const,
          detail: "Snapshot hydration did not finish inside the reporter deadline.",
        }]),
  ].filter((anomaly): anomaly is NonNullable<typeof anomaly> => Boolean(anomaly));
  const healthWorkMs = Date.now() - healthWorkStartedAt;
  const dbAnomalies = dbHealth.anomalies;
  const hoursPromotionHealth = evaluateHoursPromotionHealth({
    sourceLatestAt:
      hoursPromotionOutcome.status === "fulfilled"
        ? hoursPromotionOutcome.value
        : null,
    artifactLatestAt: hoursArtifact.newestRefresh ?? null,
  });
  const foodTruckScheduleHealth =
    evaluateFoodTruckScheduleHealth(storedFoodTruckSchedule);

  // Slack post is fire-and-forget — it should never block the
  // cron's reply. The helper itself no-ops without a webhook URL.
  const allAnomalies = [
    ...anomalies,
    ...dbAnomalies,
    ...(hoursPromotionHealth.anomaly ? [hoursPromotionHealth.anomaly] : []),
    ...freshnessAnomalies,
    ...foodTruckScheduleHealth.anomalies,
    ...tripwires.anomalies,
    ...phaseAnomalies,
  ];
  if (allAnomalies.length > 0) {
    void sendAnomalyAlert(allAnomalies);
  }

  // THE ONE NUMBER. Every gate above collapsed to "N of M green" — the
  // owner-readable answer to "is the app quietly broken?", persisted as an
  // ingest_runs row so the admin board (and any later surface) can read the
  // latest headline without recomputing.
  const gates: Array<{ name: string; green: boolean }> = [
    {
      name: "open-now-eligibility",
      green: trust.fresh_hours.open_now_eligible,
    },
    { name: "provenance", green: !trust.provenance.below_gate },
    { name: "coord-divergence", green: coordFlags.length === 0 },
    { name: "feed-anomalies", green: anomalies.length === 0 },
    { name: "feed-worker", green: feedPhase.green },
    { name: "event-archive", green: eventArchivePhase.green },
    {
      name: "snapshot-history",
      green: hydrateOutcome.status === "fulfilled",
    },
    { name: "curated-freshness", green: freshnessAnomalies.length === 0 },
    { name: "food-truck-schedules", green: foodTruckScheduleHealth.green },
    {
      name: "db-health",
      green: dbHealth.status === "available" && dbAnomalies.length === 0,
    },
    {
      name: "hours-publication",
      green: hoursPromotionHealth.green,
    },
    ...(retentionPruneEnabled
      ? [{
          name: "data-retention",
          green: retentionPhase?.green === true,
        }]
      : []),
    ...tripwires.checks,
  ];
  const red = gates.filter((g) => !g.green);
  const headline = `${gates.length - red.length}/${gates.length} green${red.length > 0 ? ` · red: ${red.map((g) => g.name).join(", ")}` : ""}`;

  // GitHub Actions owns the durable health issue by default. Its automatic
  // GITHUB_TOKEN cannot expire and the production-health-alert workflow reads
  // /api/health after this reporter runs. The older Vercel -> GitHub path uses
  // a personal token; it repeatedly returned 401 after that token expired.
  // Keep the richer direct report available only as an explicit opt-in after
  // its credential has been probed, rather than retrying a known-broken secret
  // forever. This does not remove alerting: the Actions workflow remains the
  // non-expiring delivery floor.
  const directGitHubDeliveryEnabled =
    process.env.VERCEL_GITHUB_ALERTS_ENABLED === "1";
  const deliveryStartedAt = Date.now();
  const [deliveryOutcome, reporterHeartbeatOutcome] = await Promise.all([
    directGitHubDeliveryEnabled
      ? withDeadlineOutcome(
          deliverDataHealthReport({ headline, gates, anomalies: allAnomalies }),
          DELIVERY_DEADLINE_MS,
        )
      : Promise.resolve({
          status: "fulfilled" as const,
          value: "delegated_to_actions" as const,
        }),
    withDeadlineOutcome((async () => {
      const runId = await startIngestRunStrict("tripwires");
      if (!runId) throw new Error("Reporter heartbeat could not start.");
      await finishIngestRunStrict(runId, {
        status: red.length === 0 ? "ok" : "error",
        records_in: gates.length,
        records_upserted: gates.length - red.length,
        records_failed: red.length,
        error: red.length > 0 ? headline : null,
      });
    })(), REPORT_HEARTBEAT_DEADLINE_MS),
  ]);
  const githubDelivery =
    deliveryOutcome.status === "fulfilled"
      ? deliveryOutcome.value
      : "skipped";
  const reporterHeartbeatRecorded =
    reporterHeartbeatOutcome.status === "fulfilled";
  const deliveryMs = Date.now() - deliveryStartedAt;
  const requiredPhaseUnavailable =
    !feedPhase.green
    || !eventArchivePhase.green
    || hydrateOutcome.status !== "fulfilled"
    || (retentionPruneEnabled && retentionPhase?.green !== true);

  return NextResponse.json({
    summary: {
      headline,
      gates,
      status: red.length === 0 ? "healthy" : "degraded",
      degraded: red.length > 0,
      required_phase_unavailable: requiredPhaseUnavailable,
      github_delivery: githubDelivery,
      reporter_heartbeat_recorded: reporterHeartbeatRecorded,
    },
    computed_at: new Date().toISOString(),
    timing_ms: {
      total: Date.now() - startedAt,
      hydrate_snapshots: hydrateMs,
      concurrent_health_work: healthWorkMs,
      github_delivery: deliveryMs,
      deadlines: {
        hydrate_snapshots: HYDRATE_DEADLINE_MS,
        db_health: DB_HEALTH_DEADLINE_MS,
        hours_publication: HOURS_PROMOTION_DEADLINE_MS,
        phase_heartbeats: PHASE_HEARTBEAT_DEADLINE_MS,
        food_truck_schedule: FOOD_TRUCK_DEADLINE_MS,
        tripwires: TRIPWIRE_OUTER_DEADLINE_MS,
        github_delivery: DELIVERY_DEADLINE_MS,
        reporter_heartbeat: REPORT_HEARTBEAT_DEADLINE_MS,
      },
    },
    places: clientPlaces.length,
    dedup: { clusters, folded },
    hours: {
      fresh_count: trust.fresh_hours.fresh_count,
      total_count: trust.fresh_hours.total_count,
      coverage_pct: trust.fresh_hours.coverage_pct,
      target_count: trust.fresh_hours.target_count,
      target_pct: trust.fresh_hours.target_pct,
      open_now_eligible: trust.fresh_hours.open_now_eligible,
      below_gate: trust.fresh_hours.below_gate,
      checked_at: trust.fresh_hours.checked_at,
      source: trust.fresh_hours.source,
      refresh_cycle: hoursArtifact.cycle,
      refresh_rows: {
        expected: hoursArtifact.expectedGoogleBackedPlaces,
        fresh: hoursArtifact.freshRefreshRows,
        with_fresh_schedule: hoursArtifact.freshRows,
        invalid_timestamps: hoursArtifact.invalidTimestamps,
        unmatched: hoursArtifact.unmatchedRows,
        oldest_refresh: hoursArtifact.oldestRefresh ?? null,
        newest_refresh: hoursArtifact.newestRefresh ?? null,
      },
      publication: {
        green: hoursPromotionHealth.green,
        state: hoursPromotionHealth.state,
        source_latest_at: hoursPromotionHealth.sourceLatestAt,
        artifact_latest_at: hoursPromotionHealth.artifactLatestAt,
        lag_hours: hoursPromotionHealth.lagHours,
        max_lag_hours: hoursPromotionHealth.maxLagHours,
      },
      note: "Only current verified schedules count. Stored or historical schedules do not.",
    },
    trust: {
      provenance_coverage_pct: trust.provenance.coverage_pct,
      provenance_below_gate: trust.provenance.below_gate,
      provenance_missing_sample: trust.provenance.missing_sample,
      confidence: trust.confidence,
      open_assertions: trust.open_assertions.asserting,
      stale_open_assertions: trust.open_assertions.stale_or_missing,
      stale_open_sample: trust.open_assertions.stale_sample,
    },
    copy,
    coord_divergence: {
      threshold_m: 200,
      count: coordFlags.length,
      below_gate: coordFlags.length > 0,
      flagged: coordFlags.slice(0, 25),
    },
    feeds: {
      anomalies,
      anomaly_count: anomalies.length,
      snapshot_hydration: hydrateOutcome.status,
      // The Slack helper is deliberately fail-soft and is not awaited. This is
      // a request signal, not proof of delivery.
      slack_alert_requested:
        allAnomalies.length > 0 && Boolean(process.env.SLACK_WEBHOOK_URL),
    },
    curated_freshness: {
      anomalies: freshnessAnomalies,
    },
    phases: {
      feeds: {
        green: feedPhase.green,
        status: feedPhase.run?.status ?? null,
        started_at: feedPhase.run?.startedAt ?? null,
        ended_at: feedPhase.run?.endedAt ?? null,
        sources_checked: feedPhase.run?.recordsIn ?? 0,
        snapshots_persisted: feedPhase.run?.recordsUpserted ?? 0,
        failed: feedPhase.run?.recordsFailed ?? null,
      },
      event_archive: {
        green: eventArchivePhase.green,
        status: eventArchivePhase.run?.status ?? null,
        started_at: eventArchivePhase.run?.startedAt ?? null,
        ended_at: eventArchivePhase.run?.endedAt ?? null,
        events_seen: eventArchivePhase.run?.recordsIn ?? 0,
        events_upserted: eventArchivePhase.run?.recordsUpserted ?? 0,
        failed: eventArchivePhase.run?.recordsFailed ?? null,
      },
      retention: {
        enabled: retentionPruneEnabled,
        green: retentionPhase?.green ?? null,
        status: retentionPhase?.run?.status ?? null,
        started_at: retentionPhase?.run?.startedAt ?? null,
        ended_at: retentionPhase?.run?.endedAt ?? null,
        rows_deleted: retentionPhase?.run?.recordsUpserted ?? null,
        failed: retentionPhase?.run?.recordsFailed ?? null,
      },
    },
    food_truck_schedules: {
      green: foodTruckScheduleHealth.green,
      generated_at: foodTruckScheduleHealth.generatedAt,
      age_hours: foodTruckScheduleHealth.ageHours,
      stop_count: foodTruckScheduleHealth.stopCount,
      source_count: foodTruckScheduleHealth.sourceCount,
      failed_sources: foodTruckScheduleHealth.failedSources,
      anomalies: foodTruckScheduleHealth.anomalies,
    },
    db_health: {
      status: dbHealth.status,
      unavailable_reason: dbHealth.reason,
      anomalies: dbAnomalies,
      rls_unprotected: dbAnomalies.filter((a) => a.kind === "rls_unprotected").map((a) => a.source),
      ingest_stale: dbAnomalies.filter((a) => a.kind === "ingest_stale").map((a) => a.source),
    },
    tripwires: {
      checks: tripwires.checks,
      anomalies: tripwires.anomalies,
    },
    note: "This final reporter is read-mostly. Feed snapshot writes and optional retention run in separately scheduled, bounded workers.",
  }, {
    // This route is a reporter. A red gate is valid report data, not an HTTP
    // execution failure. Return 503 only when the reporter cannot evaluate the
    // database or cannot durably record that it finished; all degraded gates
    // remain explicit in the headline, summary, phase detail, and alerts.
    status:
      dbHealth.status === "unavailable"
      || !reporterHeartbeatRecorded
        ? 503
        : 200,
  });
}
