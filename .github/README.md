# GitHub operations

The repository uses a small protected path from reviewed code to production.

## Pull-request gates

- `ci.yml` runs type, lint, data, unit, build, release-browser, and dependency-chaos checks from one shared production build on each PR.
- `style.yml` enforces the public editorial rules.
- `ux-audit.yml` runs the broader browser audit nightly on the secret-free,
  trusted-main `radius-browser` NAS lane and when an owner explicitly
  dispatches it from `main`.

`performance-budget.yml` uses the same bounded browser lane for its daily
production measurement. `visual-contract.yml` uses that pinned Linux host only
when an owner dispatches a candidate capture or baseline comparison; it remains
unscheduled until reviewed baselines exist. Pull-request browser gates never
run on a persistent NAS runner.

Vercel owns the post-merge build and deployment from `main`. GitHub does not
rebuild that same reviewed commit a second time. The deployment-status canary
runs once for each Production promotion; the daily health alert is the single
external uptime backstop.

`main` requires `verify` and `style-lint`. Do not bypass those contexts.
Automated data PRs dispatch the same secret-free gates. After `verify` ends,
`automated-pr-status-bridge.yml` validates the bot branch and the exact paired
workflow run IDs, then copies the real job conclusions to the merge revision
evaluated by the ruleset. A six-hour, API-only reconciliation pass fails stale
missing statuses closed after a whole-workflow cancellation; it never turns a
missing check into success.

The automated `verify` path is intentionally artifact-specific. The publisher
and bridge both revalidate an exact allowlisted bot branch, then CI checks the
release manifest, county/data contracts, source registry, size budget, transit,
and data-focused tests. It does not pay for typecheck, the full application
build, Storybook, and browsers when no code or dependency can have changed.
Vercel still performs the post-merge production build and will retain the prior
healthy deployment if that build fails.

## Data automation

Scheduled data workflows fetch or generate in read-only jobs, upload exact
artifacts, and call `publish-automated-pr.yml` inside a narrow write boundary.
Generated changes always remain review PRs. `publish-data-snapshot.yml` is the
equivalent boundary for the separate `data-snapshots` branch.

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
