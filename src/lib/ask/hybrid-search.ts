import "server-only";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { getSql } from "@/lib/db/client";

export type HybridSearchRow = {
  sourceId: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

type DbRow = {
  source_id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number | string;
};

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function hybridSearchConfigured(): boolean {
  // The database-backed FTS path needs no AI credentials. OPENAI_API_KEY adds
  // semantic recall, but its absence must never disable exact local retrieval.
  return Boolean(process.env.RADIUS_HYBRID_SEARCH !== "0" && getSql());
}

function embeddingModelName(): string {
  const configured =
    process.env.RADIUS_EMBEDDING_MODEL?.trim() ||
    DEFAULT_EMBEDDING_MODEL;
  return configured.replace(/^openai\//, "") || DEFAULT_EMBEDDING_MODEL;
}

function mapRows(rows: DbRow[]): HybridSearchRow[] {
  return rows.map((row) => ({
    sourceId: row.source_id,
    content: row.content,
    metadata: row.metadata ?? {},
    score: Number(row.score) || 0,
  }));
}

function fuseRows(
  keywordRows: HybridSearchRow[],
  semanticRows: HybridSearchRow[],
  limit: number,
): HybridSearchRow[] {
  const byId = new Map<string, HybridSearchRow>();
  for (const row of [...semanticRows, ...keywordRows]) {
    byId.set(row.sourceId, row);
  }
  const keywordRank = new Map(
    keywordRows.map((row, index) => [row.sourceId, index]),
  );
  const semanticRank = new Map(
    semanticRows.map((row, index) => [row.sourceId, index]),
  );
  return fuseRankedIds(
    keywordRows.map((row) => row.sourceId),
    semanticRows.map((row) => row.sourceId),
    limit,
  ).map((sourceId) => {
    const row = byId.get(sourceId)!;
    const exact = keywordRank.get(sourceId);
    const semantic = semanticRank.get(sourceId);
    return {
      ...row,
      score:
        (exact === undefined ? 0 : 1.25 / (60 + exact + 1)) +
        (semantic === undefined ? 0 : 1 / (60 + semantic + 1)),
    };
  });
}

/** Server-only Postgres FTS with optional pgvector recall. Full-text search is
 * always attempted first; missing credentials or an embedding outage returns
 * those exact local matches instead of erasing the entire retrieval result. */
export async function hybridPlaceSearch(query: string, limit = 12): Promise<HybridSearchRow[]> {
  const clean = query.trim().slice(0, 300);
  const sql = getSql();
  if (!clean || !sql || !hybridSearchConfigured()) return [];

  const bounded = Math.max(1, Math.min(30, Math.floor(limit)));
  let keywordRows: HybridSearchRow[];
  try {
    const rows = await sql<DbRow[]>`
      select source_id, content, metadata,
        ts_rank_cd(fts, websearch_to_tsquery('english', ${clean})) as score
      from public.radius_search_documents
      where kind = 'place'
        and fts @@ websearch_to_tsquery('english', ${clean})
      order by score desc, source_id
      limit ${bounded * 2}
    `;
    keywordRows = mapRows(rows);
  } catch {
    return [];
  }

  if (!process.env.OPENAI_API_KEY) {
    return keywordRows.slice(0, bounded);
  }

  try {
    const { embedding } = await embed({
      model: openai.embedding(embeddingModelName()),
      value: clean,
      abortSignal: AbortSignal.timeout(2_500),
      maxRetries: 1,
    });
    if (embedding.length !== 1536) return keywordRows.slice(0, bounded);
    const vector = `[${embedding.join(",")}]`;
    const rows = await sql<DbRow[]>`
      select source_id, content, metadata,
        1 - (embedding <=> ${vector}::extensions.vector) as score
      from public.radius_search_documents
      where kind = 'place'
        and embedding is not null
      order by embedding <=> ${vector}::extensions.vector, source_id
      limit ${bounded}
    `;
    return fuseRows(keywordRows, mapRows(rows), bounded);
  } catch {
    return keywordRows.slice(0, bounded);
  }
}

/** Pure two-list RRF, exported so the ordering contract is unit-testable even
 * when a local database or embedding key is unavailable. */
export function fuseRankedIds(keywordIds: string[], semanticIds: string[], limit = 12): string[] {
  const scores = new Map<string, number>();
  const add = (ids: string[], weight: number) => {
    ids.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + weight / (60 + index + 1)));
  };
  add(keywordIds, 1.25);
  add(semanticIds, 1);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}
