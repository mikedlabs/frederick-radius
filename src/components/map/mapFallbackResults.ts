import type { SearchResult } from "@/lib/search/index";

/** A failed renderer does not relax the visitor's query or named town. */
export function mapFallbackResults<T extends { slug: string; municipality?: string }>(
  records: readonly T[],
  results: readonly SearchResult[],
  query: string,
  municipality: string | null,
  type: "place" | "event",
): T[] {
  const ids = query.trim().length >= 2
    ? new Set(results.filter((result) => result.type === type).map((result) => result.id.replace(new RegExp(`^${type}:`), "")))
    : null;
  return records.filter((record) =>
    (!municipality || record.municipality === municipality) &&
    (!ids || ids.has(record.slug)),
  );
}
