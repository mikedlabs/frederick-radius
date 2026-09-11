-- Community reports (community layer, Phase 1). Additive, RLS-locked — apply to
-- the prod Supabase project (vrjujcyuzlipqkrtshhr) when the DB tool is back, the
-- same posture as field_amenities. The /api/reports route + loader are fail-soft
-- until this exists, so deploying the code first is safe.

CREATE TABLE IF NOT EXISTS public.community_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text NOT NULL,                 -- hazard | condition | tip | note
  subtype       text,
  title         text,
  note          text,
  photo_url     text,
  lng           double precision NOT NULL,
  lat           double precision NOT NULL,
  municipality  text,
  status        text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  source        text NOT NULL DEFAULT 'community',
  reported_by   text,
  confirmations integer NOT NULL DEFAULT 0,
  expires_at    timestamptz,
  created_at    timestamptz DEFAULT now(),
  reviewed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS community_reports_status_idx   ON public.community_reports (status);
CREATE INDEX IF NOT EXISTS community_reports_lng_lat_idx  ON public.community_reports (lng, lat);
CREATE INDEX IF NOT EXISTS community_reports_expires_idx  ON public.community_reports (expires_at);
CREATE INDEX IF NOT EXISTS community_reports_created_idx  ON public.community_reports (created_at);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
