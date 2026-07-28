/**
 * Inspect or compact the legacy feed_snapshots backlog.
 *
 * Dry-run is the default. Applying a batch requires both --apply and
 * CONFIRM_FEED_SNAPSHOT_COMPACTION=1. The database helper deletes only rows
 * that have a newer same-source, same-UTC-day replacement, so every source/day
 * keeps at least one historical snapshot.
 */
import {
  compactDuplicateSnapshots,
  getFeedSnapshotStorageTelemetry,
  SNAPSHOT_COMPACTION_BATCH_SIZE,
} from "@/lib/integrations/feed-snapshot";
import { closeDb } from "@/lib/db/client";

async function main(): Promise<void> {
  const telemetry = await getFeedSnapshotStorageTelemetry();
  if (!telemetry) {
    throw new Error(
      "Snapshot telemetry is unavailable. Check DATABASE_URL and database connectivity.",
    );
  }

  console.log(JSON.stringify({ before: telemetry }, null, 2));
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log(
      "Dry run only. Pass --apply with CONFIRM_FEED_SNAPSHOT_COMPACTION=1 to delete one bounded duplicate batch.",
    );
    return;
  }
  if (process.env.CONFIRM_FEED_SNAPSHOT_COMPACTION !== "1") {
    throw new Error(
      "Set CONFIRM_FEED_SNAPSHOT_COMPACTION=1 before applying compaction.",
    );
  }

  const deleted = await compactDuplicateSnapshots(
    SNAPSHOT_COMPACTION_BATCH_SIZE,
  );
  const after = await getFeedSnapshotStorageTelemetry();
  if (!after) {
    throw new Error(
      "Compaction completed, but follow-up telemetry is unavailable. Verify the database state before applying another batch.",
    );
  }
  console.log(JSON.stringify({ deleted, after }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => closeDb());
