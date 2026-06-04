# Frederick Radius — Agents & Schedule

> The recurring jobs that keep the app's local data fresh and growing.
> Two engines run this work: **Vercel cron** for pure, deterministic data
> refreshes that write to the live store, and **GitHub Actions** for
> judgment calls and anything that should land through a reviewed PR. The
> rule of thumb: if a human should look at the diff before it ships, it
> runs on GitHub Actions; if it's a safe, idempotent refresh of a known
> source, it runs on Vercel cron.

**Last updated:** 2026-06-04

---

## The schedule

| Cadence | Job | What it does | Mechanism |
| --- | --- | --- | --- |
| Every 30 min | `notify-civic-alerts` | Pushes new civic alerts to subscribers. | Vercel cron (`/api/cron/notify-civic-alerts`) |
| Nightly 09:00 UTC | `ingest/all` | Full civic/venue/business ingest into the live store. | Vercel cron (`/api/ingest/all`) |
| Nightly 07:00 UTC | `business-status` | Refreshes open/closed + hours from Google Places. | Vercel cron (`/api/cron/business-status`) |
| Nightly 09:30 UTC | `data-health` | Server-side data freshness/health snapshot. | Vercel cron (`/api/cron/data-health`) |
| Daily 12:00/13:00 UTC | `daily-briefing` | Builds the daily briefing payload. | Vercel cron (`/api/cron/daily-briefing`) |
| Nightly 06:00 UTC | **data-steward** | Runs feed-health (informational), then `refresh:business-status`, `build:transit`, `build:park-amenities` (each `\|\| true`). Opens a PR on any change to committed data artifacts. | GitHub Actions (`.github/workflows/data-steward.yml`) |
| Daily 12:00 UTC | **feed-health** | Probes the critical external feeds and exits non-zero if any critical endpoint is down — the job goes red so you can alert. | GitHub Actions (`.github/workflows/feed-health.yml`) |
| Weekly Mon 07:00 UTC | **discovery** | `npm run discover` dry run ($0, no API call). Publishes the candidate count + cost projection to the job summary and an artifact. | GitHub Actions (`.github/workflows/discovery.yml`) |

All GitHub Actions jobs also expose `workflow_dispatch` for manual runs.
All cron times are UTC; Frederick County is US Eastern (UTC−5/−4), so a
06:00 UTC job lands around 1–2 AM local.

---

## Vercel cron vs GitHub Actions — which runs what, and why

**Vercel cron** (`vercel.json` → `crons`) runs the pure, deterministic
data work — the refreshes that read a known source and write straight to
the live store with no judgment required. These are idempotent and safe
to run unattended: `business-status` re-derives open/closed from Google
Places, `data-health` snapshots freshness, `ingest/all` pulls the civic
and venue feeds, and `notify-civic-alerts` fans out push notifications.
They live next to the app, run in the deployment's own runtime, and never
touch the repo.

**GitHub Actions** runs the work that needs a human in the loop or that
produces a *repo* artifact rather than a live-store write:

- **data-steward** regenerates committed data files (transit GTFS, park
  amenities, business status) and opens a **PR** so the data diff is
  reviewed before it merges. It never pushes straight to a content
  branch. Each refresh is guarded with `|| true` so one flaky upstream
  source can't abort the rest of the nightly run.
- **feed-health** is the tripwire: it has no `|| true`, so a dead
  critical feed fails the job and turns the workflow red. Wire a
  Slack/email alert on this workflow's failure if you want a page.
- **discovery** is judgment-gated by design. The dry run costs $0 and
  only prints the plan; a future Claude review step (see the TODO in the
  workflow) reads that plan and recommends which categories/towns are
  worth a live, cost-capped `--live --confirm` pass.

The dividing line: **pure data → Vercel cron; judgment or PR-gated →
GitHub Actions.**

---

## Secrets

GitHub Actions secrets are set in the repo: **Settings → Secrets and
variables → Actions → New repository secret**. Reference them in a
workflow with `${{ secrets.NAME }}` and pass them into a step via `env:`.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | data-steward (`refresh:business-status`), a live `discover` run | Google Places lookups for business status and place discovery. |
| `ANTHROPIC_API_KEY` | discovery (future Claude review step) | Lets Claude Code review the discovery plan and open a PR. |
| `BLOB_READ_WRITE_TOKEN` | any job that reads/writes Vercel Blob artifacts | Auth for `@vercel/blob` storage (photos, generated artifacts). |

Vercel cron routes read the same values from the Vercel project's
**Environment Variables** (Project → Settings → Environment Variables),
not from GitHub — set them in both places if a value is needed by both
engines. `GITHUB_TOKEN` is provided automatically to Actions and is what
the PR-opening step uses; no manual setup needed.

> Treat every key as production: scope it to the minimum needed, never
> echo it in logs, and rotate it if a workflow run ever exposes it.
