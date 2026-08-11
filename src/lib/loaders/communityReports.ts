/**
 * Community reports loader — the read side of the community layer.
 *
 * Returns APPROVED, not-yet-expired reports for the map + Ask Radius. Fail-soft
 * by construction: no DB configured, the table not migrated yet, or any query
 * error all return [] — so this can be wired into the map safely before the
 * `community_reports` table exists on prod.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";
import { deleteCommunityReportPhoto } from "@/lib/community-report-photo";
import { withStatementTimeout } from "@/lib/db/statement-timeout";

export type CommunityReport = {
  id: string;
  category: string;
  subtype?: string;
  title?: string;
  note?: string;
  photo?: string;
  municipality?: string;
  lng: number;
  lat: number;
  createdAt?: string;
};

export async function getCommunityReports(
  now: Date = new Date(),
  statementTimeoutMs?: number,
): Promise<CommunityReport[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await withStatementTimeout(
      db,
      statementTimeoutMs,
      (executor) =>
        executor
          .select({
            id: community_reports.id,
            category: community_reports.category,
            subtype: community_reports.subtype,
            title: community_reports.title,
            note: community_reports.note,
            photo_url: community_reports.photo_url,
            municipality: community_reports.municipality,
            lng: community_reports.lng,
            lat: community_reports.lat,
            created_at: community_reports.created_at,
          })
          .from(community_reports)
          .where(
            and(
              eq(community_reports.status, "approved"),
              // live = no expiry, or expiry still in the future
              or(
                isNull(community_reports.expires_at),
                gt(community_reports.expires_at, now),
              ),
            ),
          )
          .orderBy(desc(community_reports.created_at))
          .limit(500),
    );

    const out: CommunityReport[] = [];
    for (const r of rows) {
      if (!Number.isFinite(r.lng) || !Number.isFinite(r.lat)) continue;
      out.push({
        id: `report:${r.id}`,
        category: r.category,
        subtype: r.subtype ?? undefined,
        title: r.title ?? undefined,
        note: r.note ?? undefined,
        photo: r.photo_url ?? undefined,
        municipality: r.municipality ?? undefined,
        lng: r.lng,
        lat: r.lat,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * integrity-01 — prune dead community reports. The `expires_at` index exists
 * (drizzle community-reports migration) but nothing ever deletes, so expired
 * and rejected rows accumulate forever. Deletes only:
 *   - APPROVED reports whose expiry has passed (already invisible to the map), and
 *   - REJECTED reports older than the grace window.
 * It NEVER touches `pending` rows (the live admin queue) or live/permanent
 * approved rows (expires_at NULL is preserved — a NULL never satisfies `<`).
 * Mirrors prunePushLog / pruneOldSnapshots: returns the count deleted and
 * no-ops without a DB. Query failures propagate so the retention worker cannot
 * report a failed delete as a successful zero-row batch.
 */
export const COMMUNITY_REPORT_PRUNE_BATCH_SIZE = 100;

export async function pruneExpiredReports(
  graceDays = 1,
  batchSize = COMMUNITY_REPORT_PRUNE_BATCH_SIZE,
  statementTimeoutMs?: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const now = new Date();
  const cutoff = new Date(Date.now() - graceDays * 86_400_000);
  const limit = Math.max(
    1,
    Math.min(Math.floor(batchSize), COMMUNITY_REPORT_PRUNE_BATCH_SIZE),
  );
  const expired = or(
    and(
      eq(community_reports.status, "approved"),
      lt(community_reports.expires_at, now),
    ),
    and(
      eq(community_reports.status, "rejected"),
      lt(community_reports.reviewed_at, cutoff),
    ),
  );
  try {
    const deleted = await withStatementTimeout(
      db,
      statementTimeoutMs,
      async (executor) => {
        const rows = await executor
          .select({
            id: community_reports.id,
            photo_url: community_reports.photo_url,
          })
          .from(community_reports)
          .where(expired)
          .orderBy(asc(community_reports.created_at))
          .limit(limit);

        if (rows.length === 0) return [];

        // Reapply the eligibility predicate at the destructive boundary. An
        // admin may restore a report while cleanup is running; deleting by the
        // stale ID list alone could otherwise remove a newly live report.
        return executor
          .delete(community_reports)
          .where(
            and(
              inArray(
                community_reports.id,
                rows.map((row) => row.id),
              ),
              expired,
            ),
          )
          .returning({
            id: community_reports.id,
            photo_url: community_reports.photo_url,
          });
      },
    );

    // Clean up Blob URLs only after the database transaction has committed.
    // A rare Blob failure leaves an orphaned file, which is safer than leaving
    // a visible report whose image was removed during an admin race.
    const cleanup = await Promise.all(
      deleted.map((row) => deleteCommunityReportPhoto(row.photo_url)),
    );
    if (cleanup.some((ok) => !ok)) {
      console.warn(
        "[community-reports] one or more deleted reports left a Blob for later cleanup",
      );
    }
    return deleted.length;
  } catch (err) {
    console.warn(
      "[community-reports] prune failed:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}
