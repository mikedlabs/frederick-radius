/**
 * Per-feed rolling snapshots + anomaly detection.
 *
 * Companion to the schema validator (`event-schema.ts`). Where Zod
 * catches *malformed* rows, this catches *suspicious distributions*
 * across the whole batch — the bug class where every row is valid
 * but the upstream feed has quietly regressed (e.g. every event
 * suddenly tagged Free, every row anchored to the same default
 * venue, the row count drops to a tenth overnight).
 *
 * Snapshots live in-memory only. Persisting them belongs on a cron
 * path with a real datastore; on the request path we keep a small
 * rolling window per source and compare current to immediate prior.
 *
 * What gets recorded per fetch (per source):
 *   - taken_at         the ISO time of the fetch
 *   - count            total rows produced
 *   - free_ratio       share of rows tagged is_free=true
 *   - empty_desc_ratio share of rows whose description is empty
 *   - top_venue        most common venue + share
 *   - top_category     most common category + share
 *   - earliest / latest  date range of starts_at
 *
 * What flags as an anomaly (current vs prior):
 *   - count_drop      count fell by ≥40%
 *   - count_spike     count rose by ≥3x
 *   - free_swing      free_ratio shifted by ≥30 percentage points
 *   - venue_concentrated  top_venue now ≥60% of rows (was <40%)
 *   - category_concentrated  top_category ≥85% (was <70%)
 *   - empty_desc_spike  empty_desc_ratio rose by ≥30 pp
 *   - empty_batch     count is zero AND prior was non-zero
 *
 * The thresholds are intentionally generous; better to miss a soft
 * drift than to wake someone for normal weekly variation. Anomalies
 * surface on `/admin/data-health` for human eyes, not paging.
 */

import { getDb, getSql } from "@/lib/db/client";
import { feed_snapshots, feed_source_health } from "@/lib/db/schema";
import { asc, desc, inArray, lt, sql as drizzleSql } from "drizzle-orm";
import { withStatementTimeout } from "@/lib/db/statement-timeout";

type Snapshot = {
  taken_at: string;
  count: number;
  free_ratio: number;
  empty_desc_ratio: number;
  top_venue: { name: string; share: number } | null;
  top_category: { name: string; share: number } | null;
  earliest: string | null;
  latest: string | null;
};

type SnapshotRow = Pick<
  import("./ical-live").LiveEvent,
  | "venue_name"
  | "category"
  | "is_free"
  | "description"
  | "starts_at"
>;

const WINDOW = 5;
const SNAPSHOTS = new Map<string, Snapshot[]>();

function isUndefinedTableError(error: unknown): boolean {
  let candidate: unknown = error;
  const seen = new Set<unknown>();

  while (
    candidate !== null
    && typeof candidate === "object"
    && !seen.has(candidate)
  ) {
    seen.add(candidate);
    if (
      "code" in candidate
      && (candidate as { code?: unknown }).code === "42P01"
    ) {
      return true;
    }
    candidate =
      "cause" in candidate
        ? (candidate as { cause?: unknown }).cause
        : null;
  }

  return false;
}

function topByShare(values: string[]): { name: string; share: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = (v || "").trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const entry of counts.entries()) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  if (!best) return null;
  return { name: best[0], share: best[1] / values.length };
}

function compute(rows: SnapshotRow[]): Snapshot {
  if (rows.length === 0) {
    return {
      taken_at: new Date().toISOString(),
      count: 0,
      free_ratio: 0,
      empty_desc_ratio: 0,
      top_venue: null,
      top_category: null,
      earliest: null,
      latest: null,
    };
  }
  const free = rows.filter((r) => r.is_free).length;
  const empty = rows.filter((r) => !r.description || r.description.trim().length === 0).length;
  const venues = rows.map((r) => r.venue_name);
  const cats = rows.map((r) => r.category);
  const starts = rows.map((r) => Date.parse(r.starts_at)).filter((n) => !Number.isNaN(n));
  return {
    taken_at: new Date().toISOString(),
    count: rows.length,
    free_ratio: free / rows.length,
    empty_desc_ratio: empty / rows.length,
    top_venue: topByShare(venues),
    top_category: topByShare(cats),
    earliest: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    latest: starts.length ? new Date(Math.max(...starts)).toISOString() : null,
  };
}

export function recordSnapshot(source: string, rows: SnapshotRow[]): void {
  const snap = compute(rows);
  const buf = SNAPSHOTS.get(source) ?? [];
  buf.push(snap);
  while (buf.length > WINDOW) buf.shift();
  SNAPSHOTS.set(source, buf);
}

/**
 * Persist one current snapshot per successful source.
 *
 * This is deliberately separate from `recordSnapshot()`: request-path feed
 * assembly can run on many cold workers and must never write telemetry on an
 * ordinary page view. The bounded data-health feed worker calls this every two
 * hours after a fresh pull. That cadence stays inside the ledger's three-hour
 * freshness window for hourly sources while capping growth to twelve rows per
 * source per day and preserving cross-deploy anomaly history.
 */
async function persistCurrentSnapshotRows(
  sources?: readonly string[],
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const allowed = sources ? new Set(sources) : null;
  const values = [...SNAPSHOTS.entries()]
    .filter(([source]) => !allowed || allowed.has(source))
    .map(([source, buf]) => {
      const snap = buf[buf.length - 1];
      if (!snap) return null;
      return {
        source,
        taken_at: new Date(snap.taken_at),
        count: snap.count,
        free_ratio: snap.free_ratio,
        empty_desc_ratio: snap.empty_desc_ratio,
        top_venue: snap.top_venue,
        top_category: snap.top_category,
        earliest: snap.earliest ? new Date(snap.earliest) : null,
        latest: snap.latest ? new Date(snap.latest) : null,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
  if (values.length === 0) return 0;

  const observedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(feed_snapshots).values(values);
      await tx
        .insert(feed_source_health)
        .values(
          values.map((value) => ({
            ...value,
            prior_snapshot: null,
            recent_mean_count: value.count,
            recent_observations: 1,
            updated_at: observedAt,
          })),
        )
        .onConflictDoUpdate({
          target: feed_source_health.source,
          // Two cron invocations can overlap during a redeploy. Never allow the
          // slower, older observation to roll the current projection backward.
          setWhere: drizzleSql`
            excluded.taken_at > ${feed_source_health.taken_at}
          `,
          set: {
            // Preserve the prior complete observation before replacing the
            // current row. Two observations are sufficient for the anomaly
            // comparisons; the historical table remains available for audits.
            prior_snapshot: drizzleSql`jsonb_build_object(
              'taken_at', ${feed_source_health.taken_at},
              'count', ${feed_source_health.count},
              'free_ratio', ${feed_source_health.free_ratio},
              'empty_desc_ratio', ${feed_source_health.empty_desc_ratio},
              'top_venue', ${feed_source_health.top_venue},
              'top_category', ${feed_source_health.top_category},
              'earliest', ${feed_source_health.earliest},
              'latest', ${feed_source_health.latest}
            )`,
            taken_at: drizzleSql`excluded.taken_at`,
            count: drizzleSql`excluded.count`,
            free_ratio: drizzleSql`excluded.free_ratio`,
            empty_desc_ratio: drizzleSql`excluded.empty_desc_ratio`,
            top_venue: drizzleSql`excluded.top_venue`,
            top_category: drizzleSql`excluded.top_category`,
            earliest: drizzleSql`excluded.earliest`,
            latest: drizzleSql`excluded.latest`,
            // Keep a bounded 84-observation mean (roughly seven days at the
            // intended two-hour cadence) without querying historical rows.
            recent_mean_count: drizzleSql`
              (
                ${feed_source_health.recent_mean_count}
                * least(${feed_source_health.recent_observations}, 83)
                + excluded.count
              )
              / least(${feed_source_health.recent_observations} + 1, 84)
            `,
            recent_observations: drizzleSql`
              least(${feed_source_health.recent_observations} + 1, 84)
            `,
            updated_at: observedAt,
          },
        });
    });
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;

    // The transaction above rolls its historical insert back when the
    // projection relation is absent. Preserve the pre-0039 worker contract by
    // writing the same bounded observation to feed_snapshots only.
    await db.insert(feed_snapshots).values(values);
  }
  return values.length;
}

let warnedPersistFailure = false;
export async function persistCurrentSnapshots(sources?: readonly string[]): Promise<number> {
  try {
    return await persistCurrentSnapshotRows(sources);
  } catch (err) {
    // Telemetry-only write. A failure must not break the rest of the health
    // report, and one warning per worker is enough to make it observable.
    if (!warnedPersistFailure) {
      warnedPersistFailure = true;
      console.warn(
        "[feed-snapshot] cron persist failed — telemetry only; further failures in this worker suppressed:",
        err instanceof Error ? err.message : err,
      );
    }
    return 0;
  }
}

/**
 * Cron worker variant: a failed telemetry write is phase-significant and must
 * reject so the independently scheduled feed phase records a red heartbeat.
 */
export function persistCurrentSnapshotsStrict(
  sources?: readonly string[],
): Promise<number> {
  return persistCurrentSnapshotRows(sources);
}

/**
 * Loads the current and immediately prior snapshot per source from the compact
 * database projection into the in-memory rolling buffer. Idempotent and safe
 * to call multiple times.
 *
 * Called by `/admin/data-health` so the dashboard reflects history
 * across deploys / cold starts, not just fetches that happened in this
 * worker process. When the DB is unset (dev/local without DATABASE_URL),
 * this is a no-op and the in-memory buffer is the source of truth.
 *
 * If this process already holds a more recent observation, the database load
 * does not replace it. This makes the call cheap and safe on warm dashboards.
 */
let hydratedAt: number = 0;
const HYDRATE_TTL_MS = 60_000;

async function hydrateSnapshotRows(): Promise<void> {
  const db = getDb();
  if (!db) return;
  // Throttle: at most once per minute per worker. The dashboard is
  // operator-facing, so a minute of staleness is fine and we avoid
  // hammering the DB on every render.
  if (Date.now() - hydratedAt < HYDRATE_TTL_MS) return;
  const bySource = new Map<string, Snapshot[]>();

  try {
    // Read the one-row-per-source projection. This path stays constant-size
    // even when the historical audit table contains hundreds of thousands of
    // rows.
    const rows = await db
      .select()
      .from(feed_source_health)
      .orderBy(desc(feed_source_health.taken_at));
    for (const r of rows) {
      const current: Snapshot = {
        taken_at: r.taken_at.toISOString(),
        count: r.count,
        free_ratio: r.free_ratio,
        empty_desc_ratio: r.empty_desc_ratio,
        top_venue: r.top_venue ?? null,
        top_category: r.top_category ?? null,
        earliest: r.earliest ? r.earliest.toISOString() : null,
        latest: r.latest ? r.latest.toISOString() : null,
      };
      const prior = r.prior_snapshot;
      const buf: Snapshot[] = [];
      if (
        prior
        && typeof prior.taken_at === "string"
        && Number.isFinite(Date.parse(prior.taken_at))
        && Number.isFinite(prior.count)
        && Number.isFinite(prior.free_ratio)
        && Number.isFinite(prior.empty_desc_ratio)
      ) {
        buf.push(prior);
      }
      buf.push(current);
      bySource.set(r.source, buf);
    }
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;

    // Migration 0039 is manual. Until it is installed, restore the bounded
    // newest-first legacy hydrate instead of converting unrelated failures
    // into an apparently healthy in-memory result.
    const rows = await db
      .select()
      .from(feed_snapshots)
      .orderBy(desc(feed_snapshots.taken_at))
      .limit(WINDOW * 20);
    for (const r of rows) {
      const buf = bySource.get(r.source) ?? [];
      if (buf.length >= WINDOW) continue;
      buf.push({
        taken_at: r.taken_at.toISOString(),
        count: r.count,
        free_ratio: r.free_ratio,
        empty_desc_ratio: r.empty_desc_ratio,
        top_venue: r.top_venue ?? null,
        top_category: r.top_category ?? null,
        earliest: r.earliest ? r.earliest.toISOString() : null,
        latest: r.latest ? r.latest.toISOString() : null,
      });
      bySource.set(r.source, buf);
    }
    for (const buf of bySource.values()) {
      buf.reverse();
    }
  }

  for (const [source, buf] of bySource) {
    // Only seed the in-memory buffer if the current process hasn't
    // already written a more-recent snapshot. Compare by timestamp:
    // if our newest in-memory entry is at least as fresh as the DB
    // tail, keep what we have.
    const existing = SNAPSHOTS.get(source);
    const existingNewest = existing?.[existing.length - 1]?.taken_at;
    const dbNewest = buf[buf.length - 1]?.taken_at;
    if (!existingNewest || (dbNewest && dbNewest > existingNewest)) {
      SNAPSHOTS.set(source, buf);
    }
  }
  hydratedAt = Date.now();
}

export async function hydrateSnapshots(): Promise<void> {
  try {
    await hydrateSnapshotRows();
  } catch (err) {
    // Telemetry-only read. Hydration failure means the dashboard
    // shows in-memory window only — non-fatal. Warn (not error) so
    // dev console stays clean.
    console.warn("[feed-snapshot] hydrate failed (telemetry only):", err instanceof Error ? err.message : err);
  }
}

/**
 * Cron-worker variant: query failures reject so a bounded phase cannot report
 * a green heartbeat after silently falling back to process-local history.
 */
export function hydrateSnapshotsStrict(): Promise<void> {
  return hydrateSnapshotRows();
}

/** Test-only: clear the throttle so a fresh hydrate fires next call. */
export function _resetHydrateThrottle(): void {
  hydratedAt = 0;
}

/**
 * Delete snapshots older than `days` days. Called by the cron path so
 * the table never grows unbounded — the dashboard only ever reads the
 * last few rows per source, so older history is dead weight.
 *
 * No-op when DB unavailable. Returns the row count deleted (0 when
 * DB unset) so the cron can report it.
 */
export const SNAPSHOT_PRUNE_BATCH_SIZE = 5_000;
export const SNAPSHOT_COMPACTION_BATCH_SIZE = 2_000;
export const SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT = 5_001;

export type FeedSnapshotStorageTelemetry = {
  approximateRows: number;
  totalBytes: number;
  oldestAt: string | null;
  newestAt: string | null;
  rowsLast24Hours: number;
  duplicateCandidates: number;
  duplicateCountCapped: boolean;
};

/**
 * Read storage pressure without an exact whole-table count.
 *
 * `feed_snapshots` once received request-path writes and grew beyond 700k
 * rows. pg_stat_user_tables gives a cheap approximate total, while the
 * duplicate probe stops after a small cap. This keeps the health board useful
 * without turning telemetry itself into another slow query.
 */
export async function getFeedSnapshotStorageTelemetry(): Promise<FeedSnapshotStorageTelemetry | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const [summary, duplicateRows] = await Promise.all([
      sql`
        SELECT coalesce(stats.n_live_tup, 0)::bigint AS approximate_rows,
               pg_total_relation_size('feed_snapshots'::regclass)::bigint AS total_bytes,
               (SELECT min(taken_at) FROM feed_snapshots) AS oldest_at,
               (SELECT max(taken_at) FROM feed_snapshots) AS newest_at,
               (
                 SELECT count(*)::bigint
                 FROM feed_snapshots
                 WHERE taken_at >= now() - interval '24 hours'
               ) AS rows_last_24_hours
        FROM pg_stat_user_tables stats
        WHERE stats.schemaname = 'public'
          AND stats.relname = 'feed_snapshots'
      `,
      sql`
        WITH candidates AS (
          SELECT candidate.id
          FROM feed_snapshots candidate
          WHERE candidate.taken_at <
                (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
            AND EXISTS (
              SELECT 1
              FROM feed_snapshots keeper
              WHERE keeper.source = candidate.source
                AND keeper.taken_at >=
                    (date_trunc('day', candidate.taken_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
                AND keeper.taken_at <
                    ((date_trunc('day', candidate.taken_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC')
                AND (
                  keeper.taken_at > candidate.taken_at
                  OR (
                    keeper.taken_at = candidate.taken_at
                    AND keeper.id > candidate.id
                  )
                )
              LIMIT 1
            )
          ORDER BY candidate.taken_at ASC, candidate.id ASC
          LIMIT ${SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT}
        )
        SELECT count(*)::bigint AS duplicate_candidates
        FROM candidates
      `,
    ]) as unknown as [
      Array<{
        approximate_rows: string | number;
        total_bytes: string | number;
        oldest_at: string | Date | null;
        newest_at: string | Date | null;
        rows_last_24_hours: string | number;
      }>,
      Array<{ duplicate_candidates: string | number }>,
    ];
    const row = summary[0];
    if (!row) return null;
    const approximateRows = Number(row.approximate_rows);
    const totalBytes = Number(row.total_bytes);
    const rowsLast24Hours = Number(row.rows_last_24_hours);
    const duplicateCandidates = Number(
      duplicateRows[0]?.duplicate_candidates ?? 0,
    );
    if (
      ![approximateRows, totalBytes, rowsLast24Hours, duplicateCandidates]
        .every((value) => Number.isFinite(value) && value >= 0)
    ) {
      throw new Error("Snapshot telemetry returned an invalid numeric value.");
    }
    return {
      approximateRows,
      totalBytes,
      oldestAt: row.oldest_at ? new Date(row.oldest_at).toISOString() : null,
      newestAt: row.newest_at ? new Date(row.newest_at).toISOString() : null,
      rowsLast24Hours,
      duplicateCandidates: Math.min(
        duplicateCandidates,
        SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT - 1,
      ),
      duplicateCountCapped:
        duplicateCandidates >= SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT,
    };
  } catch (err) {
    console.warn(
      "[feed-snapshot] storage telemetry failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Delete only redundant snapshots from completed UTC days.
 *
 * A row is eligible only when a newer row exists for the same source and UTC
 * day. That invariant preserves at least one snapshot per source per day even
 * when a batch is interrupted or two workers overlap. Unlike age-based
 * retention, duplicate compaction does not require a backup assumption
 * because it never removes the day's sole historical observation.
 *
 * This helper is not called automatically. The operator can inspect telemetry
 * first, then run bounded batches through the explicit maintenance script.
 */
export async function compactDuplicateSnapshots(
  batchSize = SNAPSHOT_COMPACTION_BATCH_SIZE,
): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const limit = Math.max(
    1,
    Math.min(
      Math.floor(batchSize),
      SNAPSHOT_COMPACTION_BATCH_SIZE,
    ),
  );
  try {
    const deleted = (await sql`
      WITH doomed AS MATERIALIZED (
        SELECT candidate.id
        FROM feed_snapshots candidate
        WHERE candidate.taken_at <
              (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
          AND EXISTS (
            SELECT 1
            FROM feed_snapshots keeper
            WHERE keeper.source = candidate.source
              AND keeper.taken_at >=
                  (date_trunc('day', candidate.taken_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
              AND keeper.taken_at <
                  ((date_trunc('day', candidate.taken_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC')
              AND (
                keeper.taken_at > candidate.taken_at
                OR (
                  keeper.taken_at = candidate.taken_at
                  AND keeper.id > candidate.id
                )
              )
            LIMIT 1
          )
        ORDER BY candidate.taken_at ASC, candidate.id ASC
        LIMIT ${limit}
      )
      DELETE FROM feed_snapshots target
      USING doomed
      WHERE target.id = doomed.id
      RETURNING target.id
    `) as unknown as Array<{ id: string }>;
    return deleted.length;
  } catch (err) {
    console.warn(
      "[feed-snapshot] duplicate compaction failed:",
      err instanceof Error ? err.message : err,
    );
    // This helper is used only by the explicit operator maintenance command.
    // Returning zero would make a failed DELETE indistinguishable from a
    // successful no-op and let the command exit green after doing nothing.
    throw err;
  }
}

export async function pruneOldSnapshots(
  days: number,
  batchSize = SNAPSHOT_PRUNE_BATCH_SIZE,
  statementTimeoutMs?: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const limit = Math.max(1, Math.min(Math.floor(batchSize), SNAPSHOT_PRUNE_BATCH_SIZE));
  try {
    // Never issue an unbounded DELETE ... RETURNING against this telemetry
    // table. A request-path write regression grew it past 700k rows and the
    // old cleanup tried to delete and return every expired UUID in one
    // statement, repeatedly hitting Supabase's statement timeout. `taken_at`
    // is the retention clock and has the operational index added in migration
    // 0031. Oldest-first batching makes every run useful without a long lock.
    return await withStatementTimeout(db, statementTimeoutMs, async (executor) => {
      const doomed = executor
        .select({ id: feed_snapshots.id })
        .from(feed_snapshots)
        .where(lt(feed_snapshots.taken_at, cutoff))
        .orderBy(asc(feed_snapshots.taken_at))
        .limit(limit);
      const deleted = await executor
        .delete(feed_snapshots)
        .where(inArray(feed_snapshots.id, doomed))
        .returning({ id: feed_snapshots.id });
      return deleted.length;
    });
  } catch (err) {
    console.warn(
      "[feed-snapshot] retention prune failed:",
      err instanceof Error ? err.message : err,
    );
    // The cron decides whether a retention failure is release-significant.
    // Propagate it so the health gate cannot report a successful no-op.
    throw err;
  }
}

export function getSnapshots(): Array<{ source: string; current: Snapshot; prior: Snapshot | null }> {
  return [...SNAPSHOTS.entries()]
    .map(([source, buf]) => ({
      source,
      current: buf[buf.length - 1],
      prior: buf.length > 1 ? buf[buf.length - 2] : null,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

export type Anomaly = {
  source: string;
  kind:
    | "count_drop"
    | "count_spike"
    | "free_swing"
    | "venue_concentrated"
    | "category_concentrated"
    | "empty_desc_spike"
    | "empty_batch"
    // DB-health kinds (src/lib/quality/db-health.ts): an RLS-disabled public
    // table, an ingest source that has gone stale, or health infrastructure
    // that was unavailable. They share this shape so they ride the existing
    // sendAnomalyAlert / dashboard rendering.
    | "rls_unprotected"
    | "schema_missing"
    | "ingest_stale"
    | "infrastructure_unavailable"
    // Curated-freshness kinds (src/lib/quality/curated-freshness.ts): the
    // data audit's core lesson was that committed snapshots and hand
    // verifications rot SILENTLY — venue-events expired 25/25 with no signal.
    // These make rot a red line on the same alert channel.
    | "snapshot_expired"
    | "verification_stale"
    | "live_source_failed"
    // End-to-end tripwires (src/lib/quality/tripwires.ts): the July 2026
    // failure classes that degraded POLITELY and stayed invisible — every
    // thumbnail app-wide fell back to the initials tile (rotated Google
    // photo names), /transit rendered zero routes (upstream schema change),
    // and the FCPL ingest died mid-run for two months. Each becomes a
    // sampled daily check on the same alert channel.
    | "photo_rot"
    | "transit_empty"
    | "events_empty"
    | "events_sources_degraded"
    | "tripwire_failed"
    | "ask_degraded"
    // Ask's private Postgres search index. Full-text coverage is required;
    // optional direct-OpenAI vectors are monitored only when configured.
    | "index_empty"
    | "index_stale"
    | "embedding_stale";
  detail: string;
};

export function getAnomalies(): Anomaly[] {
  const out: Anomaly[] = [];
  for (const { source, current, prior } of getSnapshots()) {
    if (!current) continue;
    // First snapshot has nothing to compare to. We still emit the
    // edge-case "empty_batch" so a freshly retired feed surfaces.
    if (!prior) {
      if (current.count === 0) {
        out.push({
          source,
          kind: "empty_batch",
          detail: "Feed returned 0 rows on first fetch this process.",
        });
      }
      continue;
    }

    if (prior.count > 0 && current.count === 0) {
      out.push({
        source,
        kind: "empty_batch",
        detail: `Returned 0 rows; prior fetch had ${prior.count}.`,
      });
    } else {
      if (prior.count >= 5 && current.count <= prior.count * 0.6) {
        out.push({
          source,
          kind: "count_drop",
          detail: `Row count fell ${prior.count} → ${current.count} (≥40% drop).`,
        });
      }
      if (prior.count >= 5 && current.count >= prior.count * 3) {
        out.push({
          source,
          kind: "count_spike",
          detail: `Row count rose ${prior.count} → ${current.count} (≥3×).`,
        });
      }
    }

    if (Math.abs(current.free_ratio - prior.free_ratio) >= 0.3) {
      out.push({
        source,
        kind: "free_swing",
        detail: `is_free share shifted ${(prior.free_ratio * 100).toFixed(0)}% → ${(current.free_ratio * 100).toFixed(0)}%.`,
      });
    }

    if (
      current.top_venue &&
      current.top_venue.share >= 0.6 &&
      (!prior.top_venue || prior.top_venue.share < 0.4)
    ) {
      out.push({
        source,
        kind: "venue_concentrated",
        detail: `"${current.top_venue.name}" is now ${(current.top_venue.share * 100).toFixed(0)}% of rows.`,
      });
    }

    if (
      current.top_category &&
      current.top_category.share >= 0.85 &&
      (!prior.top_category || prior.top_category.share < 0.7)
    ) {
      out.push({
        source,
        kind: "category_concentrated",
        detail: `Category "${current.top_category.name}" is now ${(current.top_category.share * 100).toFixed(0)}% of rows.`,
      });
    }

    if (current.empty_desc_ratio - prior.empty_desc_ratio >= 0.3) {
      out.push({
        source,
        kind: "empty_desc_spike",
        detail: `Empty descriptions ${(prior.empty_desc_ratio * 100).toFixed(0)}% → ${(current.empty_desc_ratio * 100).toFixed(0)}%.`,
      });
    }
  }
  return out;
}
