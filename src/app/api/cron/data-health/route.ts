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
  pruneOldSnapshots,
} from "@/lib/integrations/feed-snapshot";
import { consumeFeedMetrics } from "@/lib/integrations/event-schema";
import { sendAnomalyAlert } from "@/lib/integrations/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const dedup = buildDedup(PLACES);
  const folded = Object.entries(dedup).filter(([s, v]) => v.canonical !== s).length;
  const clusters = new Set(Object.values(dedup).map((v) => v.canonical)).size;

  const copy: Record<CopyQuality, number> = { none: 0, scraped: 0, auto_clean: 0, reviewed: 0 };
  for (const p of PLACES) copy[classifyDescription(p.name, p.description ?? p.short_blurb)]++;

  const ranked = rankPlaces({});
  const coverage = Number((hoursCoverage(ranked) * 100).toFixed(1));

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
  // the full health report. The cron body always returns 200.
  // ─────────────────────────────────────────────────────
  await hydrateSnapshots().catch((err) => {

    console.error("[cron/data-health] hydrate failed:", err);
  });
  await getLiveEvents(60).catch((err) => {

    console.error("[cron/data-health] live fetch failed:", err);
  });
  const anomalies = getAnomalies();
  const validation = consumeFeedMetrics();
  const prunedRows = await pruneOldSnapshots(90).catch((err) => {

    console.error("[cron/data-health] prune failed:", err);
    return 0;
  });
  // Slack post is fire-and-forget — it should never block the
  // cron's reply. The helper itself no-ops without a webhook URL.
  if (anomalies.length > 0) {
    void sendAnomalyAlert(anomalies);
  }

  return NextResponse.json({
    computed_at: new Date().toISOString(),
    places: PLACES.length,
    dedup: { clusters, folded },
    hours: { coverage_pct: coverage, target_pct: 60, below_gate: coverage < 60 },
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
      pruned_old_snapshots: prunedRows,
      alert_sent: anomalies.length > 0 && Boolean(process.env.SLACK_WEBHOOK_URL),
    },
    note: "Recompute only. Commit-time scripts persist the artifacts.",
  });
}
