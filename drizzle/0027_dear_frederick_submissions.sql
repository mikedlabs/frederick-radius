-- 0027_dear_frederick_submissions.sql — public Dear Frederick letter submissions.
--
-- WHY THIS EXISTS
-- ---------------
-- Dear Frederick is a community project of HANDWRITTEN letters mailed to a PO
-- box, transcribed by hand, and published as curated static data
-- (src/data/dear-frederick.ts). This layer adds a way for the public to SUBMIT
-- a scan of a letter digitally, and for the owner to moderate those submissions
-- in /admin/dear-frederick — WITHOUT changing how letters are published. Nothing
-- here ever renders on the public wall. Approving a row only marks it approved;
-- the owner still transcribes it into the static file by hand, so publishing
-- stays curated and the published letters are never database-dynamic.
--
--   dear_frederick_submissions — one row per submitted letter: the uploaded scan
--     (image_url, in Vercel Blob), an optional signature (default 'Anonymous'),
--     an optional contact so the owner can follow up, an optional typed note,
--     and a moderation status. `contact` may hold a private email or phone, so
--     this table must never be readable by the anon key that ships in the client
--     bundle (see RLS below).
--
-- No FK to a letters table: published letters live in the static file, and a
-- submission is a separate intake record that may never be published.
--
-- RLS DENY-ALL, matching the rest of the schema: every read/write goes through
-- Drizzle/getDb on the BYPASSRLS role (DATABASE_URL). RLS-on + no-policies
-- denies the anon/authenticated/PostgREST roles, which the app never uses for
-- data. The submit endpoint is PUBLIC (anyone may send a letter), so this
-- deny-all is load-bearing: the ONLY way to write or read a submission is the
-- guarded /api route on the server role, never the anon key. This keeps a
-- sender's contact details unreadable from the client.
--
-- Additive + idempotent (IF NOT EXISTS / ENABLE RLS no-op / REVOKE repeatable).
-- Safe to run more than once.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md). db:push /
-- db:migrate are BLOCKED in this project.

CREATE TABLE IF NOT EXISTS public.dear_frederick_submissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text        NOT NULL,                     -- the uploaded scan in Vercel Blob
  signature   text,                                     -- how the sender signed off; null = shown as Anonymous
  contact     text,                                     -- private email/phone for owner follow-up; never public
  note        text,                                     -- optional typed message/transcription from the sender
  status      text        NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at  timestamptz DEFAULT now(),
  decided_at  timestamptz
);

CREATE INDEX IF NOT EXISTS dear_frederick_submissions_status_idx  ON public.dear_frederick_submissions (status);
CREATE INDEX IF NOT EXISTS dear_frederick_submissions_created_idx ON public.dear_frederick_submissions (created_at);

-- ── RLS deny-all (server BYPASSRLS role only; no anon/PostgREST access) ─────
ALTER TABLE public.dear_frederick_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dear_frederick_submissions FROM anon, authenticated;

COMMENT ON TABLE public.dear_frederick_submissions IS 'Public Dear Frederick letter submissions: an uploaded scan plus optional signature/contact/note, awaiting owner review. Written only via the guarded public /api/dear-frederick/submit route; approving marks it approved (the owner still transcribes into the static file by hand). May hold private contact info; server-role only, RLS on with no public policy.';
