# Frederick Radius control plane

## Decision

Radius uses one owner-facing exception stream. Vercel owns live, idempotent
product work. GitHub Actions owns reviewed code and data changes. A scheduled
run is justified only when a missed run would materially harm a visitor or
data-trust promise before the next owner review.

## What runs automatically

| Need | Owner | Reason |
| --- | --- | --- |
| Live cache, source health, search indexing, public notifications, and bounded provider refreshes | Vercel cron | They affect the running product and already have runtime budgets, database state, and Sentry check-ins. |
| Code quality and editorial checks | GitHub Actions on PR/main | They are release gates, not recurring maintenance. |
| Production alias verification | GitHub deployment status | It runs only when a deployment actually changes production. |
| Reviewed data proposals | GitHub Actions | Four inventoried generators currently target the live NAS runner; their write-scoped publication and checks remain on isolated GitHub-hosted reusable workflows. |

## What is dispatch-only

The UX audit, discovery dry run, Google enrichment, performance budget, and
commerce-link refresh are dispatch-only. Start one only when its output has a
named owner and an immediate review decision. They remain capped and preserve
their existing safety checks.

## NAS handoff status

The `radius-data-nas` repository runner is registered, online, and idle as of
the verified 2026-09-03 snapshot. The earlier not-live statement in this file
was stale. Treat that runner as an active execution path until an administrator
stops it in DSM.

The tracked replacement in `ops/nas-runner` is a migration target, not evidence
of deployed protection. It removes default runner labels, gives only a local
destination-filtering proxy an uplink, mounts registration identity read-only
for the listener, keeps job state in separately purged scratch, and accepts one
job per listener/container cycle. Cut over through a fresh v2 registration
using the lockout-safe sequence in `ops/nas-runner/README.md`. Keep the old
runner offline but registered until the new runner passes its manual MARC,
network-denial, label, token-removal, and two-cycle cleanup checks. Never run
two containers with one identity. A quota-backed scratch surface and bounded
fill test are also required before unattended work; the repository cannot
enforce a portable named-volume quota by itself. Vercel remains the owner of
live database refreshes throughout this transition.

## One exception stream

The owner brief is the routine reading surface. Slack is only for red states:

- public route, database, or scheduled-job failure;
- a health gate or source freshness state that is degraded;
- a configured provider cap nearing or reaching its limit; or
- a production deployment that does not serve its expected revision.

No green messages, routine counts, or duplicate alerts belong in Slack. The
current data-health alert helper suppresses an unchanged anomaly fingerprint
for six hours. Slack setup is an owner action because it creates a webhook
secret; add it only as `SLACK_WEBHOOK_URL` in Vercel Production.

## Required account checks

Sentry, the production search cron, and provider caps are configured in
Vercel. Confirm them after each deployment through their actual runtime
signals, not merely by the environment-variable names. Plausible Starter
continues to collect cookieless analytics, but its dashboard remains the
source of visitor and acquisition totals until a deliberate paid API upgrade.

## Re-enable rule for GitHub Actions

Keep the required hosted release gates enabled. Do not add another NAS-targeted
job unless the all-workflow runner inventory test, deployed network-denial
checks, and one-job cleanup proof still pass. Review runner load and artifact
usage after one billing cycle. Any additional schedule must document the
visitor or data-trust consequence of being absent, its maximum provider spend,
and the person who will review its output.
