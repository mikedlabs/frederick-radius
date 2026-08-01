/**
 * FCVFRA — Frederick County Volunteer Fire & Rescue Association ingester. Runs
 * as a Vercel cron (daily) — a separate context from the user-facing app, which
 * only reads `ingested_events`. Scrapes the county-wide fire-company events hub
 * (carnivals, bingo, fish fries, crab feasts across the gap towns) and writes
 * the next upcoming occurrence of each recurring series. The next-occurrence
 * advances on each daily run (DTSTAMP-gated upsert).
 *
 *   GET /api/ingest/fcvfra           (cron, needs CRON_SECRET)
 *   GET /api/ingest/fcvfra?dry=1     (auth required; fetch + parse + count only)
 */
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSql } from "@/lib/db/client";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import {
  geocodeLimitForRemaining,
  geocodePending,
  type GeocodeStats,
} from "@/lib/ingest/geocode";
import { fcvfraMapListing, FCVFRA_SOURCE_DOMAIN } from "@/lib/ingest/fcvfra";
import { startIngestRun, finishIngestRun } from "@/lib/ingest/run-log";
import { checkEventSchemaReadiness } from "@/lib/ingest/event-schema-readiness";
import {
  safeIngestWriteError,
  summarizeIngestWriteFailures,
  type IngestWriteStatus,
} from "@/lib/ingest/write-outcome";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const LISTING_URL = "https://www.fcvfra.com/apps/public/events/";
const UA = "FrederickRadius/1.0 (+https://frederickradius.app; fire-company event index)";
const GEOCODE_CAP = 400;
const ROUTE_DEADLINE_MS = 105_000;

type GeocodeRouteResult = GeocodeStats & { error?: string };

function deferredGeocode(reason: "route-budget" | "upstream", error?: string): GeocodeRouteResult {
  return {
    fromCache: 0,
    fromApi: 0,
    failed: reason === "upstream" ? 1 : 0,
    seeded: 0,
    revalidated: 0,
    repaired: 0,
    cleared: 0,
    status: "degraded",
    degradedReason: reason,
    budgetStopped: reason === "route-budget" ? 1 : 0,
    error,
  };
}

async function fetchListing(): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(LISTING_URL, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  // A dry run still downloads and parses the remote listing.
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const sql = getSql();
  if (!sql && !dry) {
    return Response.json({
      ok: false,
      status: "error",
      dry,
      error: "no database",
    }, { status: 503 });
  }

  const t0 = Date.now();
  const routeDeadlineAt = t0 + ROUTE_DEADLINE_MS;
  // obs-2: record this run so a silent partial failure (feed half-fetched,
  // geocoder down) is visible in ingest_runs instead of only showing up when
  // counts visibly drop. Dry runs do not write a heartbeat; non-dry runs
  // already failed above when the database was unavailable.
  const runId = !dry && sql ? await startIngestRun(FCVFRA_SOURCE_DOMAIN) : null;
  if (!dry && sql) {
    let missing: string[] = [];
    let schemaError: string | undefined;
    try {
      const readiness = await checkEventSchemaReadiness(sql, "civic-ingest");
      missing = readiness.missing;
      if (!readiness.ready) {
        schemaError =
          `Event ingest schema is not ready: missing ${missing.join(", ")}.`;
      }
    } catch (error) {
      schemaError =
        `Event ingest schema check failed: ${safeIngestWriteError(error)}`;
    }
    if (schemaError) {
      await finishIngestRun(runId, {
        status: "error",
        records_in: 0,
        records_upserted: 0,
        records_failed: 1,
        error: schemaError,
      });
      return Response.json({
        ok: false,
        status: "error",
        dry,
        error: schemaError,
        schema: { ready: false, missing },
      }, { status: 503 });
    }
  }
  const html = await fetchListing();
  if (!html) {
    await finishIngestRun(runId, { status: "error", error: "listing fetch failed" });
    return Response.json({ ok: false, error: "listing fetch failed", dry }, { status: 502 });
  }

  // Wrap the mapper so a parser throw stamps the run as error rather than
  // leaving a dangling 'running' row that getRecentIngestRuns surfaces forever.
  let mapped: ReturnType<typeof fcvfraMapListing>;
  try {
    mapped = fcvfraMapListing(html, new Date());
  } catch (e) {
    await finishIngestRun(runId, {
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
  const stats: UpsertStats = emptyStats();
  const perMunicipality: Record<string, number> = {};
  let failed = 0;
  let firstWriteError: string | undefined;

  for (const { event, municipality, category } of mapped) {
    perMunicipality[municipality] = (perMunicipality[municipality] ?? 0) + 1;
    if (dry || !sql) continue;
    try {
      await upsertEvent(sql, { sourceDomain: FCVFRA_SOURCE_DOMAIN, municipality, category }, event, stats);
    } catch (error) {
      failed++;
      firstWriteError ??= safeIngestWriteError(error);
    }
  }

  let geocode: GeocodeRouteResult | null = null;
  if (!dry && sql) {
    const geocodeLimit = geocodeLimitForRemaining(
      routeDeadlineAt - Date.now(),
      GEOCODE_CAP,
    );
    if (geocodeLimit === 0) {
      geocode = deferredGeocode(
        "route-budget",
        "geocode deferred because the route budget was exhausted",
      );
    } else {
      try {
        geocode = await geocodePending(sql, geocodeLimit, {
          deadlineAt: routeDeadlineAt,
        });
      } catch (err) {
        geocode = deferredGeocode(
          "upstream",
          err instanceof Error ? err.message : "geocode failed",
        );
      }
    }
  }

  const geocodeDegraded = geocode?.status === "degraded";
  const geocodeDegradedReason =
    geocode?.status === "degraded" ? geocode.degradedReason : undefined;
  const geocodeError = geocode?.error;
  const writeOutcome = summarizeIngestWriteFailures({
    attempted: dry ? 0 : mapped.length,
    failed,
    firstError: firstWriteError,
  });
  let runStatus: IngestWriteStatus = writeOutcome.status;
  if (writeOutcome.status === "error") {
    runStatus = "error";
  } else if (geocodeDegraded || writeOutcome.status === "partial") {
    runStatus = "partial";
  }
  const runError = [
    writeOutcome.error,
    geocodeDegraded
      ? `geocode degraded: ${geocodeDegradedReason}${
          geocodeError ? ` (${safeIngestWriteError(geocodeError)})` : ""
        }`
      : undefined,
  ]
    .filter((error): error is string => Boolean(error))
    .join("; ") || undefined;
  await finishIngestRun(runId, {
    status: runStatus,
    records_in: mapped.length,
    records_upserted: stats.normUpserted,
    records_failed: failed,
    error: runError,
  });

  // isr-1: real ingest wrote fresh rows — bust the event caches so /today,
  // /events, and /map pick up the new fire-company events immediately.
  if (!dry && sql && stats.normUpserted > 0) {
    revalidateTag("ingested-events", "max");
    revalidateTag("events", "max");
  }

  return Response.json({
    ok: dry || runStatus === "ok",
    status: dry ? "ok" : runStatus,
    dry,
    mapped: mapped.length,
    failed,
    perMunicipality,
    sample: dry ? mapped.slice(0, 12).map((m) => ({ uid: m.event.uid, title: m.event.summary, when: m.event.startsAtUtc, muni: m.municipality })) : undefined,
    stats: dry ? undefined : stats,
    geocode,
    duration_ms: Date.now() - t0,
    finishedAt: new Date().toISOString(),
  }, {
    status: !dry && runStatus === "error" ? 502 : 200,
  });
}
