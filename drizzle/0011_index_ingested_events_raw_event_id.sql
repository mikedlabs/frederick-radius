-- 0011_index_ingested_events_raw_event_id.sql — Index the one unindexed FK
--
-- WHY THIS EXISTS
-- ---------------
-- ingested_events.raw_event_id is `REFERENCES raw_events(id) ON DELETE CASCADE`
-- (0001_event_ingestion.sql) but had no supporting index. The Supabase
-- "unindexed foreign key" advisory flags it: every delete/re-ingest of a
-- raw_events row forces a sequential scan of ingested_events to find the
-- cascading children. An index on the FK column turns that into an index probe
-- and keeps the nightly ingest crons (which feed /today and /events) fast.
--
-- ingested_events is a RAW-SQL-only table — it is deliberately NOT modeled in
-- src/lib/db/schema.ts (the app `events` table is separate; the unified loader
-- adapts both). So this index lives only here, applied BY HAND in the Supabase
-- SQL editor, matching migration 0001's own CREATE INDEX style. Idempotent.

CREATE INDEX IF NOT EXISTS ingested_events_raw_event_id_idx
  ON public.ingested_events (raw_event_id);
