-- 0014_commerce_link_reports.sql — broken commerce-link reports (Phase 1).
--
-- WHY THIS EXISTS
-- ---------------
-- Restaurant pages now surface commerce actions (View menu / Order / Reserve /
-- Delivery / Catering). Links rot. This table is the lightweight queue behind a
-- "Report broken link" action so a dead link can be flagged and later reviewed.
--
-- It is deliberately NOT community_reports: that is a MAP layer (approved rows
-- render as pins), and a broken link is place metadata, not a place on the map.
-- Keeping it separate means a link report can never leak onto the map.
--
-- Also adds the future-mirror `commerce_links` jsonb column to public.places
-- (not written at runtime yet; the app is still file-based for places).
--
-- Additive + RLS deny-all, matching the rest of the schema: every read/write
-- goes through Drizzle/getSql on the BYPASSRLS role; the anon/PostgREST role
-- gets nothing. Idempotent — safe to re-run.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md).

CREATE TABLE IF NOT EXISTS public.commerce_link_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_slug  text NOT NULL,
  place_name  text,
  link_ref    text,                         -- link id when known, else the URL
  url         text,
  provider    text,
  link_type   text,
  issue_type  text NOT NULL DEFAULT 'broken_link',
  note        text,
  status      text NOT NULL DEFAULT 'open',  -- open | reviewed | dismissed
  created_at  timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS commerce_link_reports_place_idx
  ON public.commerce_link_reports (place_slug);
CREATE INDEX IF NOT EXISTS commerce_link_reports_status_idx
  ON public.commerce_link_reports (status);

ALTER TABLE public.commerce_link_reports ENABLE ROW LEVEL SECURITY;

-- Future mirror column for places (the app still reads places from JSON).
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS commerce_links jsonb;
