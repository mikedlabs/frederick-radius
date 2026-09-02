import "server-only";

import { getSql } from "@/lib/db/client";
import { radiusSearchDocuments } from "@/lib/ask/search-index-document";

export type RadiusSearchIndexHealthStatus =
  | "current"
  | "degraded"
  | "empty"
  | "unknown";

export type RadiusSearchIndexHealth = {
  status: RadiusSearchIndexHealthStatus;
  expected: number | null;
  indexed: number | null;
  current: number | null;
  missing: number | null;
  stale: number | null;
  retired: number | null;
  embedded: number | null;
  /** Informational only. Content freshness is established by the hash match. */
  lastDocumentChangeAt: string | null;
  freshnessBasis: "catalog_content_hash";
};

export const UNKNOWN_RADIUS_SEARCH_INDEX_HEALTH: RadiusSearchIndexHealth = {
  status: "unknown",
  expected: null,
  indexed: null,
  current: null,
  missing: null,
  stale: null,
  retired: null,
  embedded: null,
  lastDocumentChangeAt: null,
  freshnessBasis: "catalog_content_hash",
};

export type RadiusSearchIndexAggregateRow = {
  expected?: number | string | null;
  indexed?: number | string | null;
  current?: number | string | null;
  missing?: number | string | null;
  stale?: number | string | null;
  retired?: number | string | null;
  embedded?: number | string | null;
  last_document_change_at?: string | Date | null;
};

function count(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

/** Reduce one fixed-size aggregate row to a public, privacy-safe status. */
export function classifyRadiusSearchIndexHealth(
  row: RadiusSearchIndexAggregateRow,
): RadiusSearchIndexHealth {
  const expected = count(row.expected);
  const indexed = count(row.indexed);
  const current = count(row.current);
  const missing = count(row.missing);
  const stale = count(row.stale);
  const retired = count(row.retired);
  const embedded = count(row.embedded);
  const changedAt = row.last_document_change_at
    ? new Date(row.last_document_change_at)
    : null;
  const lastDocumentChangeAt =
    changedAt && Number.isFinite(changedAt.getTime())
      ? changedAt.toISOString()
      : null;

  return {
    status:
      expected === 0
        ? "unknown"
        : indexed === 0
          ? "empty"
          : missing === 0 && stale === 0 && retired === 0 && current === expected
            ? "current"
            : "degraded",
    expected,
    indexed,
    current,
    missing,
    stale,
    retired,
    embedded,
    lastDocumentChangeAt,
    freshnessBasis: "catalog_content_hash",
  };
}

/**
 * Compare the live local-search rows with the exact public catalog identity.
 *
 * `updated_at` is not a freshness gate: unchanged documents correctly keep an
 * old write timestamp. A row is current only when its canonical content hash
 * matches today's promoted catalog. The query returns aggregate counts only;
 * no place names, slugs, content, or database errors reach public health.
 */
export async function getRadiusSearchIndexHealth(): Promise<RadiusSearchIndexHealth> {
  const sql = getSql();
  if (!sql) return UNKNOWN_RADIUS_SEARCH_INDEX_HEALTH;

  const expectedDocuments = radiusSearchDocuments().map((document) => ({
    source_id: document.id,
    content_hash: document.contentHash,
  }));
  if (expectedDocuments.length === 0) {
    return UNKNOWN_RADIUS_SEARCH_INDEX_HEALTH;
  }

  const expectedJson = JSON.stringify(expectedDocuments);
  try {
    const rows = (await sql`
      WITH expected AS (
        SELECT row->>'source_id' AS source_id,
               row->>'content_hash' AS content_hash
        FROM jsonb_array_elements(${expectedJson}::jsonb) AS row
      ),
      actual AS (
        SELECT source_id, content_hash, embedding, updated_at
        FROM public.radius_search_documents
        WHERE kind = 'place'
      ),
      expected_coverage AS (
        SELECT count(*)::integer AS expected,
               count(actual.source_id)::integer AS indexed,
               count(*) FILTER (
                 WHERE actual.source_id IS NOT NULL
                   AND actual.content_hash = expected.content_hash
               )::integer AS current,
               count(*) FILTER (
                 WHERE actual.source_id IS NULL
               )::integer AS missing,
               count(*) FILTER (
                 WHERE actual.source_id IS NOT NULL
                   AND actual.content_hash <> expected.content_hash
               )::integer AS stale,
               count(actual.embedding)::integer AS embedded,
               max(actual.updated_at) AS last_document_change_at
        FROM expected
        LEFT JOIN actual USING (source_id)
      ),
      retired AS (
        SELECT count(*)::integer AS retired
        FROM actual
        WHERE NOT EXISTS (
          SELECT 1
          FROM expected
          WHERE expected.source_id = actual.source_id
        )
      )
      SELECT expected_coverage.*, retired.retired
      FROM expected_coverage
      CROSS JOIN retired
    `) as unknown as RadiusSearchIndexAggregateRow[];
    return rows[0]
      ? classifyRadiusSearchIndexHealth(rows[0])
      : UNKNOWN_RADIUS_SEARCH_INDEX_HEALTH;
  } catch {
    return UNKNOWN_RADIUS_SEARCH_INDEX_HEALTH;
  }
}
