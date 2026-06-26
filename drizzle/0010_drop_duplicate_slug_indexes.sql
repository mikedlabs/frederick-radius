-- 0010_drop_duplicate_slug_indexes.sql — Remove redundant unique slug indexes
--
-- WHY THIS EXISTS
-- ---------------
-- categories / events / municipalities / places each carried TWO identical
-- unique btrees on `slug`:
--   1. <table>_slug_unique   — the constraint emitted by Drizzle .unique()
--   2. <table>_slug_idx      — an explicit uniqueIndex() on the same column
-- Postgres maintains both on every insert/upsert for zero read benefit (the
-- Supabase "duplicate index" performance advisory). We keep the _slug_unique
-- CONSTRAINT (it backs the .unique() promise and arbitrates ON CONFLICT (slug)
-- upserts) and drop the redundant _slug_idx index.
--
-- HOW THIS IS APPLIED
-- -------------------
-- Like 0007–0009, this migration is applied BY HAND in the Supabase SQL editor.
-- The drizzle/meta journal is intentionally NOT authoritative here (see
-- drizzle/README.md). Idempotent — safe to re-run.
--
-- schema.ts was updated in the same change to remove the four
-- uniqueIndex("<table>_slug_idx") declarations, so a future
-- `drizzle-kit generate` will not re-propose them.

DROP INDEX IF EXISTS public.categories_slug_idx;
DROP INDEX IF EXISTS public.events_slug_idx;
DROP INDEX IF EXISTS public.municipalities_slug_idx;
DROP INDEX IF EXISTS public.places_slug_idx;
