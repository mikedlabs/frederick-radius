/**
 * Incremental writer for Radius' private hybrid-search index.
 *
 * This module is shared by the one-off CLI builder and the bounded Vercel
 * cron. The writer is idempotent: content hashes skip unchanged places and
 * the database upsert makes duplicate cron delivery safe.
 */
import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { TransactionSql } from "postgres";
import { getSql } from "@/lib/db/client";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";

const DEFAULT_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH = 64;
const SEARCH_REFRESH_LOCK_ID = 28_417_391;
export const EMBEDDING_BATCH_TIMEOUT_MS = 15_000;

export const DEFAULT_RADIUS_SEARCH_CRON_BATCH = 256;
export const MAX_RADIUS_SEARCH_CRON_BATCH = 512;

type PublicPlace = ReturnType<typeof publicPlaces>[number];

export type RadiusSearchDocument = {
  id: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

export type RadiusSearchRefreshResult = {
  total: number;
  /** Full-text documents whose canonical content was out of date. */
  changed: number;
  /** Full-text documents persisted during this run. */
  processed: number;
  /** Full-text documents left for a later bounded run. */
  remaining: number;
  embedded: number;
  tokenUsage: number;
  embeddingEnabled: boolean;
  embeddingRemaining: number;
  embeddingCurrent: boolean;
  embeddingWarning?: {
    code:
      | "provider_unavailable"
      | "invalid_configuration"
      | "invalid_dimensions"
      | "embedding_write_failed";
    message: string;
  };
  cleanupWarning?: {
    code: "retired_documents_cleanup_failed";
    message: string;
  };
  /** Whether the required full-text index is current. */
  current: boolean;
};

export type RadiusSearchRefreshErrorCode =
  | "not_configured"
  | "catalog_empty"
  | "storage_unavailable"
  | "refresh_in_progress"
  | "embedding_failed"
  | "invalid_embedding"
  | "storage_write_failed";

export class RadiusSearchRefreshError extends Error {
  constructor(
    public readonly code: RadiusSearchRefreshErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RadiusSearchRefreshError";
  }
}

export function buildRadiusSearchDocument(
  raw: PublicPlace,
): RadiusSearchDocument {
  const place = decoratePlace(raw);
  const content = [
    place.name,
    `Category: ${place.category}`,
    `Town: ${place.city || place.municipality}`,
    place.short_blurb,
    place.description,
    place.primary_type,
    place.subcategories?.join(", "),
    place.tags?.join(", "),
    place.known_for?.join("; "),
    place.field_note_tip,
    // The lexical ranker scores these (search.ts aliasPhraseScore) but the
    // indexed document omitted them, so the two halves of search disagreed
    // about what a place is called. Only 7 places carry aliases today, but
    // they are exactly the hard ones: "WLR" and "Wash Lube Repair" are how a
    // person actually asks for Route 40 Lube Center.
    place.search_aliases?.join(", "),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8_000);

  return {
    id: place.slug,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    metadata: {
      name: place.name,
      category: place.category,
      municipality: place.municipality,
    },
  };
}

/**
 * Keep the hosted job cost- and duration-bounded even if an environment value
 * is accidentally set to the full catalog size.
 */
export function radiusSearchCronBatch(
  raw: string | number | undefined,
): number {
  const parsed =
    typeof raw === "number" ? raw : Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_SEARCH_CRON_BATCH;
  return Math.max(
    1,
    Math.min(MAX_RADIUS_SEARCH_CRON_BATCH, Math.floor(parsed)),
  );
}

function embeddingModelName(): string {
  const configured =
    process.env.RADIUS_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  // Keep deployments that still carry the old Gateway-style value working
  // after embeddings move to the direct OpenAI provider.
  return configured.replace(/^openai\//, "") || DEFAULT_MODEL;
}

type RootSql = NonNullable<ReturnType<typeof getSql>>;

/**
 * Keep cleanup diagnostics useful without logging query text, bound
 * parameters, place content, or connection details. Postgres.js attaches
 * these structural fields directly to database errors.
 */
function safeCleanupErrorMetadata(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") {
    return { errorType: typeof error };
  }
  const candidate = error as Record<string, unknown>;
  const metadata: Record<string, string> = {};
  const fields = [
    ["name", "name"],
    ["code", "code"],
    ["severity", "severity"],
    ["schema_name", "schema"],
    ["table_name", "table"],
    ["constraint_name", "constraint"],
    ["routine", "routine"],
  ] as const;
  for (const [source, target] of fields) {
    const value = candidate[source];
    if (typeof value === "string" && value.length > 0) {
      metadata[target] = value.slice(0, 120);
    }
  }
  return Object.keys(metadata).length > 0
    ? metadata
    : { errorType: error instanceof Error ? error.name : "unknown" };
}

/**
 * Retired rows are housekeeping, not a prerequisite for searchable text.
 * Run cleanup only after the required index transaction has committed, in a
 * second short transaction. A cleanup fault can then degrade the refresh
 * without rolling a successful initial fill back to zero.
 */
async function cleanupRetiredPlaceDocuments({
  rootSql,
  liveIds,
  refreshStartedAt,
}: {
  rootSql: RootSql;
  liveIds: string[];
  refreshStartedAt: string;
}): Promise<RadiusSearchRefreshResult["cleanupWarning"] | undefined> {
  // Bind the live catalog as JSON instead of handing a raw JavaScript array to
  // postgres.js. A raw array in a tagged-template parameter is not an encoded
  // Postgres array; depending on the connection's learned type map it can
  // reach the driver's Buffer writer as an object and throw
  // ERR_INVALID_ARG_TYPE before Postgres sees the DELETE. JSON is a bounded,
  // unambiguous text parameter, and jsonb_array_elements_text restores the
  // exact source ids inside the query.
  const liveIdsJson = JSON.stringify(liveIds);
  const removeRetired = async (sql: TransactionSql): Promise<void> => {
    await sql`
      delete from public.radius_search_documents
      where kind = 'place'
        and not exists (
          select 1
          from jsonb_array_elements_text(${liveIdsJson}::jsonb) as live(source_id)
          where live.source_id = radius_search_documents.source_id
        )
        and updated_at < ${refreshStartedAt}
    `;
  };

  try {
    if (typeof rootSql.begin === "function") {
      await rootSql.begin(async (sql) => {
        await sql`set local statement_timeout = '5s'`;
        await removeRetired(sql);
      });
    } else {
      // Lightweight test doubles may not expose transactions. Real
      // application connections always use the bounded transaction above.
      await removeRetired(rootSql as unknown as TransactionSql);
    }
    return undefined;
  } catch (error) {
    console.warn(
      "[radius-search] retired-document cleanup failed after the search baseline committed",
      safeCleanupErrorMetadata(error),
    );
    return {
      code: "retired_documents_cleanup_failed",
      message:
        "Full-text search was updated, but retired place documents could not be removed. Cleanup will retry on the next refresh.",
    };
  }
}

export async function refreshRadiusSearchIndex({
  maxDocuments = Number.MAX_SAFE_INTEGER,
}: {
  maxDocuments?: number;
} = {}): Promise<RadiusSearchRefreshResult> {
  const rootSql = getSql();
  if (!rootSql) {
    throw new RadiusSearchRefreshError(
      "not_configured",
      "DATABASE_URL is required for the Radius search index.",
    );
  }

  const documents = publicPlaces().map(buildRadiusSearchDocument);
  if (documents.length === 0) {
    throw new RadiusSearchRefreshError(
      "catalog_empty",
      "The public place catalog is empty; the existing Radius search index was left untouched.",
    );
  }
  // Supavisor runs postgres.js with prepared statements disabled. Bind the
  // cutoff as ISO text rather than a JavaScript Date so the pooled writer does
  // not receive an object it cannot serialize (ERR_INVALID_ARG_TYPE). Postgres
  // infers timestamptz from updated_at at the comparison boundary.
  const refreshStartedAt = new Date().toISOString();

  const run = async (
    sql: TransactionSql,
  ): Promise<RadiusSearchRefreshResult> => {
  let existing: Array<{
    source_id: string;
    content_hash: string;
    has_embedding: boolean;
  }>;
  try {
    existing = await sql<
      Array<{
        source_id: string;
        content_hash: string;
        has_embedding: boolean;
      }>
    >`
      select source_id, content_hash, (embedding is not null) as has_embedding
      from public.radius_search_documents
      where kind = 'place'
    `;
  } catch {
    // This query happens before the first embedding call, so an unapplied
    // migration or unusable write role cannot incur paid AI work.
    throw new RadiusSearchRefreshError(
      "storage_unavailable",
      "Radius search storage is unavailable. Apply drizzle/0025_radius_search_documents.sql and verify the database role.",
    );
  }

  const known = new Map(
    existing.map((row) => [
      row.source_id,
      {
        contentHash: row.content_hash,
        hasEmbedding: row.has_embedding,
      },
    ]),
  );
  const embeddingEnabled = Boolean(process.env.OPENAI_API_KEY);
  const requestedEmbeddingModel = embeddingModelName();
  const embeddingConfigurationWarning:
    | RadiusSearchRefreshResult["embeddingWarning"]
    | undefined =
    embeddingEnabled && requestedEmbeddingModel !== DEFAULT_MODEL
      ? {
          code: "invalid_configuration",
          message:
            `Optional semantic vectors were not requested because ${requestedEmbeddingModel} is not compatible with the existing ${DEFAULT_MODEL} index. Remove RADIUS_EMBEDDING_MODEL or rebuild with explicit model provenance.`,
        }
      : undefined;
  const changed = documents.filter(
    (document) =>
      known.get(document.id)?.contentHash !== document.contentHash,
  );
  const limit = Number.isFinite(maxDocuments)
    ? Math.max(1, Math.floor(maxDocuments))
    : documents.length;
  const selected = changed.slice(0, limit);
  let processed = 0;
  let embedded = 0;
  let tokenUsage = 0;

  // Finish the required full-text work before making any optional provider
  // call. A provider outage can therefore never strand the same first slice
  // of documents or leave an otherwise usable local index empty.
  for (let offset = 0; offset < selected.length; offset += EMBEDDING_BATCH) {
    const batch = selected.slice(offset, offset + EMBEDDING_BATCH);
    const ids = batch.map((document) => document.id);
    const hashes = batch.map((document) => document.contentHash);
    const contents = batch.map((document) => document.content);
    const metadata = batch.map((document) =>
      JSON.stringify(document.metadata),
    );

    // Write searchable text before doing any optional paid work. If content
    // changed, clear the now-stale vector; a later run with OPENAI_API_KEY can
    // backfill it even though the content hash will already match.
    try {
      await sql`
        insert into public.radius_search_documents
          (kind, source_id, content_hash, content, metadata, updated_at)
        select 'place', source_id, content_hash, content, metadata::jsonb, now()
        from unnest(
          ${ids}::text[],
          ${hashes}::text[],
          ${contents}::text[],
          ${metadata}::text[]
        ) as rows(source_id, content_hash, content, metadata)
        on conflict (kind, source_id) do update set
          content_hash = excluded.content_hash,
          content = excluded.content,
          metadata = excluded.metadata,
          embedding = case
            when radius_search_documents.content_hash = excluded.content_hash
              then radius_search_documents.embedding
            else null
          end,
          updated_at = excluded.updated_at
      `;
    } catch {
      throw new RadiusSearchRefreshError(
        "storage_write_failed",
        "The Radius search index could not persist a full-text batch.",
      );
    }
    processed += batch.length;
  }

  const selectedIds = new Set(selected.map((document) => document.id));
  const embeddingNeeded = embeddingEnabled
    ? documents.filter((document) => {
        const current = known.get(document.id);
        return (
          current?.contentHash !== document.contentHash ||
          !current?.hasEmbedding
        );
      })
    : [];
  // Newly written text is eligible immediately. Existing rows with current
  // text but no vector fill any room left in the same bounded budget.
  let embeddingWarning = embeddingConfigurationWarning;
  const embeddingCandidates = embeddingEnabled && !embeddingWarning
    ? [
        ...selected,
        ...documents.filter((document) => {
          if (selectedIds.has(document.id)) return false;
          const current = known.get(document.id);
          return (
            current?.contentHash === document.contentHash &&
            !current.hasEmbedding
          );
        }),
      ].slice(0, limit)
    : [];

  for (
    let offset = 0;
    offset < embeddingCandidates.length;
    offset += EMBEDDING_BATCH
  ) {
    const batch = embeddingCandidates.slice(
      offset,
      offset + EMBEDDING_BATCH,
    );
    const ids = batch.map((document) => document.id);
    const hashes = batch.map((document) => document.contentHash);
    let embeddings: number[][];
    let tokens = 0;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound each optional provider batch independently. The explicit race is
      // intentional: the cron still returns degraded if a provider client
      // ignores AbortSignal, while aborting stops compliant clients promptly.
      const deadline = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("embedding batch timed out"));
        }, EMBEDDING_BATCH_TIMEOUT_MS);
      });
      const result = await Promise.race([
        embedMany({
          model: openai.embedding(requestedEmbeddingModel),
          values: batch.map((document) => document.content),
          maxParallelCalls: 2,
          maxRetries: 2,
          abortSignal: controller.signal,
        }),
        deadline,
      ]);
      embeddings = result.embeddings;
      tokens = result.usage.tokens;
      tokenUsage += tokens;
    } catch {
      embeddingWarning = {
        code: "provider_unavailable",
        message:
          "Full-text search was updated. Optional semantic vectors will retry after the embedding provider recovers.",
      };
      break;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (
      embeddings.length !== batch.length ||
      embeddings.some(
        (embedding) => embedding.length !== EMBEDDING_DIMENSIONS,
      )
    ) {
      embeddingWarning = {
        code: "invalid_dimensions",
        message: `Full-text search was updated. Optional vectors were skipped because the embedding dimensions were not ${EMBEDDING_DIMENSIONS}.`,
      };
      break;
    }

    const vectors = embeddings.map(
      (embedding) => `[${embedding.join(",")}]`,
    );
    try {
      const updateResult = await sql`
        update public.radius_search_documents as document
        set embedding = rows.embedding::extensions.vector,
            updated_at = now()
        from unnest(
          ${ids}::text[],
          ${hashes}::text[],
          ${vectors}::text[]
        ) as rows(source_id, content_hash, embedding)
        where document.kind = 'place'
          and document.source_id = rows.source_id
          and document.content_hash = rows.content_hash
      `;
      if (
        typeof updateResult.count === "number" &&
        updateResult.count !== batch.length
      ) {
        embeddingWarning = {
          code: "embedding_write_failed",
          message:
            "Full-text search stayed current, but a document changed before its vector could be stored. The vector will be rebuilt from the newer text.",
        };
        break;
      }
    } catch {
      embeddingWarning = {
        code: "embedding_write_failed",
        message:
          "Full-text search was updated. Optional semantic vectors could not be stored and will retry on the next run.",
      };
      break;
    }
    embedded += batch.length;
  }

  const remaining = changed.length - processed;
  const embeddingRemaining = embeddingEnabled
    ? Math.max(0, embeddingNeeded.length - embedded)
    : 0;
  return {
    total: documents.length,
    changed: changed.length,
    processed,
    remaining,
    embedded,
    tokenUsage,
    embeddingEnabled,
    embeddingRemaining,
    embeddingCurrent:
      !embeddingEnabled || embeddingRemaining === 0,
    ...(embeddingWarning ? { embeddingWarning } : {}),
    current: remaining === 0,
  };
  };

  // Serialize refreshes in the database, not in one serverless process. This
  // prevents overlapping cron, CLI, or rolling-deployment runs from buying
  // duplicate vectors or attaching an older vector to newer text. The local
  // statement timeout also bounds the post-provider vector write.
  let result: RadiusSearchRefreshResult;
  if (typeof rootSql.begin === "function") {
    try {
      result = await rootSql.begin(async (sql) => {
        await sql`set local statement_timeout = '15s'`;
        const lock = await sql<Array<{ acquired: boolean }>>`
          select pg_try_advisory_xact_lock(${SEARCH_REFRESH_LOCK_ID}) as acquired
        `;
        if (!lock[0]?.acquired) {
          throw new RadiusSearchRefreshError(
            "refresh_in_progress",
            "Another Radius search refresh is already running.",
          );
        }
        return run(sql);
      });
    } catch (error) {
      if (error instanceof RadiusSearchRefreshError) throw error;
      throw new RadiusSearchRefreshError(
        "storage_unavailable",
        "Radius search storage could not start a protected refresh transaction.",
      );
    }
  } else {
    // Lightweight test doubles do not expose postgres-js transactions. Real
    // application connections always take the protected path above.
    result = await run(rootSql as unknown as TransactionSql);
  }

  const cleanupWarning = await cleanupRetiredPlaceDocuments({
    rootSql,
    liveIds: documents.map((document) => document.id),
    refreshStartedAt,
  });
  return cleanupWarning ? { ...result, cleanupWarning } : result;
}
