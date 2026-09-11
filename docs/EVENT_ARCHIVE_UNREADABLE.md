# The event archive is unreadable in production

Status: **open**. Confirmed against the live database on 2026-08-20, with the
ownership and promoted-build findings added 2026-08-21.
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

## What is confirmed, and what the RLS table does not explain

Two facts settled on 2026-08-21 that change the shape of this.

**The tables are owned by `postgres`, and `relforcerowsecurity` is false.**

```sql
select c.relname, pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('event_canonical_records','event_tombstones','ingest_runs');
--  all three -> postgres
```

A table owner bypasses RLS when force is off. So if `DATABASE_URL`
authenticates as `postgres`, these reads succeed no matter how many policies
are missing. **The RLS table above is real but is not on its own a sufficient
explanation.** Whatever the runtime connects as, it is neither the owner nor
`service_role`.

**It is not promoted-build mode leaking into the runtime.** That hypothesis
was worth testing because `getDb()` returns null whenever
`isPromotedDataBuild()` is true, which would produce exactly these symptoms
with a perfectly healthy database. It is ruled out: `defaultDatabaseProbe` in
`public-health.ts` calls the same `getSql()` and throws on a null client, and
production reports `database: reachable, latencyMs: 3`.

That 3ms also rules out slowness. The connection is healthy and fast. The
archive query specifically is being refused.

## Getting the answer without guessing

Do not pick a fix from the two below by reasoning. Ask production.

Once #1619 ships, the loader carries the real Postgres error instead of
calling every failure "read timeout":

```
curl -s https://frederickradius.app/api/today/events | jq .
```

`sourceHealth.unavailable` will read something like `event archive (read
rejected: permission denied for table event_canonical_records)`. That
sentence names the missing privilege and decides everything below.

The role itself can also be read directly, from a Supabase SQL editor session
or the project logs:

```sql
select usename, application_name, count(*)
from pg_stat_activity
where datname = current_database()
group by 1, 2 order by 3 desc;
```

Sample it while the site is serving traffic. A `pg_stat_activity` snapshot
taken on 2026-08-20 showed only `authenticator`, `pgbouncer`, `postgres` and
`supabase_admin`, and never caught the app's own connection, which is why the
role is still unnamed here.

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
