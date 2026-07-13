-- 0021 — aggregate open (notification-click) tracking. Applied to prod
-- 2026-07-13 via Supabase MCP. Each push_log row is one send (a topic fan-out
-- or an owner broadcast); the service worker reports clicks and we increment
-- open_count, so the composer can show reach vs. opens. Additive + idempotent.
ALTER TABLE push_log ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
