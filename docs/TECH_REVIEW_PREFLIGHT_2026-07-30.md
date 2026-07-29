# Frederick Radius technical review preflight

Prepared July 29, 2026 for the July 30 technical review.

## Release position

The current local work contains strong review material, but it is not yet a
releasable review build. It should not be merged or deployed as one unreviewed
batch.

**Decision:** no-go for merge or production deployment. It is acceptable for a
controlled technical review if the team is told which surfaces are local-only,
which production systems are degraded, and which test results are prior
evidence rather than a fresh release gate.

- Working branch: `codex/audit-map-today-20260728`
- Local branch is 6 commits behind `origin/main`
- The worktree contains a large set of overlapping changes from multiple work
  sessions
- GitHub Actions are currently blocked before their first step by an account
  billing or spending-limit issue
- The WLR concept exists locally at `/concept/wlr`; production still returns
  404 for that route
- Production is serving revision `a9ac5c3a0399` and is not serving the current
  local worktree

## Current production snapshot

Read-only checks on July 29 found:

- `/today`, `/map`, and `/events` return HTTP 200 without a beta code
- `/api/health` returns HTTP 200, but its JSON status is `degraded`
- The database is reachable
- 46 active sources are tracked: 21 current, 3 stale, 8 requiring attention,
  and 14 still unknown
- The most recent published source-health evidence was
  `2026-07-29T22:05:23Z`
- In the last 24 hours, two primary event-detail timeout clusters each logged
  16 occurrences
- A fresh probe of all 44 event-detail URLs linked from the production Events
  board returned HTTP 200, so the resolver problem is intermittent rather than
  a board-wide permanent failure
- Official City, County, Thurmont, and Mount Airy CivicEngage pulls most
  recently failed; Walkersville succeeded
- The FCPL and FCVFRA ingests completed partially because their geocode step
  hit a SQL syntax error around `norm_address`
- The Radius search refresh logged a storage-write failure and the production
  `radius_search_documents` table currently contains 0 documents
- The rolling hours table is healthy enough to contain 644 rows, all refreshed
  within the last seven days

The public health endpoint intentionally remains HTTP 200 for liveness even
when its JSON reports degraded readiness. Any monitor must parse the body.

## Prior local verification evidence

The current local worktree was checked again on July 29:

- Production build completed, including all 2,736 generated pages
- TypeScript and full ESLint completed without errors
- Full unit suite: 4,341 passed, 2 skipped
- Style audit: 830 files, 0 violations
- UX render, WCAG A/AA, and safe-interaction browser gate: 46 passed
- The browser gate exposed and then verified fixes for a WLR hydration
  mismatch and the first `/open-now` image's loading priority
- Source Intelligence focused suite: 54 passed
- Source registry, county-data, and migration audits passed
- `git diff --check` passed

This is meaningful local evidence, not final release proof. It predates branch
reconciliation, production database changes, and a working hosted CI run. The
full gate must run against the exact preview commit after those steps.

## Known release blockers

### 1. Fix event deep-link reliability

Production event detail requests are repeatedly exhausting their resolver
deadline. The local worktree contains a new durable event-identity/archive
path and narrower event lookups, but the supporting archive migration is not
installed and the local changes are not deployed.

Before the review:

1. Exercise several current live, ingested, recurring, and stale event URLs.
2. Confirm a slow live provider cannot turn a visible event into a 404 or error
   page.
3. Apply the archive migration only after reviewing it and the production
   backup/rollback path.
4. Re-run the event-detail browser journey against the exact preview build.

### 2. Restore GitHub Actions

Recent CI, UX, feed-health, data-refresh, and ingestion jobs all stop before
step one with this GitHub message:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

Resolve the account issue, then rerun CI and one scheduled data workflow before
merging. The hosted checks use Node 22; local verification used Node 25.6.

### 3. Reconcile with `main`

Bring the six remote commits into the working branch carefully. Do not use a
destructive reset. The current worktree has hundreds of edited and generated
files, so resolve conflicts by feature area and rerun the complete release gate
after reconciliation.

### 4. Restore source readiness

The site is live, but the source ledger is not review-ready while only 21 of 46
tracked sources are current.

- Investigate the 8 attention states and name an owner for each
- Classify the 14 unknown states as configured, intentionally dormant, or
  broken
- Repair the CivicEngage connection timeouts without converting a timeout into
  an empty-success state
- Repair the FCPL/FCVFRA geocode SQL error
- Keep the partial-feed notice visible until the sources recover

### 5. Rebuild Radius search

The production semantic/search document table is empty and the latest refresh
failed while removing retired documents. Fix the storage write path, run a
bounded rebuild, verify document counts and representative Frederick queries,
and keep the existing non-semantic fallback working throughout.

### 6. Protect `main`

`main` is not currently protected. After CI is running again, require the core
verification, browser UX, and style checks before merge.

GitHub currently reports no branch protection and no repository ruleset for
`main`. Do not treat a green local command as an enforceable release policy.

## Execution order

| Order | Workstream | Done when |
| --- | --- | --- |
| 1 | GitHub Actions | Billing is cleared and CI, UX, and one data workflow complete from a fresh commit. |
| 2 | Branch reconciliation | The current work is brought onto `origin/main` without losing either side, and the final diff is reviewable by feature area. |
| 3 | Database contract | Migrations `0035`, `0036`, `0038`, and `0039` are each approved, backed up, applied or deliberately deferred, and reflected in the ledger. Privacy effects for `0023` and `0032` are verified. |
| 4 | Event reliability | Current, recurring, stale, and ingested event links survive repeated preview checks without resolver timeouts or false 404s. |
| 5 | Radius search | The production index contains documents, a bounded refresh succeeds, representative Frederick queries pass, and the non-semantic fallback still works. |
| 6 | Source readiness | Attention and unknown sources have owners or intentional classifications; CivicEngage timeouts and the FCPL/FCVFRA geocode error are resolved or clearly disclosed. |
| 7 | Release safety | `main` requires the core CI and browser checks; the production canary and rollback credential are proven on a harmless test. |
| 8 | Exact-build review | Unit, type, lint, data, build, browser, accessibility, mobile hierarchy, and performance checks run against the exact preview commit. |

Do not make Firecrawl or Tavily part of the live Today, Map, Events, Search, or
Ask request path to satisfy this list. Their role is to produce bounded,
review-only source candidates outside the user's visit.

## Known data limits

These are data-coverage constraints, not build failures:

- 20.8% of place hours meet the seven-day verification policy
- 74.3% of places have a stored schedule
- 94.7% can enter the Google refresh cycle
- 84.8% have a publishable card photo
- 9.2% have unique, decision-useful Radius copy

The interface must continue to distinguish unknown from closed and avoid
presenting thin coverage as a statement about reality.

## Database follow-up

- Production has the rolling-hours read-only migration and the PostGIS spatial
  migration recorded
- Production does not currently contain the native-menu tables, event identity
  archive, or feed-source-health rollup table from local migrations `0035`,
  `0036`, `0038`, and `0039`
- Do not blindly apply those migrations; review each independently, take a
  backup, verify grants/RLS, and test rollback
- Review the absent effects associated with `0023` and `0032`
- `feed_snapshots` needs backup-aware retention work
- `radius_search_documents` currently has no rows
- Custom SMTP remains unconfigured and requires explicit approval before a
  Resend credential is created or shared with Supabase

Supabase's current security advisor reports informational
`rls_enabled_no_policy` findings for a number of intentionally server-only
tables. RLS with no policy is deny-all, not a public-data leak. Before the
review, document which tables are deliberately server-only and test the actual
`anon` and `authenticated` grants instead of adding permissive policies merely
to silence the advisor.

The current performance advisor also reports unused indexes. Do not delete
recent or low-traffic indexes solely from that signal; compare query plans and
usage after the review load.

Migration `0023` is a privacy follow-up, not ordinary cleanup: until its effect
is verified, legacy beta-signup alert bodies may still contain email
addresses. Migration `0032` is default-privilege hardening. Both need an
explicit production-state check before the technical review.

## Source Intelligence status

The local worktree now contains candidate-only Firecrawl and Tavily tooling:

- Source Watch checks an exact first-party/government allowlist for changes
- Source Scout performs capped discovery searches for known source gaps
- Both write only ignored operator reports
- Neither changes canonical data or public answers
- Tavily/Firecrawl OAuth connections are available interactively in Codex
- Unattended scripts still require fresh server-side API keys

Do not schedule broad runs before cost caps, redirect provenance, and one small
manual pilot have been reviewed. The Tavily key previously pasted into chat
must be revoked rather than reused.

## Suggested review route

1. `/today`
2. `/map`
3. `/events`
4. `/ask`
5. `/pulse`
6. `/compass`
7. `/food-trucks`
8. `/beer`
9. `/concept/wlr`
10. `/api/health`

For each surface, review the same five questions:

1. Is the first useful action obvious?
2. Does location materially improve the result?
3. Are freshness, source, and uncertainty represented honestly?
4. Can the primary task be completed on a narrow mobile viewport?
5. Does any control lead to a dead end, unexpected write, or off-site escape?

## WLR discussion boundary

The WLR page is a discussion concept, not a live sponsorship claim. It uses
officially listed Frederick locations, posted hours, directions, and phone
numbers. It intentionally does not claim live wait times, bay availability,
prices, sponsorship, or endorsement. Request WLR's approved logo, photography,
brand kit, and written media permission before adding their protected assets.
