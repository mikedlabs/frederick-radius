# Supabase retention runbook

This is an operator procedure for historical telemetry. It is not part of a
normal deploy and must never run from a browser request.

## Why this exists

The production snapshot measured on 2026-08-24 contained 717,966
`feed_snapshots` rows. The table and indexes occupied 239 MB of a 301 MB
database. Grouping by source and UTC day showed that 716,772 rows had a newer
same-source observation on the same day. Current volume is approximately 235
rows per day, so the runaway request-path write is no longer active; this is a
historical backlog.

The duplicate compactor preserves at least one observation for each source on
each UTC day. The 90-day retention worker is a separate policy and requires a
recent backup.

## Before any delete

1. Confirm the current Supabase backup or point-in-time recovery state in the
   project dashboard.
2. Confirm no schema migration or data repair is running.
3. Use a server-only `DATABASE_URL`. Never copy it into GitHub, client code,
   logs, or a shell history that is being shared.
4. Run the command without `--apply` first:

   ```sh
   npm run maintain:feed-snapshots
   ```

   Record the before telemetry in the maintenance note.

## Bounded duplicate compaction

One batch removes at most 2,000 rows. A reviewed maintenance window can run at
most ten batches in one command:

```sh
CONFIRM_FEED_SNAPSHOT_COMPACTION=1 npm run maintain:feed-snapshots -- --apply --batches=10
```

The command prints each batch and final telemetry. Stop if a batch errors, the
database becomes slow, or the reported row count behaves unexpectedly. Never
raise the code-level ten-batch limit during an incident.

Deletion makes table space reusable, but PostgreSQL may not immediately return
physical file size to the operating system. Do not run `VACUUM FULL`, recreate
the table, or change backup policy as part of this command; those require a
separate maintenance decision because they can lock or rewrite the table.

## Ongoing retention

`/api/cron/data-health-retention` removes capped, oldest-first batches beyond
90 days, but it is intentionally unscheduled and inert until a backup is
confirmed and `DATA_RETENTION_PRUNE=1` is deliberately enabled. A future move
to Supabase Cron should happen only after the same bounded function, run
history, timeout, and alert behavior are reproduced. Adding a second scheduler
before that would restore the ownership problem this cleanup removes.
