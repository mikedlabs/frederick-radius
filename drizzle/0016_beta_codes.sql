-- 0016_beta_codes.sql — per-tester beta access codes.
--
-- WHY THIS EXISTS
-- ---------------
-- The beta wall shipped with ONE shared password (lib/beta-gate.ts): everyone
-- who comes in is anonymous and identical, there is no way to see who is
-- actually using the app, and a leaked password can only be fixed by rotating
-- it on EVERY tester at once. Per-user codes fix all three internally: each
-- person gets their own readable code (e.g. "frederick-ada7"), first/recent
-- use can be recorded on that access row, and a single tester can be revoked
-- without touching anyone else. Third-party analytics receives only an
-- aggregate beta-active event, never the code or email label. The shared
-- BETA_PASSWORD stays as an owner master key alongside these.
--
-- Additive + RLS deny-all, matching the rest of the schema: every write goes
-- through the BYPASSRLS server role via /api/beta + /admin/beta-codes; anon/
-- PostgREST gets nothing. The edge middleware NEVER reads this table — it
-- verifies a signed cookie — so the unlock hot path stays a pure crypto check.
-- Idempotent — safe to re-run.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md).

CREATE TABLE IF NOT EXISTS public.beta_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  label        text,
  revoked      boolean NOT NULL DEFAULT false,
  uses         integer NOT NULL DEFAULT 0,
  redeemed_at  timestamptz,
  last_seen_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_codes_code_uq
  ON public.beta_codes (code);

ALTER TABLE public.beta_codes ENABLE ROW LEVEL SECURITY;
