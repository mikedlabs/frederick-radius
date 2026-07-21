import "server-only";
import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_events } from "@/lib/db/schema";

/**
 * Prune first-party member events older than `days`. nfc_events is append-only
 * (every page view and named action writes a row), so without a retention floor
 * it grows without bound — and a leaked member cookie could flood it up to the
 * ingest rate limit. The data-health cron calls this on the same 90-day window
 * as push_log and feed_snapshots. Fail-soft: returns 0 on no-DB or error so the
 * cron stays green. The member rows themselves are kept (they are the roster);
 * only their behavioral trail ages out.
 */
export async function pruneNfcEvents(days: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  try {
    const deleted = await db
      .delete(nfc_events)
      .where(lt(nfc_events.created_at, cutoff))
      .returning({ id: nfc_events.id });
    return deleted.length;
  } catch (err) {
    console.error(
      "[nfc-retention] prune failed:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
