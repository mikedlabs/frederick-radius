-- 0026_food_truck_beacons.sql — the food-truck operator-beacon layer.
--
-- WHY THIS EXISTS
-- ---------------
-- Roaming food trucks have no honest fixed pin. This layer lets an operator,
-- once the owner has approved their claim, drop a live "I'm out here until 8p"
-- beacon that shows on /food-trucks ONLY while it is genuinely live. Two tables:
--
--   food_truck_claims   — the owner-approved gate. An operator requests to claim
--                         their truck (status='pending'); the owner approves in
--                         /admin/food-trucks, which mints a random opaque `token`.
--                         That token is the ONLY credential that authorizes a
--                         beacon write, and it is validated against an APPROVED
--                         row for the exact truck_slug on every write.
--   food_truck_beacons  — one row per drop: a county-locked location plus a
--                         self-expiring window. The write path CAPS expires_at
--                         at most 8 hours out so a stale beacon can never linger,
--                         and the pure read layer only ever renders a beacon
--                         while now() sits inside [started_at, expires_at).
--
-- No FK to a trucks table: the roster is the static file src/data/food-trucks.ts
-- and `truck_slug` is the loose string key, matching every other table here.
--
-- RLS DENY-ALL, matching the rest of the schema: every read/write goes through
-- Drizzle/getDb on the BYPASSRLS role (DATABASE_URL). RLS-on + no-policies
-- denies the anon/authenticated/PostgREST roles, which the app never uses for
-- data. The beacon write is a PUBLIC endpoint, so this deny-all is load-bearing:
-- it means the ONLY way to write a beacon is the token-gated /api route, never
-- the anon key that ships in the client bundle.
--
-- Additive + idempotent (IF NOT EXISTS / ENABLE RLS no-op / REVOKE repeatable).
-- Safe to run more than once.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md). db:push /
-- db:migrate are BLOCKED in this project.

-- ── Claims ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_truck_claims (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_slug    text        NOT NULL,
  operator_name text        NOT NULL,
  contact       text        NOT NULL,             -- free text: email or phone
  status        text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  token         text,                             -- null until approved; random opaque capability token
  created_at    timestamptz DEFAULT now(),
  decided_at    timestamptz
);

CREATE INDEX IF NOT EXISTS food_truck_claims_status_idx ON public.food_truck_claims (status);
CREATE INDEX IF NOT EXISTS food_truck_claims_truck_idx  ON public.food_truck_claims (truck_slug);
-- One token maps to exactly one claim; partial so many pending (null token) rows coexist.
CREATE UNIQUE INDEX IF NOT EXISTS food_truck_claims_token_uq
  ON public.food_truck_claims (token) WHERE token IS NOT NULL;

-- ── Beacons ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_truck_beacons (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_slug  text        NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  spot        text,                               -- operator's free-text spot label
  note        text,                               -- short "what's on" note
  started_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,               -- capped server-side (max 8h out)
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_truck_beacons_truck_idx   ON public.food_truck_beacons (truck_slug);
CREATE INDEX IF NOT EXISTS food_truck_beacons_expires_idx ON public.food_truck_beacons (expires_at);

-- ── RLS deny-all (server BYPASSRLS role only; no anon/PostgREST access) ─────
ALTER TABLE public.food_truck_claims  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_truck_beacons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_truck_claims  FROM anon, authenticated;
REVOKE ALL ON public.food_truck_beacons FROM anon, authenticated;

COMMENT ON TABLE public.food_truck_claims  IS 'Owner-approved food-truck claims. Approving mints a random opaque token that gates beacon writes. Server-role only; RLS on with no public policy.';
COMMENT ON TABLE public.food_truck_beacons IS 'Live food-truck operator beacons: county-locked location + capped self-expiring window. Written only via the token-gated /api/food-trucks/beacon route. Server-role only; RLS on with no public policy.';
