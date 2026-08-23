/**
 * Data-gaps reader — the read side of the flywheel, behind /admin/data-gaps.
 *
 * Groups the banked misses by their normalized key, then cautiously rechecks
 * search misses against the current answer stack. A historical miss remains
 * evidence of demand; it is not presented as a claim that today's build still
 * fails. Fail-soft: no DB (dormant / not migrated) → an empty board, never an
 * error.
 */
import { sql, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { search_misses } from "@/lib/db/schema";
import { loadEventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import {
  recheckHistoricalSearchMiss,
  type SearchGapRecheck,
} from "@/lib/telemetry/searchGapRecheck";

export type SearchGap = SearchGapRecheck & {
  /** A readable sample of the query that missed when it was logged. */
  query: string;
  kind: string;
  /** Times this intent was asked in the window. */
  count: number;
  /** Human "how long ago" it was last asked (formatted in the loader). */
  lastLabel: string;
};

/** Compact "how long ago" for a timestamp, relative to a fixed now. */
function ago(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export type DataGaps = {
  gaps: SearchGap[];
  /** Total misses in the window (every row, not just the top group). */
  total: number;
  /** Distinct intents that produced a miss in the window. */
  distinct: number;
  days: number;
};

const EMPTY: DataGaps = { gaps: [], total: 0, distinct: 0, days: 0 };

export async function getDataGaps(
  { days = 30, limit = 40 }: { days?: number; limit?: number } = {},
): Promise<DataGaps> {
  const db = getDb();
  if (!db) return EMPTY;
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        query: sql<string>`min(${search_misses.query})`,
        kind: search_misses.kind,
        count: sql<number>`count(*)::int`,
        lastAt: sql<string | Date>`max(${search_misses.occurred_at})`,
        // Window totals are calculated before the result limit. The old code
        // summed only the visible top groups while labelling that number as
        // every miss in the window.
        windowTotal: sql<number>`sum(count(*)) over ()::int`,
        windowDistinct: sql<number>`count(*) over ()::int`,
      })
      .from(search_misses)
      .where(gte(search_misses.occurred_at, since))
      .groupBy(search_misses.query_key, search_misses.kind)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // Use the same durable event archive that public search reads. Failure is
    // harmless: the loader supplies curated fallback rows and the statuses are
    // review hints, never automatic resolutions.
    const hasSearchRows = rows.some((row) => row.kind === "search");
    const eventSnapshot = hasSearchRows
      ? await loadEventArchiveSnapshot(new Date(), {
          timeoutMs: 1_000,
        }).catch(() => null)
      : null;
    const eventPool = eventSnapshot?.publicEvents;
    const eventArchiveDegraded = hasSearchRows &&
      (eventSnapshot === null || eventSnapshot.sourceHealth?.degraded === true);

    const now = Date.now();
    const gaps: SearchGap[] = rows.map((r) => {
      const ms = r.lastAt instanceof Date ? r.lastAt.getTime() : Date.parse(String(r.lastAt));
      // Unknown legacy values must not be declared fixed by the lighter search
      // recheck. Only the documented `search` kind is eligible for it.
      const kind = r.kind === "search" ? "search" : "ask";
      return {
        query: r.query,
        kind: r.kind,
        count: Number(r.count),
        lastLabel: Number.isFinite(ms) ? ago(ms, now) : "",
        ...recheckHistoricalSearchMiss(r.query, kind, eventPool, {
          eventArchiveDegraded,
        }),
      };
    });
    const total = Number(rows[0]?.windowTotal ?? 0);
    const distinct = Number(rows[0]?.windowDistinct ?? 0);
    return { gaps, total, distinct, days };
  } catch {
    return EMPTY; // table missing / transient
  }
}
