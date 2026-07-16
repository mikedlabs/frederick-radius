-- Hybrid keyword + semantic retrieval for Radius Intelligence.
--
-- APPLY BY HAND in the Supabase SQL editor before running:
--   npm run build:radius-search
--
-- The app only reads this table through the server-side DATABASE_URL. RLS is
-- deliberately enabled with no public policies, matching the rest of the
-- private Radius data plane. The vector extension lives in `extensions`, the
-- Supabase-recommended schema.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.radius_search_documents (
  kind          text        NOT NULL CHECK (kind IN ('place', 'event', 'field_note')),
  source_id     text        NOT NULL,
  content_hash  text        NOT NULL,
  content       text        NOT NULL,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fts           tsvector    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding     extensions.vector(1536) NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, source_id)
);

CREATE INDEX IF NOT EXISTS radius_search_documents_fts_idx
  ON public.radius_search_documents USING gin (fts);

CREATE INDEX IF NOT EXISTS radius_search_documents_embedding_idx
  ON public.radius_search_documents
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS radius_search_documents_updated_at_idx
  ON public.radius_search_documents (updated_at);

ALTER TABLE public.radius_search_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.radius_search_documents IS
  'Server-only hybrid search index for Radius Intelligence. RLS enabled with no public policies.';
