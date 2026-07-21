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

export async function archiveScannerIncidents(): Promise<{
  seen: number;
  inserted: number;
}> {
  const db = getDb();
  if (!db) return { seen: 0, inserted: 0 };

  const incidents = await getScannerIncidents();
  if (incidents.length === 0) return { seen: 0, inserted: 0 };

  let inserted = 0;
  for (const inc of incidents) {
    try {
      const rows = await db
        .insert(scanner_incidents)
        .values({
          // The message timestamp makes this stable across cron cycles, so a
          // call still on the live wire an hour later banks exactly once.
          dedupe_key: `${inc.kind}|${inc.location}|${inc.at}`,
          kind: inc.kind,
          location: inc.location,
          road_impact: inc.roadImpact,
          occurred_at: new Date(inc.at),
        })
        .onConflictDoNothing({ target: scanner_incidents.dedupe_key })
        .returning({ id: scanner_incidents.id });
      if (rows.length) inserted++;
    } catch {
      // Table not migrated yet / transient error — skip this row, keep going.
    }
  }
  return { seen: incidents.length, inserted };
}
