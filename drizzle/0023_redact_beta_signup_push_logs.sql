-- Remove email addresses written by the former beta-signup owner-alert body.
-- New signup alerts are generic; this idempotent cleanup covers existing rows.
UPDATE push_log
SET body = 'A beta access request is ready in Beta Desk.'
WHERE topic = 'owner-alerts'
  AND dedupe_key LIKE 'signup:%'
  AND body IS DISTINCT FROM 'A beta access request is ready in Beta Desk.';
