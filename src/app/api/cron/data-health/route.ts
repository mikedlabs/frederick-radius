/**
 * Nightly data-health recompute. Two passes:
 *
 *   1. Place-side: re-run dedup, copy scoring, coord divergence, hours
 *      coverage. The committed artifacts (places-dedup.json,
 *      copy-scores.json) are regenerated at build time by `npm run
 *      dedup` / `npm run copy:scores`; this is the report only.
 *
 *   2. Feed-side: hydrate the rolling snapshot buffer from Postgres,
 *      pull every live feed, record fresh snapshots, compute anomaly
 *      flags, and fire a Slack alert when anything trips. Then prune
 *      snapshots older than 90 days so the table never grows
 *      unbounded.
 *
 * This route is the health signal for /admin/data-health and external
 * uptime checks. Hosted-only (Vercel cron); locally hit by hand.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { PLACES } from "@/data/places";
import PLACES_DFP_RAW from "@/data/places-dfp.json" with { type: "json" };
import { buildDedup } from "@/lib/dedup";
import { classifyDescription, type CopyQuality } from "@/lib/copy-quality";
import { rankPlaces, hoursCoverage } from "@/lib/loaders/places";
import { auditCoordDivergence, type CoordAuditPlace } from "@/lib/coord-audit";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import {
  getAnomalies,
  hydrateSnapshots,
  persistCurrentSnapshots,
  pruneOldSnapshots,
} from "@/lib/integrations/feed-snapshot";
import { prunePushLog } from "@/lib/push-fanout";
import { pruneNfcEvents } from "@/lib/nfc-retention";
import { consumeFeedMetrics } from "@/lib/integrations/event-schema";
import { sendAnomalyAlert } from "@/lib/integrations/alerts";
import { computePlaceTrustReport } from "@/lib/quality/trust-report";
import { curatedFreshnessAnomalies, liveSourceAnomalies } from "@/lib/quality/curated-freshness";
import { pruneExpiredReports } from "@/lib/loaders/communityReports";
import { evaluateDbHealth } from "@/lib/quality/db-health";
import { runTripwires } from "@/lib/quality/tripwires";
import { deliverDataHealthReport } from "@/lib/integrations/github-alerts";
import { startIngestRun, finishIngestRun } from "@/lib/ingest/run-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // tripwires add live fetches + one canary model call

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;
  const startedAt = Date.now();

  const dedup = buildDedup(PLACES);
  const folded = Object.entries(dedup).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(dedup).map((v) => v.canonical)).size;

  const copy: Record<CopyQuality, number> = { none: 0, scraped: 0, auto_clean: 0, reviewed: 0 };
  for (const p of PLACES) copy[classifyDescription(p.name, p.description ?? p.short_blurb)]++;

  const ranked = rankPlaces({});
  const coverage = Number((hoursCoverage(ranked) * 100).toFixed(1));

  // Trust report (Section 8 gates, made measurable): provenance coverage,
  // the confidence distribution, and the count of open/closed assertions
  // whose hours verification is stale (the freshness flip's blast radius).
  const trust = computePlaceTrustReport();

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

  // ─────────────────────────────────────────────────────
  // Feed-side: hydrate, fetch, snapshot, detect, alert, prune.
  // Each step is isolated so one slow/failing feed can't break
  // the full health report. Missing DB infrastructure is the exception:
  // without it, the DB checks were never evaluated, so the route returns 503.
  // ─────────────────────────────────────────────────────
  const hydrateStartedAt = Date.now();
  await hydrateSnapshots().catch((err) => {
    console.error("[cron/data-health] hydrate failed:", err);
  });
  const hydrateMs = Date.now() - hydrateStartedAt;
  const liveFetchStartedAt = Date.now();
  const live = await getLiveEvents(60).catch((err) => {
    console.error("[cron/data-health] live fetch failed:", err);
    return { events: [], sources_succeeded: [], sources_failed: ["getLiveEvents:threw"] };
  });
  const liveFetchMs = Date.now() - liveFetchStartedAt;
  const anomalies = getAnomalies();
  const validation = consumeFeedMetrics();
  // Curated-freshness assertions (data audit meta-fix): expired committed
  // snapshots, aging hand-verifications, and named live-feed failures become
  // red lines on the same alert channel instead of silent blanks.
  const freshnessAnomalies = [
    ...curatedFreshnessAnomalies(),
    ...liveSourceAnomalies(live.sources_failed),
  ];

  // These operations are independent after the fresh feed pull. Running them
  // serially made the cron pay the sum of every network and database wait:
  // retention alone could consume four statement-timeout windows before the
  // tripwires even started. Each cleanup is batch-bounded in its helper, and
  // Promise.all makes the route pay only the slowest independent operation.
  const healthWorkStartedAt = Date.now();
  // Retention deletes are intentionally gated separately from health checks.
  // Production has a large legacy snapshot backlog, and backup inventory is
  // not exposed through the management connector. Keep the cron fast and
  // non-destructive until a recent Supabase backup is confirmed, then enable
  // bounded oldest-first cleanup with DATA_RETENTION_PRUNE=1.
  const retentionPruneEnabled =
    process.env.DATA_RETENTION_PRUNE === "1";
  const [
    persistedSnapshots,
    prunedRows,
    prunedPushRows,
    prunedNfcEvents,
    prunedReports,
    dbHealth,
    tripwires,
  ] = await Promise.all([
    persistCurrentSnapshots(live.sources_succeeded).catch((err) => {
      console.error("[cron/data-health] snapshot persist failed:", err);
      return 0;
    }),
    retentionPruneEnabled
      ? pruneOldSnapshots(90).catch((err) => {
          console.error("[cron/data-health] prune failed:", err);
          return 0;
        })
      : Promise.resolve(0),
    // push_log is append-only — every civic-alert fanout writes a row for
    // dedupe. The same 90d retention window covers any re-publish window.
    retentionPruneEnabled
      ? prunePushLog(90).catch((err) => {
          console.error("[cron/data-health] push_log prune failed:", err);
          return 0;
        })
      : Promise.resolve(0),
    // nfc_events is append-only (one row per member page view / action).
    retentionPruneEnabled
      ? pruneNfcEvents(90).catch((err) => {
          console.error("[cron/data-health] nfc_events prune failed:", err);
          return 0;
        })
      : Promise.resolve(0),
    // Pending community reports are never touched; this helper removes only
    // an intentionally small batch of expired/rejected rows.
    retentionPruneEnabled
      ? pruneExpiredReports().catch((err) => {
          console.error("[cron/data-health] community report prune failed:", err);
          return 0;
        })
      : Promise.resolve(0),
    // DB-health guards (mig-6 + ING-5): both queries must complete before this
    // gate can be green.
    evaluateDbHealth(),
    // End-to-end tripwires: the politely-degrading failure classes (photo
    // rot, transit zero-routes, dead event assembly, degraded ask).
    runTripwires().catch((err) => {
      console.error("[cron/data-health] tripwires failed:", err);
      return {
        anomalies: [{
          source: "tripwires",
          kind: "tripwire_failed" as const,
          detail: `The data-health tripwire runner failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
        checks: [{ name: "tripwire-execution", green: false }],
      };
    }),
  ]);
  const healthWorkMs = Date.now() - healthWorkStartedAt;
  const dbAnomalies = dbHealth.anomalies;

  // Slack post is fire-and-forget — it should never block the
  // cron's reply. The helper itself no-ops without a webhook URL.
  const allAnomalies = [...anomalies, ...dbAnomalies, ...freshnessAnomalies, ...tripwires.anomalies];
  if (allAnomalies.length > 0) {
    void sendAnomalyAlert(allAnomalies);
  }

  // THE ONE NUMBER. Every gate above collapsed to "N of M green" — the
  // owner-readable answer to "is the app quietly broken?", persisted as an
  // ingest_runs row so the admin board (and any later surface) can read the
  // latest headline without recomputing.
  const gates: Array<{ name: string; green: boolean }> = [
    { name: "hours-coverage", green: coverage >= 60 },
    { name: "provenance", green: !trust.provenance.below_gate },
    { name: "coord-divergence", green: coordFlags.length === 0 },
    { name: "feed-anomalies", green: anomalies.length === 0 },
    { name: "curated-freshness", green: freshnessAnomalies.length === 0 },
    {
      name: "db-health",
      green: dbHealth.status === "available" && dbAnomalies.length === 0,
    },
    ...tripwires.checks,
  ];
  const red = gates.filter((g) => !g.green);
  const headline = `${gates.length - red.length}/${gates.length} green${red.length > 0 ? ` · red: ${red.map((g) => g.name).join(", ")}` : ""}`;

  // GitHub delivery — the channel the owner already checks. One issue per
  // incident: opens on the first red morning, gains a daily comment while
  // red, closes itself on recovery. AWAITED (not void like the Slack post):
  // delivery is this feature's entire point, and serverless drops floating
  // promises. Fail-soft inside; "skipped" without GITHUB_ALERTS_TOKEN.
  const deliveryStartedAt = Date.now();
  const [githubDelivery] = await Promise.all([
    deliverDataHealthReport({ headline, gates, anomalies: allAnomalies }),
    (async () => {
      const runId = await startIngestRun("tripwires");
      await finishIngestRun(runId, {
        status: red.length === 0 ? "ok" : "error",
        records_in: gates.length,
        records_upserted: gates.length - red.length,
        records_failed: red.length,
        error: red.length > 0 ? headline : null,
      });
    })(),
  ]);
  const deliveryMs = Date.now() - deliveryStartedAt;

  return NextResponse.json({
    summary: { headline, gates, github_delivery: githubDelivery },
    computed_at: new Date().toISOString(),
    timing_ms: {
      total: Date.now() - startedAt,
      hydrate_snapshots: hydrateMs,
      live_feed_fetch: liveFetchMs,
      concurrent_health_work: healthWorkMs,
      github_delivery: deliveryMs,
    },
    places: PLACES.length,
    dedup: { clusters, folded },
    hours: { coverage_pct: coverage, target_pct: 60, below_gate: coverage < 60 },
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
      validation,
      anomalies,
      anomaly_count: anomalies.length,
      persisted_snapshots: persistedSnapshots,
      retention_prune_enabled: retentionPruneEnabled,
      pruned_old_snapshots: prunedRows,
      pruned_push_log: prunedPushRows,
      pruned_nfc_events: prunedNfcEvents,
      alert_sent: allAnomalies.length > 0 && Boolean(process.env.SLACK_WEBHOOK_URL),
    },
    curated_freshness: {
      anomalies: freshnessAnomalies,
      live_sources_failed: live.sources_failed,
      live_sources_succeeded: live.sources_succeeded.length,
    },
    db_health: {
      status: dbHealth.status,
      unavailable_reason: dbHealth.reason,
      anomalies: dbAnomalies,
      pruned_expired_reports: prunedReports,
      rls_unprotected: dbAnomalies.filter((a) => a.kind === "rls_unprotected").map((a) => a.source),
      ingest_stale: dbAnomalies.filter((a) => a.kind === "ingest_stale").map((a) => a.source),
    },
    tripwires: {
      checks: tripwires.checks,
      anomalies: tripwires.anomalies,
    },
    note: "This endpoint only recomputes health; commit-time scripts persist artifacts.",
  }, {
    status: dbHealth.status === "unavailable" ? 503 : 200,
  });
}
