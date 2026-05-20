-- Push-fanout dedupe log. `(topic, dedupe_key)` is the natural unique
-- pair: a cron INSERT ON CONFLICT DO NOTHING marks an alert as "claimed"
-- and only that one worker proceeds to send. sent_at lets the data-
-- health cron prune rows older than 30 days so the table stays small.
CREATE TABLE IF NOT EXISTS push_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  dedupe_key  text NOT NULL,
  title       text,
  body        text,
  url         text,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  sent_count  integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS push_log_topic_key_idx
  ON push_log (topic, dedupe_key);

CREATE INDEX IF NOT EXISTS push_log_sent_at_idx
  ON push_log (sent_at);
