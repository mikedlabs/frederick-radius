# The event archive outage, 2026-08-19 to 2026-08-21

Status: **resolved** by #1624, verified on production 2026-08-21 15:57 UTC.
Detection that made it findable: #1615 and #1619.

This document said something confident and wrong for a day. It is kept, and
rewritten, because the wrong version is the useful part.

## What was actually broken

`snapshotBounds` returns `{ start: Date; end: Date }` and both were passed
straight into a `postgres` tagged template. Production answered every archive
read with a Node `TypeError`:

```
The "string" argument must be of type string or an instance of Buffer
or ArrayBuffer. Received an instance of Date
```

The driver could not serialise the parameter. **Postgres never saw the query.**

On a direct connection `postgres-js` infers the parameter type and applies its
own Date serialiser, which is why this never reproduced locally or in CI.
Production connects through the Supavisor pooler, where `src/lib/db/client.ts`
must set `prepare: false`; the inference round trip does not happen and the raw
`Date` reaches the string writer.

The collector was healthy throughout. The write path in `event-identity.ts` has
always passed strings (`startsAt: string`) and every reader passed `Date`
objects. That asymmetry is the entire outage: the archive filled to 2,185
records while every surface served the compiled curated seeds.

`eventRelated.ts` carried the identical bug and was fixed in the same change.

The fix is ISO text with an explicit `::timestamptz`, which is correct under
either prepare mode and is what the write path already did.

## Why it took three tries

| | diagnosis | verdict |
| --- | --- | --- |
| #1576 | cold-start read timeouts | wrong, fixed real but unrelated defects |
| #1581 | RLS enabled with zero policies | wrong, and read as settled |
| 2026-08-20 | confirmed #1581's table, repeated it | wrong, and confidently |

Every one of those was reasoning from outside the system, because from outside
the system all three failure modes looked identical. `beforeDeadline` returned
`null` for a rejected read and a slow one alike, and the caller labelled every
`null` `"read timeout"`. The app could only ever report that the archive was
slow.

It was not slow. `/api/health` ran `SELECT 1` on that same client at 3ms
throughout.

#1619 made the loader carry the real error. Production named the cause on the
first request after deploy. **The answer took one request; the guessing took two
days.**

## The RLS finding, which was real and was not the cause

This is worth keeping because it is true and it will look like a cause again
the next time someone reads it.

| table | rls_enabled | rls_forced | policies | anon | authenticated | service_role |
| --- | --- | --- | ---: | --- | --- | --- |
| `event_canonical_records` | true | false | 0 | ✗ | ✗ | ✓ |
| `event_tombstones` | true | false | 0 | ✗ | ✗ | ✓ |
| `ingest_runs` | true | false | 0 | ✗ | ✗ | ✓ |
| `ingested_events` | true | false | 0 | ✗ | ✗ | ✓ |
| `raw_events` | true | false | 0 | ✗ | ✗ | ✓ |

All three event tables are owned by `postgres`, and `relforcerowsecurity` is
false, so **the owner bypasses RLS**. That was the detail that should have
retired the theory a day earlier: if the runtime authenticates as `postgres`,
these reads succeed regardless of the missing policies.

Do not "fix" this by granting `anon`. `anon` reaches these tables over public
HTTP through PostgREST, and both `drizzle/README.md` and `CLAUDE.md` record that
`schema.ts` omits the raw-SQL ingestion tables precisely so a careless push
cannot reopen that hole. The app connects directly and does not need it.

## What to do when a surface goes quiet again

1. Read the reason, do not infer it.
   ```
   curl -s https://frederickradius.app/api/today/events | jq .
   ```
   `unavailable` names the actual failure: `read rejected: <error>`,
   `read timeout`, `no database`, or `read returned no anchor row`. Those are
   four different problems and they used to share one sentence.

2. Expect the first read after a deploy to say `no database`. `/api/today/events`
   is ISR with `revalidate = 300`, so the first response served is the
   build-time render, where `isPromotedDataBuild()` deliberately returns a null
   client. Wait for revalidation before believing it.

3. A populated page is not proof. The curated seeds are compiled into the bundle
   and survive any outage, which is why `eventsTripwire` stayed green for two
   days: a single seed landing today satisfied its "zero events" check. #1615
   made any archive failure a broad failure that fires on its own.

## Verified after the fix

```
/api/today/events   events: 3 | partial: false | unavailable: none
/events             real ingested events, not the 34 compiled seeds
                    (county boards, city council, Black Frederick Festival,
                     Crush Fest at McClintock Distilling, bluegrass jam)
```
