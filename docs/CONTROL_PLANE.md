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
| Reviewed data proposals | GitHub Actions | The existing daily proposal workflows remain until the NAS runner is authenticated, limited to a dedicated label, and shown to open the same review PR safely. |
| Independent production health | NAS Task Scheduler after owner setup, plus GitHub Actions | After merge and NAS acceptance, the NAS can parse the public health contract every five minutes. The daily GitHub check remains an independent off-site backstop. |

## What is dispatch-only

The UX audit, discovery dry run, Google enrichment, performance budget, and
commerce-link refresh are dispatch-only. Start one only when its output has a
named owner and an immediate review decision. They remain capped and preserve
their existing safety checks.

## NAS handoff status

The NAS is intended to take the routine, review-gated proposal jobs off hosted
GitHub runners. Its protected storage, staged source, pinned runner image, and
pre-live checks are prepared, but the handoff is **not live yet**: Container
Manager has no runner project and GitHub has no registered self-hosted runner.
Create the project only from the exact reviewed merge, register it with a
one-hour repository runner token, clear that token after the first start, and
accept the handoff only after the capped runner completes one manual MARC
pilot and returns online after a restart. Vercel remains the owner of live
database refreshes throughout this transition.

The reviewed monitor code does not create or enable a DSM task. After this
change is merged and the NAS checkout is updated, an administrator can follow
`ops/nas-runner/README.md` to create the low-privilege task and complete a
healthy, controlled-failure, and recovery acceptance check. The monitor has no
production credential and performs no production write. It confirms an
incident after two unhealthy contract responses, repeats at most once every six
hours, and treats the intentional Google-hours policy hold as operational only
when the rest of the public readiness contract remains healthy.

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

The NAS monitor may use the same exception channel, but its webhook stays in a
permission-limited NAS environment outside the repository. A Slack failure does
not become silence: only a due transition or six-hour reminder exits nonzero so
DSM can take over without creating routine noise. The NAS and GitHub monitors
do not suppress one another.

## Required account checks

Sentry, the production search cron, and provider caps are configured in
Vercel. Confirm them after each deployment through their actual runtime
signals, not merely by the environment-variable names. Plausible Starter
continues to collect cookieless analytics, but its dashboard remains the
source of visitor and acquisition totals until a deliberate paid API upgrade.

## Re-enable rule for GitHub Actions

Keep the required hosted release gates enabled until the separate just-in-time
CI controller passes its security and one-job cleanup proof. Review runner
minutes and artifact usage after one billing cycle before adding a scheduled
workflow back. A workflow must document the visitor or data-trust consequence
of being absent, its maximum provider spend, and the person who will review
its output.
