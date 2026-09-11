-- 0015_beta_emails.sql — the beta-access email list.
--
-- WHY THIS EXISTS
-- ---------------
-- /beta mints and sends personal access codes by email. This table stores the
-- address used for that request so access can be managed or removed later.
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
