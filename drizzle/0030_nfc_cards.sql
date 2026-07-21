-- 0030_nfc_cards.sql — reusable NFC invite cards + per-member first-party analytics.
--
-- WHY THIS EXISTS
-- ---------------
-- Physical NFC cards carry https://frederickradius.app/j/<code>. A tap opens
-- that URL; the /j route validates the card, assigns the tapping DEVICE an
-- anonymous member id attributed to the card, unlocks that device past the beta
-- wall with zero typing (a signed fr_beta cookie, exactly the shape a redeemed
-- per-user code sets, verified by the edge middleware with pure crypto), and
-- drops them at /today. In-app activity for that member is then written to a
-- first-party event log so the owner can see, per card, who joined and what they
-- do. Anonymous by default: no name or email unless the member volunteers it
-- later. Three tables:
--
--   nfc_cards    — one row per physical card. `code` is the tap credential in
--                  the URL and matches /^[a-z0-9][a-z0-9-]{0,63}$/. Cards are
--                  REUSABLE (no per-card member cap is enforced); `max_members`
--                  is reserved for a future cap and is not enforced unless set.
--   nfc_members  — one row per device that ever tapped a card. `id` is a random
--                  url-safe token generated server-side and carried in a SIGNED
--                  httpOnly `fr_member` cookie (HMAC over the beta code secret,
--                  so it cannot be forged). The id grants no access on its own;
--                  it only attributes activity. Anonymous: name/email stay null
--                  unless volunteered. `opted_out` stops all further logging.
--   nfc_events   — the first-party activity log: one row per tracked event
--                  (page_view and named product events), attributed to a member.
--
-- RLS DENY-ALL, matching the rest of the schema: every read/write goes through
-- Drizzle/getDb on the BYPASSRLS role (DATABASE_URL). RLS-on + no-policies
-- denies the anon/authenticated/PostgREST roles, which the app never uses for
-- data. The tap route and the /api/track ingest are PUBLIC endpoints, so this
-- deny-all is load-bearing: the ONLY way to read or write these rows is the
-- guarded /api and /j routes on the server role, never the anon key that ships
-- in the client bundle. A member row can hold volunteered contact details, and
-- the event log is behavioral, so neither may ever be readable from the client.
--
-- Additive + idempotent (IF NOT EXISTS / ENABLE RLS no-op / REVOKE repeatable).
-- Safe to run more than once.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md). db:push /
-- db:migrate are BLOCKED in this project.

-- ── Cards ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nfc_cards (
  code        text        PRIMARY KEY,          -- tap credential; /^[a-z0-9][a-z0-9-]{0,63}$/
  label       text,                             -- who/what it's for (optional)
  batch       text,                             -- print batch label (optional)
  active      boolean     NOT NULL DEFAULT true,
  max_members integer,                          -- reserved; not enforced unless set
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nfc_cards_batch_idx ON public.nfc_cards (batch);

-- ── Members ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nfc_members (
  id           text        PRIMARY KEY,         -- random url-safe token (server-generated)
  card_code    text        REFERENCES public.nfc_cards (code),
  created_at   timestamptz DEFAULT now(),
  last_seen_at timestamptz,
  name         text,                            -- null unless volunteered
  email        text,                            -- null unless volunteered
  opted_out    boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS nfc_members_card_idx    ON public.nfc_members (card_code);
CREATE INDEX IF NOT EXISTS nfc_members_created_idx ON public.nfc_members (created_at);

-- ── Events (first-party activity log) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nfc_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  text        REFERENCES public.nfc_members (id),
  event      text        NOT NULL,
  path       text,
  props      jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nfc_events_member_created_idx ON public.nfc_events (member_id, created_at);
CREATE INDEX IF NOT EXISTS nfc_events_created_idx        ON public.nfc_events (created_at);

-- ── RLS deny-all (server BYPASSRLS role only; no anon/PostgREST access) ──────
ALTER TABLE public.nfc_cards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_events  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_cards   FROM anon, authenticated;
REVOKE ALL ON public.nfc_members FROM anon, authenticated;
REVOKE ALL ON public.nfc_events  FROM anon, authenticated;

COMMENT ON TABLE public.nfc_cards   IS 'Reusable physical NFC invite cards. `code` is the tap credential in /j/<code> and matches /^[a-z0-9][a-z0-9-]{0,63}$/. Server-role only; RLS on with no public policy.';
COMMENT ON TABLE public.nfc_members IS 'One anonymous member per device that tapped a card, attributed to card_code. Identity is a signed httpOnly fr_member cookie; the id grants no access. name/email null unless volunteered; opted_out stops logging. Server-role only; RLS on with no public policy.';
COMMENT ON TABLE public.nfc_events  IS 'First-party per-member activity log written by /api/track. Behavioral data; server-role only, RLS on with no public policy.';
