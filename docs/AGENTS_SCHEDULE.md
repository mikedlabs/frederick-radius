# Frederick Radius — Agents & Schedule

> The recurring jobs that keep the app's local data fresh and growing.
> Two engines run this work: **Vercel cron** for pure, deterministic data
> refreshes that write to the live store, and **GitHub Actions** for
> judgment calls and anything that should land through a reviewed PR. The
> rule of thumb: if a human should look at the diff before it ships, it
> runs on GitHub Actions; if it's a safe, idempotent refresh of a known
> source, it runs on Vercel cron.

**Last updated:** 2026-08-02

---

## Core data schedule

This table covers the jobs that maintain the shared discovery, event, hours,
and Ask Radius data. `vercel.json` remains the source of truth for the complete
cron list, including product notifications, reminders, parking, scanner, and
food-truck jobs.

| Cadence                                                                    | Job                           | What it does                                                                                                                                                                                                                                                | Mechanism                                                                |
| -------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Every 2 hours at :11                                                       | `event-archive`               | Reuses the hot event-cache products to upsert durable event identities and aliases. It records its own strict heartbeat, can be retried safely through idempotent batches, and only tombstones rows from publishers whose complete raw inventory succeeded. | Vercel cron (`/api/cron/event-archive`)                                  |
| Dormant                                                                    | `visit-frederick`             | The factual-only snapshot route is activation-ready but deliberately unscheduled until written Visit Frederick factual-reuse permission is documented.                                                                                                      | Manual verification only; not present in `vercel.json`                   |
| Every 30 min                                                               | `notify-civic-alerts`         | Pushes new civic alerts to subscribers.                                                                                                                                                                                                                     | Vercel cron (`/api/cron/notify-civic-alerts`)                            |
| Every 4 hours at :15                                                       | `food-truck-schedules`        | Refreshes the compact published-stop artifact from allowlisted vendor, venue, and organizer calendars.                                                                                                                                                      | Vercel cron (`/api/cron/food-truck-schedules`)                           |
| Nightly 09:00 UTC                                                          | `ingest/civicengage`          | Refreshes Frederick County and municipal CivicEngage calendars into the event store, with one durable source heartbeat per domain.                                                                                                                          | Vercel cron (`/api/ingest/civicengage`)                                  |
| Nightly 07:00 UTC                                                          | `business-status`             | Checks a rotating, cost-capped batch for Google business-status mismatches. This route reports; it does not write the repo.                                                                                                                                 | Vercel cron (`/api/cron/business-status`)                                |
| Nightly 08:00 UTC                                                          | `hours-refresh`               | Refreshes the day's bucket in a six-day rotation of eligible food/drink place hours and persists the results to Postgres. Requires `HOURS_REFRESH_CRON=1`.                                                                                                   | Vercel cron (`/api/cron/hours-refresh`)                                  |
| Nightly 08:20 UTC                                                          | `spatial-places`              | Atomically syncs the deployed public place catalog into its private PostGIS mirror and stamps a checksum only after exact coordinate parity. Requires verified migration `0037` and `RADIUS_POSTGIS_SYNC=1`.                                                | Vercel cron (`/api/cron/spatial-places`)                                 |
| Nightly 08:30 UTC                                                          | `radius-search`               | Fills or updates a bounded batch of the private place search index. Unchanged place documents cost nothing. Requires `RADIUS_SEARCH_CRON=1`.                                                                                                                | Vercel cron (`/api/cron/radius-search`)                                  |
| Nightly 09:05 UTC                                                          | `data-health-feeds`           | Pulls the bounded live-feed set and persists one current snapshot for each successful source.                                                                                                                                                               | Vercel cron (`/api/cron/data-health-feeds`)                              |
| Nightly 09:10 UTC                                                          | `data-health-retention`       | Remains inert unless `DATA_RETENTION_PRUNE=1`; when explicitly enabled after a backup check, removes bounded oldest-first batches.                                                                                                                          | Vercel cron (`/api/cron/data-health-retention`)                          |
| Nightly 09:30 UTC                                                          | `data-health`                 | Reads the phase heartbeats, runs the final health gates, and sends one coherent report. Missing, stale, or incomplete required phases are red.                                                                                                              | Vercel cron (`/api/cron/data-health`)                                    |
| Daily 12:00/13:00 UTC                                                      | `daily-briefing`              | Builds the daily briefing payload.                                                                                                                                                                                                                          | Vercel cron (`/api/cron/daily-briefing`)                                 |
| Daily 08:00 UTC                                                            | **ingest-business-info**      | Reads eligible food and drink websites in a bounded batch, rebuilds the description review queue, and opens a review PR.                                                                                                                                    | GitHub Actions (`.github/workflows/ingest-business-info.yml`)            |
| Daily 08:30 UTC                                                            | **ingest-civic**              | Refreshes municipal civic information from configured government sources and opens a review PR.                                                                                                                                                             | GitHub Actions (`.github/workflows/ingest-civic.yml`)                    |
| Daily 09:30 UTC                                                            | **ingest-venues**             | Refreshes events from configured venue websites, runs copy and provenance checks, and opens a review PR.                                                                                                                                                    | GitHub Actions (`.github/workflows/ingest-venues.yml`)                   |
| Nightly 09:00 UTC                                                          | **data-steward**              | Pulls the business-status and hours snapshots, rebuilds public data, blocks critical safety failures, reports high-severity debt, and opens a review PR for incremental improvements.                                                                       | GitHub Actions (`.github/workflows/data-steward.yml`)                    |
| Daily 12:00 UTC                                                            | **feed-health**               | Probes the critical external feeds and exits non-zero if any critical endpoint is down — the job goes red so you can alert.                                                                                                                                 | GitHub Actions (`.github/workflows/feed-health.yml`)                     |
| Weekly Mon 07:00 UTC                                                       | **discovery**                 | `npm run discover` dry run ($0, no API call). Publishes the candidate count + cost projection to the job summary and an artifact.                                                                                                                           | GitHub Actions (`.github/workflows/discovery.yml`)                       |
| Deferred — manual only                                                     | **Firecrawl Source Watch**    | The County Connector baseline succeeded in run `30734393491`, attempt 2. Its proposed weekly schedule remains absent until a live unchanged repeat is accepted. Manual runs reserve one credit; scheduled Firecrawl spend is currently zero.                | Manual `workflow_dispatch` (`.github/workflows/source-intelligence.yml`) |
| 2nd/16th 14:11, 5th/19th 14:21, 8th/22nd 14:31, 11th 14:41, 25th 14:51 UTC | **Tavily Source Scout**       | Runs the civic, event, and food-truck profiles twice monthly and the menus/accessibility and unresolved-source profiles once monthly. Eight runs reserve 96/300 credits and can commit at most 20 basic-search credits.                                     | GitHub Actions (`.github/workflows/source-intelligence.yml`)             |
| Monthly 5th, 15th, and 25th at 15:17 UTC                                   | **Apify source change radar** | Checks three exact difficult venue pages and updates a private review queue. Three runs reserve at most $0.45 of the $0.90 monthly ceiling, leaving rerun headroom.                                                                                         | GitHub Actions (`.github/workflows/apify-source-change-radar.yml`)       |

Each scheduled GitHub Actions workflow listed above also exposes
`workflow_dispatch` for a manual run. All cron times are UTC; Frederick County
is UTC−4 during daylight saving time and UTC−5 during standard time. Source
Watch is manual-only while its unchanged-repeat proof is pending.

---

## Vercel cron vs GitHub Actions — which runs what, and why

**Vercel cron** (`vercel.json` → `crons`) runs the pure, deterministic
data work — the refreshes that read a known source and write straight to
the live store with no judgment required. These are idempotent and safe
to run unattended: `business-status` re-derives open/closed from Google
Places, `data-health` snapshots freshness, `ingest/civicengage`,
`ingest/fcpl`, and `ingest/fcvfra` pull the scheduled event feeds, and
`notify-civic-alerts` fans out push notifications. `warm-events` is limited to
the user-facing caches; the slower `event-archive` worker has its own runtime
budget and heartbeat so archive pressure cannot delay those cache warms. Data
health is split into a
bounded feed worker, a separately gated retention worker, and a read-mostly
final reporter so one slow database queue cannot consume a single long-running
cron.
They live next to the app, run in the deployment's own runtime, and never
touch the repo.

**GitHub Actions** runs the work that needs a human in the loop or that
produces a _repo_ artifact rather than a live-store write:

- **data-steward** regenerates committed data files (transit GTFS, park
  amenities, business status) and opens a **PR** so the data diff is
  reviewed before it merges. It never pushes straight to a content
  branch. The core hours and business-status pulls fail loudly when their
  configuration or persistence breaks. Secondary transit and park rebuilds
  remain fail-soft. Critical publication gates still block the PR; known
  high-severity coverage debt is reported without preventing an incremental
  refresh from being reviewed.
- **feed-health** is the tripwire: it has no `|| true`, so a dead
  critical feed fails the job and turns the workflow red. Wire a
  Slack/email alert on this workflow's failure if you want a page.
- **ingest-business-info**, **ingest-civic**, and **ingest-venues** use
  Claude to extract structured facts from configured first-party websites.
  Each workflow runs its own checks and opens a review PR; none publishes
  generated changes directly to the product.
- **discovery** is judgment-gated by design. The dry run costs $0 and
  only prints the plan; a future Claude review step (see the TODO in the
  workflow) reads that plan and recommends which categories/towns are
  worth a live, cost-capped `--live --confirm` pass.
- **Source Watch, Source Scout, and the Apify radar** run outside the visitor
  request path and produce review queues only. Source Watch remains manual;
  the Scout and radar schedules select tracked profiles or source IDs,
  initialize no missing state, and cannot publish canonical data.

The dividing line: **pure data → Vercel cron; judgment or PR-gated →
GitHub Actions.**

---

## Secrets and variables

GitHub Actions configuration lives in the repo under **Settings → Secrets and
variables → Actions**. Put protected values under **Secrets** and reference
them with `${{ secrets.NAME }}`. Put browser-safe project configuration under
**Variables** and reference it with `${{ vars.NAME }}`. Pass either kind into a
step via `env:`.

| Name                                   | Kind     | Used by                                                                       | Purpose                                                                                   |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`                | Secret   | data-steward (`refresh:business-status`), a live `discover` run               | Google Places lookups for business status and place discovery.                            |
| `NEXT_PUBLIC_SUPABASE_URL`             | Variable | data-steward (`refresh:hours`)                                                | Supabase project URL for the read-only Data API hours pull.                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variable | data-steward (`refresh:hours`)                                                | Supabase publishable key for the read-only Data API hours pull.                           |
| `ANTHROPIC_API_KEY`                    | Secret   | business-info, civic, and venue extraction; discovery review when implemented | Runs the three current extraction workflows. The discovery dry run does not use it today. |
| `BLOB_READ_WRITE_TOKEN`                | Secret   | any job that reads/writes Vercel Blob artifacts                               | Auth for `@vercel/blob` storage (photos, generated artifacts).                            |
| `FIRECRAWL_API_KEY`                    | Secret   | Source Watch in the GitHub `Production` environment                           | Retrieves one exact reviewed page per intentional manual run.                             |
| `TAVILY_API_KEY`                       | Secret   | Source Scout in the GitHub `Production` environment                           | Runs narrow, domain-constrained discovery profiles.                                       |
| `APIFY_TOKEN`                          | Secret   | Apify radar in the GitHub `APIFY_TOKEN` environment                           | Runs the three-page private fingerprint radar.                                            |

Manual Source Watch runs do not enable the extraction fallbacks. Keep
`VENUE_FIRECRAWL_FETCH_FALLBACK`, `BUSINESS_FIRECRAWL_FETCH_FALLBACK`, and
`CIVIC_FIRECRAWL_FETCH_FALLBACK` at `0`; use a cap of `1` only during an
intentional one-run fallback proof, then turn the flag off again.

The hours pull depends on migration
`0034_expose_place_hours_refresh_read_only.sql`, which grants anonymous
column-level read access only to the non-sensitive hours snapshot fields. It
does not need `DATABASE_URL` in GitHub Actions.

Vercel cron routes read the same values from the Vercel project's
**Environment Variables** (Project → Settings → Environment Variables),
not from GitHub — set them in both places if a value is needed by both
engines. `GITHUB_TOKEN` is provided automatically to Actions and is what
the PR-opening step uses. Under Repository Settings → Actions → General, also
enable **Allow GitHub Actions to create and approve pull requests**;
workflow-level write permissions do not override that repository switch.

The hosted hours writer needs `HOURS_REFRESH_CRON=1`,
`GOOGLE_PLACES_API_KEY`, `DATABASE_URL`, and `CRON_SECRET` in Vercel
Production. The local-search writer needs `RADIUS_SEARCH_CRON=1`,
`DATABASE_URL`, and `CRON_SECRET`. Full-text search is the required baseline;
`OPENAI_API_KEY` is optional and adds semantic vectors when present. Vercel
OIDC and AI Gateway can authenticate Ask Radius text generation, but do not
provide embedding support for this writer. Its optional
`RADIUS_SEARCH_CRON_BATCH` is clamped to 1–512 documents per run and defaults
to 256.

The Visit Frederick snapshot route is prepared but dormant. Do not add it to
`vercel.json` or set `VISIT_FREDERICK_FACTS_REUSE_APPROVED=1` until written
permission for factual reuse is documented. Once that approval exists, the
worker needs `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`, `CRON_SECRET`,
`FIRECRAWL_API_KEY`, and `FIRECRAWL_FETCH_FALLBACK=1` in Vercel Production.
Firecrawl remains a recovery path, not the normal source: an activated worker
tries the publisher RSS first and has a code-level ceiling of 12 app-side
recovery attempts per Eastern day. Those attempts are not a promise about how
many provider credits Firecrawl will charge.

> Treat every key as production: scope it to the minimum needed, never
> echo it in logs, and rotate it if a workflow run ever exposes it.
