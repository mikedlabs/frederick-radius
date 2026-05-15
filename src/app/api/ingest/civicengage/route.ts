/**
 * CivicEngage iCal ingester. Runs as a Vercel cron (daily 4am ET) — a
 * separate execution context from the user-facing app, which only ever
 * reads `ingested_events`. Per-source failure isolation: one bad feed
 * never blocks the others.
 *
 *   GET /api/ingest/civicengage           (cron, needs CRON_SECRET)
 *   GET /api/ingest/civicengage?dry=1     (parse+count only, no writes)
 *   GET /api/ingest/civicengage?only=Thurmont
 */
import { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { parseICal } from "@/lib/ingest/parser";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import { geocodePending } from "@/lib/ingest/geocode";
import { verifyCronAuth } from "../_auth";
import sources from "@/../config/civicengage_sources.json" with { type: "json" };

export const runtime = "nodejs";
export const maxDuration = 300; // ingest can take a few minutes
export const dynamic = "force-dynamic";

type Source = {
  municipality: string;
  domain: string;
  enabled: boolean;
  catids: number[];
  category_map: Record<string, string>;
  note?: string;
};

const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic event index)";

function feedUrl(domain: string, catID: number): string {
  return `https://${domain}/Common/Modules/iCalendar/iCalendar.aspx?catID=${catID}&feed=calendar`;
}

async function fetchFeed(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  // Auth: shared cron-secret helper (skip for ?dry=1 local checks)
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const only = req.nextUrl.searchParams.get("only");
  if (!dry) {
    const denied = verifyCronAuth(req);
    if (denied) return denied;
  }

  const sql = getSql();
  if (!sql && !dry) return Response.json({ error: "no database" }, { status: 503 });

  const list = (sources as unknown as Source[]).filter(
    (s) => s.enabled && (!only || s.municipality.toLowerCase() === only.toLowerCase())
  );

  const perSource: Record<string, { ok: boolean; events: number; stats?: UpsertStats; error?: string }> = {};
  let totalParsed = 0;

  for (const src of list) {
    try {
      const stats = emptyStats();
      let parsed = 0;
      for (const catID of src.catids) {
        const ics = await fetchFeed(feedUrl(src.domain, catID));
        if (!ics) continue; // one dead catID doesn't kill the source
        const events = parseICal(ics);
        parsed += events.length;
        if (!dry && sql) {
          for (const e of events) {
            await upsertEvent(
              sql,
              { sourceDomain: src.domain, municipality: src.municipality, category: src.category_map[String(catID)] ?? null },
              e,
              stats
            );
          }
        }
      }
      totalParsed += parsed;
      perSource[src.municipality] = { ok: true, events: parsed, stats: dry ? undefined : stats };
    } catch (err) {
      // Failure isolation — record and continue with the next source.
      perSource[src.municipality] = { ok: false, events: 0, error: err instanceof Error ? err.message : "unknown" };
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

  return Response.json({
    dry,
    sources: list.length,
    totalParsed,
    perSource,
    geocode,
    finishedAt: new Date().toISOString(),
  });
}
