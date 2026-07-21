/**
 * Search & Ask miss logging — the write side of the data-gaps flywheel.
 *
 * Called when a search returns nothing, or an Ask answer lands with no real
 * place to point at. Banks the query so /admin/data-gaps can rank what the app
 * keeps being asked for and can't answer. Fail-soft in every direction: no DB
 * (dev / not migrated) is a clean no-op, and it never throws into the request
 * path. Stores only the query text, its kind, and the time — no identifier.
 */
import { getDb } from "@/lib/db/client";
import { search_misses } from "@/lib/db/schema";

export type MissKind = "search" | "ask";

/**
 * Normalize a query to a grouping key: lowercase, strip punctuation, collapse
 * whitespace, drop a leading article. "Dog-friendly patios!" and "dog friendly
 * patio" fold together so the board counts intent, not spelling.
 */
export function normalizeQueryKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Queries worth banking: real words, not a stray keystroke or a paste-bomb. */
function worthLogging(q: string): boolean {
  return q.length >= 2 && q.length <= 80;
}

export async function recordSearchMiss(query: string, kind: MissKind): Promise<void> {
  const q = query.trim();
  if (!worthLogging(q)) return;
  const key = normalizeQueryKey(q);
  if (!key) return;

  const db = getDb();
  if (!db) return;
  try {
    await db.insert(search_misses).values({ query: q.slice(0, 80), query_key: key, kind });
  } catch {
    // Table not migrated yet / transient — never surface into the request.
  }
}
