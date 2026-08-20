# The event archive is unreadable in production

Status: **open**. Confirmed against the live database on 2026-08-20.
Tracking issue: #1581. Detection shipped in #1615. The fix below is not applied.

## What is wrong

The archive is full and the app cannot see any of it.

Queried directly against `vrjujcyuzlipqkrtshhr` on 2026-08-20 at 21:22 UTC:

```
canonical_total       2185
upcoming_scheduled    1170     next 60 days
today_scheduled         65     today, America/New_York
tombstones             653
last_archive_run      2026-08-20 21:04:21+00     18 minutes earlier
last_archive_status   partial                    the normal steady state
```

At that same moment production served:

```
/api/today/events  ->  events: 0 | partial: true
```

65 events were scheduled for that day. The app showed the 39 curated seeds
compiled into the bundle. The collector is healthy and has never been the
problem.

## Why

RLS is enabled with zero policies, and neither `anon` nor `authenticated`
holds a SELECT grant:

| table | rls_enabled | rls_forced | policies | anon | authenticated | service_role |
| --- | --- | --- | ---: | --- | --- | --- |
| `event_canonical_records` | true | false | 0 | ✗ | ✗ | ✓ |
| `event_tombstones` | true | false | 0 | ✗ | ✗ | ✓ |
| `ingest_runs` | true | false | 0 | ✗ | ✗ | ✓ |
| `ingested_events` | true | false | 0 | ✗ | ✗ | ✓ |
| `raw_events` | true | false | 0 | ✗ | ✗ | ✓ |

RLS on with no policy denies every role except the table owner (because
`rls_forced` is false) and `service_role`. A denial returns **zero rows, not an
error**, which is why every surface degraded politely instead of failing.

## The one thing still unknown

The app does not use PostgREST. `src/lib/db/client.ts` opens a direct
`postgres-js` connection from `DATABASE_URL`, so the only thing that matters is
which role that string authenticates as, and whether that role owns these
tables.

`pg_stat_activity` during the investigation showed `authenticator` (PostgREST),
`pgbouncer`, `postgres` (Supavisor and mgmt-api), and `supabase_admin`. The
app's own connection was not sampled, so **the connecting role was never
confirmed**, and neither was table ownership.

That single answer decides which fix below is correct. Run this first:

```sql
select c.relname as table_name, pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('event_canonical_records','event_tombstones','ingest_runs');
```

If the owner is `postgres` and `DATABASE_URL` authenticates as `postgres`, then
reads should already work and something else is wrong. In every other case one
of the two fixes below applies.

## Fix A, preferred: let the app's role read

Use this when the connecting role is a real role that simply lacks the grant.
Replace `<app_role>` with the username from `DATABASE_URL`. This grants read
only, on the three tables the reader touches, and does not disturb RLS.

```sql
grant select on public.event_canonical_records to <app_role>;
grant select on public.event_tombstones        to <app_role>;
grant select on public.ingest_runs             to <app_role>;

create policy "app reads scheduled events"
  on public.event_canonical_records for select to <app_role> using (true);
create policy "app reads tombstones"
  on public.event_tombstones for select to <app_role> using (true);
create policy "app reads its own ingest ledger"
  on public.ingest_runs for select to <app_role> using (true);
```

## Fix B: point the app at a role that can already read

`service_role` already holds SELECT on all five tables. If the intended design
is for the runtime to connect with those privileges, then the RLS posture is
correct as it stands and the bug is the connection string. Change
`DATABASE_URL` in Vercel Production and redeploy. No migration required.

Prefer this only if the runtime is genuinely meant to hold service privileges.
It is a much broader grant than Fix A.

## Do not grant `anon`

`anon` reaches these tables through PostgREST, which is a public HTTP surface.
`drizzle/README.md` and `CLAUDE.md` both record that `schema.ts` deliberately
omits the raw-SQL ingestion tables and their RLS precisely so a careless push
cannot re-open the anon hole. Granting `anon` here would re-open it by hand.
The app does not need it: it connects directly, not through PostgREST.

## Verifying the fix

```
curl -s https://frederickradius.app/api/today/events | jq '{n: (.events|length), partial}'
```

Expect a non-zero count with `partial: false`. `/today` and `/events` should
show live listings rather than the curated seeds.

Independently, `/admin/data-health` should stop reporting
`event archive (unreadable)`. As of #1615 that string means the reader was
locked out, and is deliberately distinct from `event archive (last run failed)`,
which means the collector failed. Conflating those two is what sent the
2026-08-18 diagnosis at a healthy collector.

## Applying it

Migrations here are applied by hand in the Supabase SQL editor. `npm run
db:migrate` and `npm run db:push` are both blocked on purpose, because
`schema.ts` does not model these tables and drizzle-kit would propose dropping
them. See `drizzle/README.md`.
