/**
 * Data-gaps reader — the read side of the flywheel, behind /admin/data-gaps.
 *
 * Groups the banked misses by their normalized key so the owner sees WHAT the
 * app keeps being asked for and can't answer, ranked by how often. Fail-soft:
 * no DB (dormant / not migrated) → an empty board, never an error.
 */
import { sql, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { search_misses } from "@/lib/db/schema";

export type SearchGap = {
  /** A readable sample of the unmet query. */
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
  /** Distinct unmet intents in the window. */
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
      })
      .from(search_misses)
      .where(gte(search_misses.occurred_at, since))
      .groupBy(search_misses.query_key, search_misses.kind)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    const now = Date.now();
    const gaps: SearchGap[] = rows.map((r) => {
      const ms = r.lastAt instanceof Date ? r.lastAt.getTime() : Date.parse(String(r.lastAt));
      return {
        query: r.query,
        kind: r.kind,
        count: Number(r.count),
        lastLabel: Number.isFinite(ms) ? ago(ms, now) : "",
      };
    });
    const total = gaps.reduce((n, g) => n + g.count, 0);
    return { gaps, total, distinct: gaps.length, days };
  } catch {
    return EMPTY; // table missing / transient
  }
}
