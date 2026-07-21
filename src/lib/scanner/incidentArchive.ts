/**
 * Scanner archive writer — banks the ephemeral live feed into history.
 *
 * Reads the current public incidents (already allowlist-filtered + aged) and
 * appends any not yet stored, so the trend surfaces have a past to read. Only
 * the same de-identified public calls the map/feed show are ever written; the
 * unique dedupe_key stops the same call banking twice across cron cycles.
 * Fail-soft: no DB (dormant / not migrated) → a clean no-op, exactly like the
 * rest of the DB-backed features.
 */
import { getDb } from "@/lib/db/client";
import { scanner_incidents } from "@/lib/db/schema";
import { getScannerIncidents } from "@/lib/integrations/scannerIncidents";
import { fetchPageRecords } from "@/lib/scanner/scannerPatterns";

export async function archiveScannerIncidents(): Promise<{
  seen: number;
  inserted: number;
}> {
  const db = getDb();
  if (!db) return { seen: 0, inserted: 0 };

  // Bank the FULL public-page window (~3 weeks), not just the last hour. Every
  // run re-reads the whole page; the unique dedupe_key drops everything already
  // stored, so only genuinely new posts insert — and as the page rolls forward,
  // we keep the older rows it has since dropped. That's how the archive grows
  // past the page's 3-week ceiling. Also fold in the live 1h feed so a call
  // that's on the wire but not yet on the static page still lands.
  const [page, live] = await Promise.all([
    fetchPageRecords().catch(() => []),
    getScannerIncidents().catch(() => []),
  ]);

  const rows = [
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
  ];
  if (rows.length === 0) return { seen: 0, inserted: 0 };

  try {
    const inserted = await db
      .insert(scanner_incidents)
      .values(rows)
      .onConflictDoNothing({ target: scanner_incidents.dedupe_key })
      .returning({ id: scanner_incidents.id });
    return { seen: rows.length, inserted: inserted.length };
  } catch {
    // Table not migrated yet / transient error — clean no-op.
    return { seen: rows.length, inserted: 0 };
  }
}
