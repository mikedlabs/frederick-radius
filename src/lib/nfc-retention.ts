import "server-only";
import { asc, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_events } from "@/lib/db/schema";
import { withStatementTimeout } from "@/lib/db/statement-timeout";

/**
 * Prune first-party member events older than `days`. nfc_events is append-only
 * (every page view and named action writes a row), so without a retention floor
 * it grows without bound — and a leaked member cookie could flood it up to the
 * ingest rate limit. The data-health cron calls this on the same 90-day window
 * as push_log and feed_snapshots. It no-ops without a DB, but propagates query
 * failures so the independently scheduled retention phase cannot turn a failed
 * delete into a green zero-row result. The member rows themselves are kept
 * (they are the roster); only their behavioral trail ages out.
 */
export const NFC_EVENT_PRUNE_BATCH_SIZE = 5_000;

export async function pruneNfcEvents(
  days: number,
  batchSize = NFC_EVENT_PRUNE_BATCH_SIZE,
  statementTimeoutMs?: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const limit = Math.max(1, Math.min(Math.floor(batchSize), NFC_EVENT_PRUNE_BATCH_SIZE));
  try {
    return await withStatementTimeout(db, statementTimeoutMs, async (executor) => {
      const doomed = executor
        .select({ id: nfc_events.id })
        .from(nfc_events)
        .where(lt(nfc_events.created_at, cutoff))
        .orderBy(asc(nfc_events.created_at))
        .limit(limit);
      const deleted = await executor
        .delete(nfc_events)
        .where(inArray(nfc_events.id, doomed))
        .returning({ id: nfc_events.id });
      return deleted.length;
    });
  } catch (err) {
    console.error(
      "[nfc-retention] prune failed:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}
