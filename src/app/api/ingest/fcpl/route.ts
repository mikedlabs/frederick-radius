/**
 * FCPL — Frederick County Public Libraries ingester. Runs as a Vercel cron
 * (daily) — a separate execution context from the user-facing app, which only
 * reads `ingested_events`. The lc_calendar JSON feed is unbounded (~1,700
 * programs, 2.3MB, ~16s) and cannot be live-fetched inside the 8s request
 * budget, so it lives here. Library programs surface as the recurring-collapsed
 * civic calendar on /events, filling every gap town with story times, clubs,
 * and classes.
 *
 *   GET /api/ingest/fcpl           (cron, needs CRON_SECRET)
 *   GET /api/ingest/fcpl?dry=1     (auth required; fetch + parse + count only)
 *   GET /api/ingest/fcpl?only=brunswick
 */
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSql } from "@/lib/db/client";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import { geocodePending } from "@/lib/ingest/geocode";
import { fcplMapFeed, FCPL_SOURCE_DOMAIN } from "@/lib/ingest/fcpl";
import { startIngestRun, finishIngestRun } from "@/lib/ingest/run-log";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 300; // the feed alone is ~16s; upserts add more
export const dynamic = "force-dynamic";

const FEED_URL = "https://frederick.librarycalendar.com/events/feed/json";
const UA = "FrederickRadius/1.0 (+https://frederickradius.app; library event index)";

async function fetchFeed(): Promise<unknown[] | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000); // the feed is slow (~16s); allow headroom
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json) ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  // A dry run still downloads and parses the full remote feed.
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const only = req.nextUrl.searchParams.get("only");

  const sql = getSql();
  if (!sql && !dry) return Response.json({ error: "no database" }, { status: 503 });

  const t0 = Date.now();
  // obs-2: record this run so a silent partial failure is visible in
  // ingest_runs. Fail-soft (no-op without a DB / on dry run).
  const runId = !dry && sql ? await startIngestRun(FCPL_SOURCE_DOMAIN) : null;
  const feed = await fetchFeed();
  if (!feed) {
    await finishIngestRun(runId, { status: "error", error: "feed fetch failed" });
    return Response.json({ ok: false, error: "feed fetch failed", dry }, { status: 502 });
  }

  // Wrap the mapper so a parser throw stamps the run as error rather than
  // leaving a dangling 'running' row that getRecentIngestRuns surfaces forever.
  let mapped: ReturnType<typeof fcplMapFeed>;
  try {
    mapped = fcplMapFeed(feed, new Date());
    if (only) mapped = mapped.filter((m) => m.municipality.toLowerCase() === only.toLowerCase());
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
  let budgetStopped = 0;

  // Bounded-concurrency upserts with a hard time budget. The old strictly
  // sequential loop scaled linearly with the feed and outgrew maxDuration
  // as the library added programs — Vercel killed the function mid-run and
  // the run-log row dangled as "running" with nothing revalidated. Small
  // pool (one shared sql connection), and past the budget we STOP CLEANLY
  // and say so in ingest_runs instead of being killed silently. The daily
  // re-run resumes where the upserted rows left off (idempotent upserts).
  const BUDGET_MS = 240_000; // maxDuration 300s minus feed fetch + geocode headroom
  const POOL = 8;
  for (let i = 0; i < mapped.length; i += POOL) {
    if (Date.now() - t0 > BUDGET_MS && !dry && sql) {
      budgetStopped = mapped.length - i;
      break;
    }
    const chunk = mapped.slice(i, i + POOL);
    await Promise.all(
      chunk.map(async ({ event, municipality, category }) => {
        perMunicipality[municipality] = (perMunicipality[municipality] ?? 0) + 1;
        if (dry || !sql) return;
        try {
          await upsertEvent(sql, { sourceDomain: FCPL_SOURCE_DOMAIN, municipality, category }, event, stats);
        } catch {
          failed++;
        }
      }),
    );
  }

  // Geocode pass after ingest (skipped on dry run).
  let geocode = null;
  if (!dry && sql) {
    try {
      geocode = await geocodePending(sql, 800);
    } catch (err) {
      geocode = { error: err instanceof Error ? err.message : "geocode failed" };
    }
  }

  await finishIngestRun(runId, {
    // A budget stop is loud, not "ok": the admin ingest_runs board must show
    // that rows were left on the table (the silent version of this cost two
    // months of library coverage).
    status: budgetStopped > 0 ? "error" : "ok",
    error: budgetStopped > 0 ? `time budget: stopped with ${budgetStopped} of ${mapped.length} rows remaining` : undefined,
    records_in: mapped.length,
    records_upserted: stats.normUpserted,
    records_failed: failed,
  });

  // isr-1: real ingest wrote fresh rows — bust the event caches so /today,
  // /events, and /map pick up the new library programs immediately.
  if (!dry && sql) {
    revalidateTag("ingested-events", "max");
    revalidateTag("events", "max");
  }

  return Response.json({
    ok: true,
    dry,
    feed_records: feed.length,
    mapped: mapped.length,
    budget_stopped: budgetStopped,
    failed,
    perMunicipality,
    stats: dry ? undefined : stats,
    geocode,
    duration_ms: Date.now() - t0,
    finishedAt: new Date().toISOString(),
  });
}
