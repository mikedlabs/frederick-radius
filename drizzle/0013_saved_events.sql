-- 0013_saved_events.sql — device-scoped saved-event reminders (critic-1).
--
-- WHY THIS EXISTS
-- ---------------
-- The app advertises "One hour before something you saved starts" (a push
-- topic users opt into via NotificationsCard), but saves are localStorage-only
-- and no server record existed of WHICH device saved WHICH event — so the
-- promised reminder never fired. This table records (device push endpoint,
-- event slug) pairs, populated by /api/saved when an event is saved on a device
-- that has push consent. The /api/cron/saved-reminders job (gated behind
-- SAVED_REMINDERS_ENABLED) joins it to push_subscriptions to send a
-- DEVICE-SCOPED reminder (never the broadcast fanout).
--
-- Additive + RLS deny-all, matching the rest of the schema: every read/write
-- goes through Drizzle/getSql on the BYPASSRLS role; the anon/PostgREST role
-- gets nothing. Idempotent — safe to re-run.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md).

CREATE TABLE IF NOT EXISTS public.saved_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    text NOT NULL,          -- the device's push-subscription endpoint
  event_slug  text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_events_endpoint_slug_uq
  ON public.saved_events (endpoint, event_slug);
CREATE INDEX IF NOT EXISTS saved_events_slug_idx
  ON public.saved_events (event_slug);

ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
