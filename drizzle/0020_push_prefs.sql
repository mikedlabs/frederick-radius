-- 0020 — per-device notification preferences + town targeting.
-- Applied to prod 2026-07-13 via Supabase MCP (apply_migration). Additive and
-- idempotent; all columns nullable/default NULL so existing subscriptions and
-- current send behavior are unchanged until a user opts into quiet hours or a
-- home town is captured.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS home_town text;
-- Eastern-time quiet window: inclusive start hour .. exclusive end hour (0-23).
-- When both are set, NON-URGENT pushes are held during the window; civic alerts
-- (urgent) always bypass. NULL = no quiet hours.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS quiet_start smallint;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS quiet_end smallint;
CREATE INDEX IF NOT EXISTS push_subscriptions_home_town_idx ON push_subscriptions (home_town);
