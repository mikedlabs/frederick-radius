-- 0015_beta_emails.sql — the owned launch-announcement list.
--
-- WHY THIS EXISTS
-- ---------------
-- Experience review (docs/EXPERIENCE_REVIEW.md, blind spots): the beta wall
-- collects only the shared password, so every person who has ever tried the
-- app is unreachable — launch day has no announcement channel, and an owned
-- list of county residents cannot be built retroactively. /beta now offers an
-- OPTIONAL one-field email signup; this is its table.
--
-- Additive + RLS deny-all, matching the rest of the schema: every write goes
-- through the BYPASSRLS server role via /api/beta/email; anon/PostgREST gets
-- nothing. Idempotent — safe to re-run.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md).

CREATE TABLE IF NOT EXISTS public.beta_emails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  source     text NOT NULL DEFAULT 'beta_page',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_emails_email_uq
  ON public.beta_emails (email);

ALTER TABLE public.beta_emails ENABLE ROW LEVEL SECURITY;
