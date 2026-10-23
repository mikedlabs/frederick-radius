# GitHub operations

The repository uses a small protected path from reviewed code to production.

## Pull-request gates

- `ci.yml` runs type, lint, data, unit, build, release-browser, and dependency-chaos checks from one shared production build on each PR.
- `style.yml` enforces the public editorial rules.
- `ux-audit.yml` runs the broader browser audit when an owner explicitly dispatches it.

Vercel owns the post-merge build and deployment from `main`. GitHub does not
rebuild that same reviewed commit a second time. The deployment-status canary
runs once for each Production promotion; the daily health alert is the single
external uptime backstop.

`main` requires `verify` and `style-lint`. Do not bypass those contexts.
Automated data PRs use eligible native `pull_request` jobs. The isolated
`automated-pr-checks.yml` caller loads the current protected-main helper, validates
the exact same-repository PR/main/head/merge/path identity and approves only its
existing held CI/style runs. It observes running/completed runs without reruns.
Uncertain or failed approval is held with a durable receipt and exact run IDs;
a GitHub owner may need to approve those native runs manually on HTTP 403.
There is no dispatch or copied-check fallback, new credential or ruleset change.

Before checkout or npm, native CI uses the same protected-main policy to decide
whether the exact allowlisted PR qualifies for artifact-focused verification.
Code PRs and workflow dispatches keep all full application gates. Recognized
publisher bot PRs with uncertain bootstrap/API/current-main evidence fail
preflight and stay held; a full build does not grant data publication authority.
The data-only job repeats current-main/PR proof after its artifact gates so
movement during execution remains held. The focused gate checks the release manifest, county/data contracts, source
registry, size budget, transit and data tests. Vercel still builds after merge.
Starting tests never accepts source facts or expands existing auto-merge policy.

The historical status bridge retains explicit manual attach/stale-failure
recovery and receipt tests, without an automatic caller or reconciliation
schedule. Synthetic check attachment did not establish ruleset eligibility.
The native path is unproven until a genuine eligible data-only protected merge
succeeds, followed separately by the exact ready production deployment.

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
