/**
 * Incrementally embed Radius place documents for hybrid search.
 *
 * Prerequisites:
 *   1. Apply drizzle/0025_radius_search_documents.sql by hand in Supabase.
 *   2. Configure DATABASE_URL and AI Gateway auth.
 *   3. Run: npm run build:radius-search
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { getSql, closeDb } from "@/lib/db/client";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";

const MODEL = process.env.RADIUS_EMBEDDING_MODEL || "openai/text-embedding-3-small";
const BATCH = 64;

type Document = {
  id: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

type PublicPlace = ReturnType<typeof publicPlaces>[number];

function contentFor(raw: PublicPlace): Document {
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
  ].filter(Boolean).join("\n").slice(0, 8_000);
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

async function main() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required");
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("AI Gateway auth is required");
  }

  const docs = publicPlaces().map(contentFor);
  const existing = await sql<Array<{ source_id: string; content_hash: string }>>`
    select source_id, content_hash
    from public.radius_search_documents
    where kind = 'place'
  `;
  const known = new Map(existing.map((row) => [row.source_id, row.content_hash]));
  const changed = docs.filter((doc) => known.get(doc.id) !== doc.contentHash);

  console.log(`Radius search: ${docs.length} places, ${changed.length} changed`);
  for (let offset = 0; offset < changed.length; offset += BATCH) {
    const batch = changed.slice(offset, offset + BATCH);
    const { embeddings, usage } = await embedMany({
      model: MODEL,
      values: batch.map((doc) => doc.content),
      maxParallelCalls: 2,
      maxRetries: 2,
    });
    if (embeddings.some((embedding) => embedding.length !== 1536)) {
      throw new Error("Embedding dimensions must be 1536; check RADIUS_EMBEDDING_MODEL");
    }

    const ids = batch.map((doc) => doc.id);
    const hashes = batch.map((doc) => doc.contentHash);
    const contents = batch.map((doc) => doc.content);
    const metadata = batch.map((doc) => JSON.stringify(doc.metadata));
    const vectors = embeddings.map((embedding) => `[${embedding.join(",")}]`);
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
    console.log(`  embedded ${Math.min(offset + batch.length, changed.length)}/${changed.length} (${usage.tokens} tokens)`);
  }

  const liveIds = docs.map((doc) => doc.id);
  await sql`
    delete from public.radius_search_documents
    where kind = 'place' and not (source_id = any(${liveIds}::text[]))
  `;
  console.log("Radius search index is current");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
