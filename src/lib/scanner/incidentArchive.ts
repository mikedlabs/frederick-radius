/**
 * Scanner archive writer — banks the ephemeral live feed into history.
 *
 * Reads the current public incidents (already allowlist-filtered + aged) and
 * appends any not yet stored, so the trend surfaces have a past to read. Only
 * the same de-identified public calls the map/feed show are ever written; the
 * unique dedupe_key stops the same call banking twice across cron cycles.
 * The reader surfaces fail soft, but this scheduled writer reports unavailable
 * storage as incomplete so deployment monitoring cannot mistake a no-op for a
 * healthy archive.
 */
import { getDb } from "@/lib/db/client";
import { scanner_incidents } from "@/lib/db/schema";
import { getScannerIncidentsResult } from "@/lib/integrations/scannerIncidents";
import { fetchPageRecordsResult } from "@/lib/scanner/scannerPatterns";

const ARCHIVE_BATCH_SIZE = 100;

type ScannerArchiveRow = {
  dedupe_key: string;
  kind: string;
  location: string;
  road_impact: boolean;
  occurred_at: Date;
};

export function dedupeArchiveRows<T extends { dedupe_key: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    if (!byKey.has(row.dedupe_key)) byKey.set(row.dedupe_key, row);
  }
  return [...byKey.values()];
}

export function chunkArchiveRows<T>(rows: T[], size = ARCHIVE_BATCH_SIZE): T[][] {
  const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : ARCHIVE_BATCH_SIZE;
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += safeSize) {
    chunks.push(rows.slice(index, index + safeSize));
  }
  return chunks;
}

export async function archiveScannerIncidents(): Promise<{
  seen: number;
  inserted: number;
  complete: boolean;
  reason?:
    | "database_unavailable"
    | "source_unavailable"
    | "storage_write_failed";
  sources?: { page: boolean; live: boolean };
}> {
  const db = getDb();
  if (!db) {
    return {
      seen: 0,
      inserted: 0,
      complete: false,
      reason: "database_unavailable",
    };
  }

  // Bank the FULL public-page window (~3 weeks), not just the last hour. Every
  // run re-reads the whole page; the unique dedupe_key drops everything already
  // stored, so only genuinely new posts insert — and as the page rolls forward,
  // we keep the older rows it has since dropped. That's how the archive grows
  // past the page's 3-week ceiling. Also fold in the live 1h feed so a call
  // that's on the wire but not yet on the static page still lands.
  const [pageResult, liveResult] = await Promise.all([
    fetchPageRecordsResult().catch(() => ({ data: [], available: false })),
    getScannerIncidentsResult().catch(() => ({
      data: [],
      available: false,
    })),
  ]);
  const sources = {
    page: pageResult.available,
    live: liveResult.available,
  };
  if (!sources.page && !sources.live) {
    // Append-only storage is deliberately untouched. Existing history remains
    // the last good archive, and monitoring sees an incomplete source read.
    return {
      seen: 0,
      inserted: 0,
      complete: false,
      reason: "source_unavailable",
      sources,
    };
  }
  const page = pageResult.data;
  const live = liveResult.data;

  const rows = dedupeArchiveRows<ScannerArchiveRow>([
    ...page
      .filter((r) => r.atMs !== null)
      .map((r) => ({
        dedupe_key: `${r.kind}|${r.location}|${new Date(r.atMs as number).toISOString()}`,
        kind: r.kind,
        location: r.location,
        road_impact: r.roadImpact,
        occurred_at: new Date(r.atMs as number),
      })),
    ...live.map((inc) => ({
      dedupe_key: `${inc.kind}|${inc.location}|${inc.at}`,
      kind: inc.kind,
      location: inc.location,
      road_impact: inc.roadImpact,
      occurred_at: new Date(inc.at),
    })),
  ]);
  if (rows.length === 0) {
    return { seen: 0, inserted: 0, complete: true, sources };
  }

  let insertedCount = 0;
  for (const batch of chunkArchiveRows(rows)) {
    try {
      const inserted = await db
        .insert(scanner_incidents)
        .values(batch)
        .onConflictDoNothing({ target: scanner_incidents.dedupe_key })
        .returning({ id: scanner_incidents.id });
      insertedCount += inserted.length;
    } catch {
      // Table not migrated yet / transient error. Stop after the first failed
      // batch so a degraded database cannot consume the whole cron window.
      return {
        seen: rows.length,
        inserted: insertedCount,
        complete: false,
        reason: "storage_write_failed",
        sources,
      };
    }
  }

  return {
    seen: rows.length,
    inserted: insertedCount,
    complete: true,
    sources,
  };
}
