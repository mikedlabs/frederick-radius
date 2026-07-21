-- 0029_search_misses.sql — the app's record of what it couldn't answer.
--
-- WHY THIS EXISTS
-- ---------------
-- The truest map of what data is MISSING is written by users: every search
-- that returns nothing, every Ask that lands with no real place to point at.
-- Those were fire-and-forget Plausible events (aggregate, not queryable). To
-- turn them into an owner-facing "data gaps" queue, each miss is banked here
-- as it happens, then grouped and ranked on /admin/data-gaps.
--
--   search_misses — one row per unmet query: the raw text (a readable sample),
--     a normalized `query_key` so repeats group, its `kind` (search | ask),
--     and when. NO visitor identifier, no IP — only the query, its kind, and
--     the time. Server-role only.
--
-- RLS DENY-ALL, matching the rest of the schema: reads/writes go through
-- Drizzle/getDb on the BYPASSRLS server role; the anon key never touches it.
--
-- Additive + idempotent (IF NOT EXISTS / ENABLE RLS no-op / REVOKE repeatable).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.search_misses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query        text        NOT NULL,                    -- raw sample (trimmed, capped)
  query_key    text        NOT NULL,                    -- normalized grouping key
  kind         text        NOT NULL,                    -- search | ask
  occurred_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_misses_key_idx      ON public.search_misses (query_key);
CREATE INDEX IF NOT EXISTS search_misses_occurred_idx ON public.search_misses (occurred_at);

-- ── RLS deny-all (server BYPASSRLS role only; no anon/PostgREST access) ─────
ALTER TABLE public.search_misses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_misses FROM anon, authenticated;

COMMENT ON TABLE public.search_misses IS 'Unmet queries: searches that returned nothing and Ask answers with no grounded source, banked for the /admin/data-gaps board. Only query text + kind + time; no visitor identifier. Server-role only, RLS on with no public policy.';
