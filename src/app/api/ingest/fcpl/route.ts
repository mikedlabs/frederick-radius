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
 *   GET /api/ingest/fcpl?dry=1     (fetch + parse + count only, no writes)
 *   GET /api/ingest/fcpl?only=brunswick
 */
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSql } from "@/lib/db/client";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import { geocodePending } from "@/lib/ingest/geocode";
import { fcplMapFeed, FCPL_SOURCE_DOMAIN } from "@/lib/ingest/fcpl";
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
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const only = req.nextUrl.searchParams.get("only");
  if (!dry) {
    const denied = verifyCronAuth(req);
    if (denied) return denied;
  }

  const sql = getSql();
  if (!sql && !dry) return Response.json({ error: "no database" }, { status: 503 });

  const t0 = Date.now();
  const feed = await fetchFeed();
  if (!feed) {
    return Response.json({ ok: false, error: "feed fetch failed", dry }, { status: 502 });
  }

  let mapped = fcplMapFeed(feed, new Date());
  if (only) mapped = mapped.filter((m) => m.municipality.toLowerCase() === only.toLowerCase());

  const stats: UpsertStats = emptyStats();
  const perMunicipality: Record<string, number> = {};
  let failed = 0;

  for (const { event, municipality, category } of mapped) {
    perMunicipality[municipality] = (perMunicipality[municipality] ?? 0) + 1;
    if (dry || !sql) continue;
    try {
      await upsertEvent(sql, { sourceDomain: FCPL_SOURCE_DOMAIN, municipality, category }, event, stats);
    } catch {
      failed++;
    }
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
    failed,
    perMunicipality,
    stats: dry ? undefined : stats,
    geocode,
    duration_ms: Date.now() - t0,
    finishedAt: new Date().toISOString(),
  });
}
