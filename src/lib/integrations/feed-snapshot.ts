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

import { getDb } from "@/lib/db/client";
import { feed_snapshots } from "@/lib/db/schema";
import { desc, lt } from "drizzle-orm";

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
  // Persist asynchronously — the request path is sync. Errors are
  // intentionally swallowed so a transient DB blip doesn't bring
  // down the events page; the next fetch retries on its own.
  void persistSnapshot(source, snap);
}

async function persistSnapshot(source: string, snap: Snapshot): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(feed_snapshots).values({
      source,
      taken_at: new Date(snap.taken_at),
      count: snap.count,
      free_ratio: snap.free_ratio,
      empty_desc_ratio: snap.empty_desc_ratio,
      top_venue: snap.top_venue,
      top_category: snap.top_category,
      earliest: snap.earliest ? new Date(snap.earliest) : null,
      latest: snap.latest ? new Date(snap.latest) : null,
    });
  } catch (err) {

    console.error(`[feed-snapshot] persist failed (${source}):`, err instanceof Error ? err.message : err);
  }
}

/**
 * Loads the most recent N snapshots per source from the database into
 * the in-memory rolling buffer. Idempotent and safe to call multiple
 * times — repeats overwrite the buffer for each source with the latest
 * DB state, preserving the window ordering (oldest → newest).
 *
 * Called by `/admin/data-health` so the dashboard reflects history
 * across deploys / cold starts, not just fetches that happened in this
 * worker process. When the DB is unset (dev/local without DATABASE_URL),
 * this is a no-op and the in-memory buffer is the source of truth.
 *
 * If we already have an N-deep buffer for a source in this process,
 * we skip the load — the in-memory write path is more recent than any
 * read. This makes the call cheap on warm dashboards.
 */
let hydratedAt: number = 0;
const HYDRATE_TTL_MS = 60_000;

export async function hydrateSnapshots(): Promise<void> {
  const db = getDb();
  if (!db) return;
  // Throttle: at most once per minute per worker. The dashboard is
  // operator-facing, so a minute of staleness is fine and we avoid
  // hammering the DB on every render.
  if (Date.now() - hydratedAt < HYDRATE_TTL_MS) return;
  try {
    // Pull the most recent N snapshots across all sources in one query,
    // then partition client-side. Cheap because the index covers it
    // and N is small (WINDOW * sources ≈ 50 rows max).
    const rows = await db
      .select()
      .from(feed_snapshots)
      .orderBy(desc(feed_snapshots.taken_at))
      .limit(WINDOW * 20);
    const bySource = new Map<string, Snapshot[]>();
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
    // The query returned newest-first; reverse so the buffer is
    // oldest → newest, matching the in-memory append order.
    for (const [source, buf] of bySource) {
      buf.reverse();
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
  } catch (err) {

    console.error("[feed-snapshot] hydrate failed:", err instanceof Error ? err.message : err);
  }
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
export async function pruneOldSnapshots(days: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  try {
    const deleted = await db
      .delete(feed_snapshots)
      .where(lt(feed_snapshots.created_at, cutoff))
      .returning({ id: feed_snapshots.id });
    return deleted.length;
  } catch (err) {

    console.error("[feed-snapshot] prune failed:", err instanceof Error ? err.message : err);
    return 0;
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
    | "empty_batch";
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
