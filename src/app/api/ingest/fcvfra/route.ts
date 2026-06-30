/**
 * FCVFRA — Frederick County Volunteer Fire & Rescue Association ingester. Runs
 * as a Vercel cron (daily) — a separate context from the user-facing app, which
 * only reads `ingested_events`. Scrapes the county-wide fire-company events hub
 * (carnivals, bingo, fish fries, crab feasts across the gap towns) and writes
 * the next upcoming occurrence of each recurring series. The next-occurrence
 * advances on each daily run (DTSTAMP-gated upsert).
 *
 *   GET /api/ingest/fcvfra           (cron, needs CRON_SECRET)
 *   GET /api/ingest/fcvfra?dry=1     (fetch + parse + count only, no writes)
 */
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSql } from "@/lib/db/client";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import { geocodePending } from "@/lib/ingest/geocode";
import { fcvfraMapListing, FCVFRA_SOURCE_DOMAIN } from "@/lib/ingest/fcvfra";
import { startIngestRun, finishIngestRun } from "@/lib/ingest/run-log";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const LISTING_URL = "https://www.fcvfra.com/apps/public/events/";
const UA = "FrederickRadius/1.0 (+https://frederickradius.app; fire-company event index)";

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
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (!dry) {
    const denied = verifyCronAuth(req);
    if (denied) return denied;
  }

  const sql = getSql();
  if (!sql && !dry) return Response.json({ error: "no database" }, { status: 503 });

  const t0 = Date.now();
  // obs-2: record this run so a silent partial failure (feed half-fetched,
  // geocoder down) is visible in ingest_runs instead of only showing up when
  // counts visibly drop. Fail-soft (no-op without a DB / on dry run).
  const runId = !dry && sql ? await startIngestRun(FCVFRA_SOURCE_DOMAIN) : null;
  const html = await fetchListing();
  if (!html) {
    await finishIngestRun(runId, { status: "error", error: "listing fetch failed" });
    return Response.json({ ok: false, error: "listing fetch failed", dry }, { status: 502 });
  }

  const mapped = fcvfraMapListing(html, new Date());
  const stats: UpsertStats = emptyStats();
  const perMunicipality: Record<string, number> = {};
  let failed = 0;

  for (const { event, municipality, category } of mapped) {
    perMunicipality[municipality] = (perMunicipality[municipality] ?? 0) + 1;
    if (dry || !sql) continue;
    try {
      await upsertEvent(sql, { sourceDomain: FCVFRA_SOURCE_DOMAIN, municipality, category }, event, stats);
    } catch {
      failed++;
    }
  }

  let geocode = null;
  if (!dry && sql) {
    try {
      geocode = await geocodePending(sql, 400);
    } catch (err) {
      geocode = { error: err instanceof Error ? err.message : "geocode failed" };
    }
  }

  await finishIngestRun(runId, {
    status: "ok",
    records_in: mapped.length,
    records_upserted: stats.normUpserted,
    records_failed: failed,
  });

  // isr-1: real ingest wrote fresh rows — bust the event caches so /today,
  // /events, and /map pick up the new fire-company events immediately.
  if (!dry && sql) {
    revalidateTag("ingested-events", "max");
    revalidateTag("events", "max");
  }

  return Response.json({
    ok: true,
    dry,
    mapped: mapped.length,
    failed,
    perMunicipality,
    sample: dry ? mapped.slice(0, 12).map((m) => ({ uid: m.event.uid, title: m.event.summary, when: m.event.startsAtUtc, muni: m.municipality })) : undefined,
    stats: dry ? undefined : stats,
    geocode,
    duration_ms: Date.now() - t0,
    finishedAt: new Date().toISOString(),
  });
}
