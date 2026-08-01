# GitHub operations

The repository uses a small protected path from reviewed code to production.

## Pull-request gates

- `ci.yml` runs type, lint, data, unit, build, release-browser, and dependency-chaos checks.
- `style.yml` enforces the public editorial rules.
- `ux-audit.yml` runs the broader nightly browser audit in bounded production-build shards.

`main` requires `verify`, `Required browser chaos`, and `style-lint`. Do not
bypass those contexts. Automated data PRs dispatch the same secret-free gates;
`automated-pr-status-bridge.yml` validates the bot branch and copies the real
job conclusions to the merge revision evaluated by the ruleset.

## Data automation

Scheduled data workflows fetch or generate in read-only jobs, upload exact
artifacts, and call `publish-automated-pr.yml` inside a narrow write boundary.
Generated changes always remain review PRs. `publish-data-snapshot.yml` is the
equivalent boundary for the separate `data-snapshots` branch.

Paid or experimental collectors stay manual until their source quality and
spend controls are proven:

- `apify-venue-pilot.yml`
- `source-intelligence.yml`
- `enrich-places.yml`
- `photo-attribution-backfill.yml`

## Environments

- `Data Enrichment`: main-only model-backed data jobs.
- `APIFY_TOKEN`: main-only Apify pilot credential. Rename this environment to a
  purpose-based name only when its encrypted secret can be moved safely.
- `Production`: main-only source-intelligence credentials.

Secrets are never printed, copied into artifacts, or made available to PR code.
One-off agent patch workflows must be disabled after their work is complete and
must not become permanent repository automation.
