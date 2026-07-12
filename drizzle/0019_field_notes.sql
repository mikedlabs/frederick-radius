-- Owner-authored field notes + deals, editable from /admin/field-notes (and
-- thus a phone). Read ALONGSIDE the committed src/data/field-notes.json — the
-- JSON is the seed/fallback, DB rows add to it (places-overrides precedence
-- spirit). Additive migration.
--
-- Applied to prod (project vrjujcyuzlipqkrtshhr) via the Supabase MCP on
-- 2026-07-12; committed here for the migration record.
CREATE TABLE IF NOT EXISTS public.field_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_slug    text        NOT NULL,
  kind          text        NOT NULL,            -- 'deal' | 'parking' | 'insider' | 'happy_hour'
  text          text        NOT NULL,
  day_of_week   text,                            -- deals: 'monday'..'sunday' | null = every day
  hours         text,                            -- optional explicit run hours ("5-9 PM")
  source_url    text,
  confidence    text        NOT NULL DEFAULT 'medium',  -- high | medium | low
  last_verified date,
  expires_at    date,                            -- null = evergreen; a past date hides the row
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_notes_slug_idx ON public.field_notes (place_slug);
CREATE INDEX IF NOT EXISTS field_notes_kind_idx ON public.field_notes (kind);

-- Owner-only, same posture as every other table (RLS on, no public policy).
ALTER TABLE public.field_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.field_notes IS 'Owner-authored field notes + deals, edited via /admin/field-notes. Read alongside src/data/field-notes.json (JSON is the seed; DB rows add). Owner-only; RLS on with no public policy.';
