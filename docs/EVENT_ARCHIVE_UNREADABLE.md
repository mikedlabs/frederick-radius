# The event archive outage, 2026-08-19 to 2026-08-21

Status: **resolved** by #1624 and verified on production on 2026-08-21 at
15:57 UTC. The detection work that made the cause visible shipped in #1615
and #1619.

A fresh production check on 2026-08-27 at 18:00 UTC returned three event
cards from `/api/today/events` with `partial: false`, no issues, and no
unavailable sources. The current reader still sends archive bounds as ISO text
with explicit `::timestamptz` casts, and its regression test rejects any
`Date` object that reaches the pooled driver.

This document originally gave a confident but incorrect diagnosis. It is kept
and rewritten because the failed investigation is part of the operational
record.

## What was actually broken

`snapshotBounds` returns `{ start: Date; end: Date }`. Both values were passed
directly into a `postgres` tagged template. Production rejected every archive
read with this Node error:

```
The "string" argument must be of type string or an instance of Buffer
or ArrayBuffer. Received an instance of Date
```

The driver could not serialize the parameter. **Postgres never saw the
query.**

On a direct connection, postgres-js infers the parameter type and applies its
own `Date` serializer. That is why the failure did not reproduce locally or in
CI. Production connects through the Supavisor transaction pooler, where
`src/lib/db/client.ts` must set `prepare: false`. Without the inference round
trip, the raw `Date` reached the string writer.

The collector remained healthy. The write path in
`src/lib/events/event-identity.ts` already passed timestamps as strings, while
the readers passed `Date` objects. The archive therefore grew to 2,185 records
while public surfaces fell back to their compiled curated events.

`src/lib/loaders/eventRelated.ts` contained the same bug and was fixed in the
same change.

The fix sends ISO text with an explicit `::timestamptz` cast. That is correct
with prepared statements enabled or disabled and matches the existing write
path.

## Why it took three tries

| Investigation | Diagnosis | Verdict |
| --- | --- | --- |
| #1576 | Cold-start read timeouts | Not the cause. It fixed real but unrelated defects. |
| #1581 | RLS enabled with zero policies | Not the cause and treated too early as settled. |
| 2026-08-20 follow-up | Reconfirmed the RLS table and repeated #1581 | Not the cause. |

All three investigations reasoned from outside the failing query. At the
time, `beforeDeadline` returned `null` for both a rejected read and a slow one,
and the caller described every `null` as a read timeout. The application could
only report that the archive was slow.

It was not slow. `/api/health` completed `SELECT 1` through the same client in
3 ms during the incident. #1619 preserved the real failure for operators, and
production named the driver error on the first request after deployment.

## The RLS finding was real and was not the cause

The production audit during the incident found this posture:

| Table | RLS enabled | RLS forced | Policies | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | ---: | --- | --- | --- |
| `event_canonical_records` | yes | no | 0 | no | no | yes |
| `event_tombstones` | yes | no | 0 | no | no | yes |
| `ingest_runs` | yes | no | 0 | no | no | yes |
| `ingested_events` | yes | no | 0 | no | no | yes |
| `raw_events` | yes | no | 0 | no | no | yes |

The three tables read by the archive loader were owned by `postgres`, and
`relforcerowsecurity` was false, so the owner bypassed RLS. The repository's
current database contract also expects application reads to use a SQL
connection role with `BYPASSRLS`; the zero-policy posture is intentional. See
`drizzle/README.md`.

Do not try to fix an archive read by granting `anon`. That role reaches tables
through the public PostgREST surface. The raw-SQL ingestion tables and their
RLS posture are deliberately outside `src/lib/db/schema.ts` so an automated
schema push cannot reopen that path. Database migrations remain manual and
must follow `drizzle/README.md`.

## Runbook for a quiet event surface

### 1. Read the public health contract

```
curl -sS https://frederickradius.app/api/today/events \
  | jq '{events: (.events | length), partial, issues, unavailable}'
```

The public endpoint exposes stable codes in `issues`, not raw database errors:

| Code | Meaning and next check |
| --- | --- |
| `event_archive_timeout` | The bounded read exceeded its deadline. Check pooled connection latency and query timing. |
| `event_archive_unavailable` | The client was absent, the query was rejected, or the anchored read returned no row. Inspect the server diagnostic. |
| `event_archive_status_unavailable` | The latest archive ledger row could not be confirmed. Do not call this a collector failure without checking `ingest_runs`. |
| `event_archive_refresh_failed` | The latest `event-archive` run finished with an error. Investigate the writer. |
| `event_archive_stale` | The latest archive run is older than the five-hour freshness limit. Check the cron and its heartbeat. |
| `event_archive_validation` | One or more archived snapshots failed validation and were withheld. Inspect the snapshots and validator tests. |

`partial: false` with an empty `issues` array is the healthy reader state. A
nonzero event count alone is not proof because curated events remain available
during an archive outage.

### 2. Read the server diagnostic for an unavailable archive

The public response intentionally does not echo arbitrary driver text. Query
failures are logged server-side as:

```
[events] Archive read rejected.
```

The attached diagnostic is flattened, bounded, and credential-redacted. Use
that record to distinguish a transport error from a missing relation, a
privilege problem, or malformed input. Do not infer the cause from
`event_archive_unavailable` alone.

### 3. Separate reader health from writer health

Check `/admin/data-health` and the latest `event-archive` entry in
`ingest_runs`.

- `event_archive_refresh_failed` and `event_archive_stale` point first to the
  archive writer or its schedule.
- `event_archive_unavailable` points first to the runtime connection or read
  query.
- `event_archive_status_unavailable` means the reader could not establish the
  writer's ledger state. It does not prove that the writer failed.

The event-source tripwire treats any archive loss as broad degradation even
when curated or cached events keep the page populated. Do not use a populated
Today or Events page as the all-clear.

### 4. Account for response caching

`/api/today/events` is forced dynamic and reads the archive at runtime. The
route marks healthy responses as briefly shareable and degraded responses as
`private, no-store`. Check response headers when verifying a transition. A
previously healthy shared response can briefly outlive a new failure, while a
degraded fallback must not be taught to the shared cache.

### 5. Preserve the pooled-driver contract

For raw SQL used through Supavisor transaction pooling:

- Keep `prepare: false` and one connection per serverless instance as defined
  in `src/lib/db/client.ts`.
- Convert timestamps to ISO strings before interpolation and cast them
  explicitly in SQL.
- Serialize structured archive payloads before binding them. Do not pass raw
  `Date` objects or JavaScript objects to the driver.
- Run the focused loader tests, which assert that no `Date` reaches the archive
  query.

## Verified after the original fix

```
/api/today/events   events: 3 | partial: false | unavailable: none
/events             real ingested events, not only the compiled seeds
                    (county boards, city council, Black Frederick Festival,
                     Crush Fest at McClintock Distilling, bluegrass jam)
```
