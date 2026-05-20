-- Web Push subscriptions. One row per (device, endpoint) pair.
-- The push service URL is the natural unique key; the keys are needed
-- for encrypted-payload delivery; topics is the per-user subscription
-- state (jsonb so new topic strings don't require a migration).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  device_id     text,
  topics        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_device_idx
  ON push_subscriptions (device_id)
  WHERE device_id IS NOT NULL;
