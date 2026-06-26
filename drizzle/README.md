# Database migrations — read this before touching the schema

**Migrations in this project are applied BY HAND in the Supabase SQL editor.**
The numbered `NNNN_*.sql` files are a manual changelog, not a `drizzle-kit`
journal you can replay.

## The two load-bearing facts

1. **`drizzle/meta/_journal.json` is intentionally partial / non-authoritative.**
   It is missing `0001`, `0007`, `0008`, and `0009` (the event-ingestion tables
   and the hand-applied RLS lockdown). Do **not** trust it to reflect what is
   actually deployed.

2. **`src/lib/db/schema.ts` does NOT model everything in the database.**
   - The raw-SQL ingestion tables — `raw_events`, `ingested_events`,
     `unparseable_locations`, `venue_geocache` (`0001_event_ingestion.sql`) —
     are **not** in `schema.ts` on purpose. The unified-events loader adapts
     them; the app `events` table is a separate, file-sourced mirror.
   - **RLS** (deny-by-default on all public tables, `0007`/`0009`) is not
     modeled in `schema.ts` either.

## Why `npm run db:push` / `db:migrate` are blocked

Because of fact #2, a stock `drizzle-kit push` diffs the live database against
`schema.ts`, sees the ingestion tables and RLS as "not in the schema," and
proposes **DROPPING the ingestion tables and stripping RLS** — which would
destroy production event data and re-open the anon/PostgREST hole that `0009`
deliberately closed. `db:migrate` would likewise desync against the partial
journal.

Both scripts therefore `exit 1` with an explanation. `db:generate` (diff →
SQL file, no apply) and `db:studio` (read) remain safe.

## How to ship a schema change

1. If it touches a **schema.ts-modeled** table, edit `schema.ts` first so the
   code stays the source of truth and a future `drizzle-kit generate` won't
   re-propose the change. For raw-SQL-only tables, skip this.
2. Write the next `NNNN_description.sql` file here. Make it **idempotent**
   (`IF EXISTS` / `IF NOT EXISTS`) so a re-run is safe.
3. Apply it by pasting into the **Supabase SQL editor** and running it.
4. Re-run the relevant Supabase **Advisor** (Security / Performance) to confirm
   the finding cleared.

## The RLS posture is intentional — do not "fix" it

The Supabase advisor reports ~21 tables as "RLS enabled, no policy." That is
**correct and secure**: every app read/write goes through Drizzle on a
`BYPASSRLS` connection (`DATABASE_URL`), never the anon/PostgREST role. Adding
public-read policies would expose the dataset through the anon key for zero app
benefit. Mark those advisor entries as acknowledged; do not add policies unless
a genuine direct-PostgREST consumer is introduced.
