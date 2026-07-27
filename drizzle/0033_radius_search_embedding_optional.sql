-- Keep Radius' exact local search usable when no embedding provider is
-- configured. Postgres FTS lives in the same private table and does not need
-- a vector for every document. A later run with OPENAI_API_KEY backfills the
-- nullable vectors without rebuilding unchanged full-text content.

ALTER TABLE IF EXISTS public.radius_search_documents
  ALTER COLUMN embedding DROP NOT NULL;

COMMENT ON COLUMN public.radius_search_documents.embedding IS
  'Optional OpenAI text-embedding-3-small vector. Null rows remain searchable through the generated FTS column.';
