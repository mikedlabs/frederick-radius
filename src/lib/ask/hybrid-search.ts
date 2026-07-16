import "server-only";
import { embed } from "ai";
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

const EMBEDDING_MODEL = process.env.RADIUS_EMBEDDING_MODEL || "openai/text-embedding-3-small";

export function hybridSearchConfigured(): boolean {
  return Boolean(
    process.env.RADIUS_HYBRID_SEARCH !== "0" &&
      (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) &&
      getSql(),
  );
}

/** Server-only RRF over Postgres FTS + pgvector. Every failure returns [] so a
 * missing migration, cold database, or Gateway outage leaves lexical Radius
 * search fully intact. */
export async function hybridPlaceSearch(query: string, limit = 12): Promise<HybridSearchRow[]> {
  const clean = query.trim().slice(0, 300);
  const sql = getSql();
  if (!clean || !sql || !hybridSearchConfigured()) return [];

  try {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL,
      value: clean,
      abortSignal: AbortSignal.timeout(2_500),
      maxRetries: 1,
    });
    if (embedding.length !== 1536) return [];
    const vector = `[${embedding.join(",")}]`;
    const bounded = Math.max(1, Math.min(30, Math.floor(limit)));
    const rows = await sql<DbRow[]>`
      with full_text as (
        select source_id,
          row_number() over (
            order by ts_rank_cd(fts, websearch_to_tsquery('english', ${clean})) desc
          ) as rank_ix
        from public.radius_search_documents
        where kind = 'place'
          and fts @@ websearch_to_tsquery('english', ${clean})
        order by rank_ix
        limit ${bounded * 2}
      ),
      semantic as (
        select source_id,
          row_number() over (order by embedding <=> ${vector}::extensions.vector) as rank_ix
        from public.radius_search_documents
        where kind = 'place'
        order by rank_ix
        limit ${bounded * 2}
      )
      select d.source_id, d.content, d.metadata,
        (
          coalesce(1.0 / (50 + full_text.rank_ix), 0.0) * 1.25 +
          coalesce(1.0 / (50 + semantic.rank_ix), 0.0)
        ) as score
      from full_text
      full outer join semantic on full_text.source_id = semantic.source_id
      join public.radius_search_documents d
        on d.kind = 'place'
       and d.source_id = coalesce(full_text.source_id, semantic.source_id)
      order by score desc
      limit ${bounded}
    `;
    return rows.map((row) => ({
      sourceId: row.source_id,
      content: row.content,
      metadata: row.metadata ?? {},
      score: Number(row.score) || 0,
    }));
  } catch {
    return [];
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
