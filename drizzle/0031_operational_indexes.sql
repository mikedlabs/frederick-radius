-- 0031_operational_indexes.sql — close verified production index drift.
--
-- Production has the NFC tables from 0030 but not both indexes that make
-- member history and time-based retention efficient. feed_snapshots also
-- needs a global timestamp index because hydration asks for the newest rows
-- across every source, not only the newest rows within one source.
--
-- Additive and idempotent. Apply by hand in the Supabase SQL editor per
-- drizzle/README.md, then re-run the Performance Advisor.

CREATE INDEX IF NOT EXISTS nfc_events_member_created_idx
  ON public.nfc_events (member_id, created_at);

CREATE INDEX IF NOT EXISTS nfc_events_created_idx
  ON public.nfc_events (created_at);

CREATE INDEX IF NOT EXISTS feed_snapshots_taken_idx
  ON public.feed_snapshots (taken_at);
