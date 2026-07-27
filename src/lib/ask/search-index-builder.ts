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
import { getSql } from "@/lib/db/client";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";

const DEFAULT_MODEL = "text-embedding-3-small";
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
  embedded: number;
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

function embeddingModelName(): string {
  const configured =
    process.env.RADIUS_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  // Keep deployments that still carry the old Gateway-style value working
  // after embeddings move to the direct OpenAI provider.
  return configured.replace(/^openai\//, "") || DEFAULT_MODEL;
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
  const changed = documents.filter(
    (document) => {
      const current = known.get(document.id);
      return (
        current?.contentHash !== document.contentHash ||
        (embeddingEnabled && !current?.hasEmbedding)
      );
    },
  );
  const limit = Number.isFinite(maxDocuments)
    ? Math.max(1, Math.floor(maxDocuments))
    : documents.length;
  const selected = changed.slice(0, limit);
  let processed = 0;
  let embedded = 0;
  let tokenUsage = 0;

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

    if (embeddingEnabled) {
      let embeddings: number[][];
      let tokens = 0;
      try {
        const result = await embedMany({
          model: openai.embedding(embeddingModelName()),
          values: batch.map((document) => document.content),
          maxParallelCalls: 2,
          maxRetries: 2,
        });
        embeddings = result.embeddings;
        tokens = result.usage.tokens;
      } catch {
        throw new RadiusSearchRefreshError(
          "embedding_failed",
          "Full-text search was updated, but the OpenAI embedding request failed.",
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
          `Full-text search was updated, but embedding dimensions were not ${EMBEDDING_DIMENSIONS}; check RADIUS_EMBEDDING_MODEL.`,
        );
      }

      const vectors = embeddings.map(
        (embedding) => `[${embedding.join(",")}]`,
      );
      try {
        await sql`
          update public.radius_search_documents as document
          set embedding = rows.embedding::extensions.vector,
              updated_at = now()
          from unnest(
            ${ids}::text[],
            ${vectors}::text[]
          ) as rows(source_id, embedding)
          where document.kind = 'place'
            and document.source_id = rows.source_id
        `;
      } catch {
        throw new RadiusSearchRefreshError(
          "storage_write_failed",
          "Full-text search was updated, but the Radius search index could not persist its embedding batch.",
        );
      }
      embedded += batch.length;
      tokenUsage += tokens;
    }

    processed += batch.length;
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
    embedded,
    tokenUsage,
    current: remaining === 0,
  };
}
