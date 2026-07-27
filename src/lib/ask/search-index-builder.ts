/**
 * Incremental writer for Radius' private hybrid-search index.
 *
 * This module is shared by the one-off CLI builder and the bounded Vercel
 * cron. The writer is idempotent: content hashes skip unchanged places and
 * the database upsert makes duplicate cron delivery safe.
 */
import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { getSql } from "@/lib/db/client";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";

const DEFAULT_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH = 64;

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
  changed: number;
  processed: number;
  remaining: number;
  tokenUsage: number;
  current: boolean;
};

export type RadiusSearchRefreshErrorCode =
  | "not_configured"
  | "catalog_empty"
  | "storage_unavailable"
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

export async function refreshRadiusSearchIndex({
  maxDocuments = Number.MAX_SAFE_INTEGER,
}: {
  maxDocuments?: number;
} = {}): Promise<RadiusSearchRefreshResult> {
  const sql = getSql();
  if (!sql) {
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
  let existing: Array<{ source_id: string; content_hash: string }>;
  try {
    existing = await sql<
      Array<{ source_id: string; content_hash: string }>
    >`
      select source_id, content_hash
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
    existing.map((row) => [row.source_id, row.content_hash]),
  );
  const changed = documents.filter(
    (document) => known.get(document.id) !== document.contentHash,
  );
  const limit = Number.isFinite(maxDocuments)
    ? Math.max(1, Math.floor(maxDocuments))
    : documents.length;
  const selected = changed.slice(0, limit);
  const model =
    process.env.RADIUS_EMBEDDING_MODEL || DEFAULT_MODEL;
  let processed = 0;
  let tokenUsage = 0;

  for (let offset = 0; offset < selected.length; offset += EMBEDDING_BATCH) {
    const batch = selected.slice(offset, offset + EMBEDDING_BATCH);
    let embeddings: number[][];
    let tokens = 0;
    try {
      const result = await embedMany({
        model,
        values: batch.map((document) => document.content),
        maxParallelCalls: 2,
        maxRetries: 2,
      });
      embeddings = result.embeddings;
      tokens = result.usage.tokens;
    } catch {
      throw new RadiusSearchRefreshError(
        "embedding_failed",
        "The embedding provider failed while refreshing the Radius search index.",
      );
    }

    if (
      embeddings.length !== batch.length ||
      embeddings.some(
        (embedding) => embedding.length !== EMBEDDING_DIMENSIONS,
      )
    ) {
      throw new RadiusSearchRefreshError(
        "invalid_embedding",
        `Embedding dimensions must be ${EMBEDDING_DIMENSIONS}; check RADIUS_EMBEDDING_MODEL.`,
      );
    }

    const ids = batch.map((document) => document.id);
    const hashes = batch.map((document) => document.contentHash);
    const contents = batch.map((document) => document.content);
    const metadata = batch.map((document) =>
      JSON.stringify(document.metadata),
    );
    const vectors = embeddings.map(
      (embedding) => `[${embedding.join(",")}]`,
    );
    try {
      await sql`
        insert into public.radius_search_documents
          (kind, source_id, content_hash, content, metadata, embedding, updated_at)
        select 'place', source_id, content_hash, content, metadata::jsonb,
          embedding::extensions.vector, now()
        from unnest(
          ${ids}::text[],
          ${hashes}::text[],
          ${contents}::text[],
          ${metadata}::text[],
          ${vectors}::text[]
        ) as rows(source_id, content_hash, content, metadata, embedding)
        on conflict (kind, source_id) do update set
          content_hash = excluded.content_hash,
          content = excluded.content,
          metadata = excluded.metadata,
          embedding = excluded.embedding,
          updated_at = excluded.updated_at
      `;
    } catch {
      throw new RadiusSearchRefreshError(
        "storage_write_failed",
        "The Radius search index could not persist an embedding batch.",
      );
    }
    processed += batch.length;
    tokenUsage += tokens;
  }

  // Catalog removals are safe to apply even during a bounded initial fill:
  // this only removes IDs that no longer exist in the canonical public set.
  const liveIds = documents.map((document) => document.id);
  try {
    await sql`
      delete from public.radius_search_documents
      where kind = 'place' and not (source_id = any(${liveIds}::text[]))
    `;
  } catch {
    throw new RadiusSearchRefreshError(
      "storage_write_failed",
      "The Radius search index could not remove retired place documents.",
    );
  }

  const remaining = changed.length - processed;
  return {
    total: documents.length,
    changed: changed.length,
    processed,
    remaining,
    tokenUsage,
    current: remaining === 0,
  };
}
