# GitHub operations

The repository uses a small protected path from reviewed code to production.

## Pull-request gates

- `ci.yml` runs type, lint, data, unit, one production build, release-browser,
  and dependency-chaos checks. The required chaos context mirrors that verified
  job instead of rebuilding the application a second time.
- `style.yml` enforces the public editorial rules.
- `ux-audit.yml` runs the broader nightly browser audit against one bounded
  production build.

`main` requires `verify`, `Required browser chaos`, and `style-lint`. Do not
bypass those contexts. Automated data PRs dispatch the same secret-free gates;
`automated-pr-status-bridge.yml` validates the bot branch and copies the real
job conclusions to the merge revision evaluated by the ruleset.

## Data automation

Scheduled data workflows fetch or generate in read-only jobs, upload exact
artifacts, and call `publish-automated-pr.yml` inside a narrow write boundary.
Generated changes always remain review PRs. `publish-data-snapshot.yml` is the
equivalent boundary for the separate `data-snapshots` branch.

Each generator attempt uses a fresh `bot/*/run-*` branch. Older candidates stay
open while the replacement is unproven; after the newest candidate passes all
three required CI and style contexts, the trusted status bridge closes older
same-family PRs. This keeps a failed new extraction from erasing a viable
review diff without leaving stale, conflicting bot PRs mergeable forever.

`data-automation-watchdog.yml` keeps one durable incident issue for scheduled
workflow availability. A failed run with jobs is a repository, configuration,
source, or test failure. A failed run with zero jobs means GitHub stopped before
checkout or any Radius code; inspect the run banner for Actions billing,
spending-limit, policy, or workflow-configuration problems before touching API
keys. When account-level Actions execution is blocked, no repository workflow
can alert in real time; the daily sweep reconciles the missed runs after Actions
becomes available again.

Paid or experimental collectors stay manual until their source quality and
spend controls are proven. Tavily Source Scout and the Apify radar now have
exact, budgeted schedules; neither can publish Radius data. Firecrawl Source
Watch remains manually dispatched until its County Connector baseline has a
live unchanged repeat. The workflow split is explicit:

- `source-intelligence.yml`: Tavily scheduled; Firecrawl manual.
- `apify-source-change-radar.yml`: scheduled three times monthly.
- `enrich-places.yml`: manual.
- `photo-attribution-backfill.yml`: manual.

## Environments

- `Data Enrichment`: main-only model-backed data jobs.
- `APIFY_TOKEN`: main-only credential for the private source change radar. The
  historical venue-pilot script remains available locally, but its GitHub
  workflow is retired. Rename this environment only when its encrypted secret
  can be moved safely.
- `Production`: main-only source-intelligence credentials.

Secrets are never printed, copied into artifacts, or made available to PR code.
One-off agent patch workflows must be disabled after their work is complete and
must not become permanent repository automation.
