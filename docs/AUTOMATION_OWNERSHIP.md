# Automation ownership

Frederick Radius uses three infrastructure services. They are not substitutes
for one another, and none of them should silently repeat another service's
work.

## The operating model

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Review code before merge | GitHub Actions | One full CI build per pull request. Superseded runs cancel. |
| Build and deploy `main` | Vercel | One deployment for the merged revision. GitHub does not rebuild it. |
| Run request-time code and live-store refreshes | Vercel | Known, idempotent routes with bounded runtime and provider budgets. |
| Store canonical operational state | Supabase | Tables, constraints, RLS, narrow RPCs, and durable source heartbeats. |
| Generate changes to tracked data | GitHub Actions | A bounded source job opens a review PR; it never publishes directly. |
| Check production from outside Vercel | GitHub Actions | One small daily health check, plus an event-driven post-deploy canary. |
| Observe scheduled-route completion | Sentry | Cron check-ins for routes using the shared monitor wrapper. |

Supabase is not a general CI runner. Vercel is not a review system. GitHub is
not the production scheduler. Moving every job into a different service would
add another migration and another place for failures to hide; the cleanup is
to give each existing service one job.

## Rules that stop repeat failures

1. A fact has one collector. The hours refresh owns Google hours and business
   status because one Place Details request returns both. The old status-only
   route is manual and unscheduled.
2. A merged revision is built once. GitHub verifies the PR; Vercel builds and
   deploys `main`.
3. A source is probed once on schedule. Its deployed collector writes a
   heartbeat. GitHub's deeper feed probe is manual.
4. Heavy browser sweeps are weekly. Core journeys remain in the PR release
   gate.
5. Local tests are read-only. Starting development or Playwright validates the
   promoted data release and cannot regenerate tracked JSON. Deliberate rebuild
   commands contain `refresh-data` in their name.
6. A disabled feature does not keep a high-frequency schedule. Dormant routes
   stay available for an explicit operator run without consuming invocations.
7. Every new schedule needs an owner, cadence, cost ceiling, failure signal,
   and removal condition in `docs/AGENTS_SCHEDULE.md`.
8. A merge to `main` is the production deployment request. Do not run a
   second manual production deployment for the same commit. Manual promotion
   or rollback is reserved for recovery and must name the immutable deployment
   being promoted.

`npm run audit:automation` enforces the current one-owner boundaries. The
existing cron-delivery budget separately prevents Vercel invocation growth.

## Current cleanup boundary

The current release removes duplicate execution without deleting product data:

- GitHub CI no longer repeats the post-merge Vercel build.
- The duplicate Google business-status schedule is removed.
- GitHub feed health becomes an operator diagnostic.
- The legacy `data-snapshots` refresh and freshness checker become operator
  diagnostics until production consumes that branch.
- The broad UX crawler runs weekly instead of daily.
- The production canary runs after a deployment, not six additional times a
  day.
- Superseded style checks cancel.

Database retention is separate. `feed_snapshots` has a safe bounded compactor
and a guarded 90-day retention route, but production deletion still requires a
current backup check and explicit activation. Do not turn that into an
unreviewed migration merely to make a dashboard number smaller.

## Next structural work

These are dedicated follow-up changes, not opportunistic edits inside a large
release:

1. Make the public event archive the single read model for Today, Events,
   event detail, ICS, venue events, search, and Ask.
2. Let source workflows emit small deltas, then use one place-promotion job to
   rebuild shared place artifacts once.
3. Version PostGIS and Radius search projections against the deployed data
   release before they can be called current.
4. Move non-runtime brand exports and review-only data out of the deployment
   bundle, preserving their generator sources and reviewed handoff copies.
5. Introduce a typed capability catalog so environment flags, schedules,
   monitoring, and the admin status view are generated from one definition.

The staged repository cleanup is tracked in `docs/REPOSITORY_CLEANUP_PLAN.md`.
It deliberately separates safe source cleanup from asset moves, data-loader
changes, worktree removal, and any destructive history rewrite.
