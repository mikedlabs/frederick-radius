# Apify source change radar

The source change radar watches three exact first-party venue pages that the
manual Apify pilot proved retrievable. It is a private review queue, not an
event scraper and not a publishing path.

It records compact fingerprints and source-health evidence only. It never
stores publisher prose, HTML, images, social posts, or captions. It never edits
`src/data`, the database, or a public page.

## Proven launch scope

The exact URLs remain owned by `config/apify-venue-pilot.json`; the radar
references their ids from `config/apify-source-change-radar.json` so a second
URL allowlist cannot drift.

| Source                       | Pilot result    | Useful private signals                                   |    Observed provider cost |
| ---------------------------- | --------------- | -------------------------------------------------------- | ------------------------: |
| Weinberg Center performances | succeeded       | 15 date mentions, 15 time mentions, 1 event-like link    |             about $0.0104 |
| Sky Stage calendar           | succeeded       | 1 date mention, 54 time mentions, no useful event link   |             about $0.0062 |
| JoJo's events                | succeeded twice | 89 date mentions, 26 time mentions, no useful event link | about $0.0065 and $0.0078 |

The two JoJo's runs were about three minutes apart and produced the same
content hash, text length, and date/time counts. That is the initial evidence
for unchanged-skip behavior. Four pilot requests cost about $0.0309 total.

These results do not prove that any event is true. They only show that Apify
can return stable text from the reviewed publisher pages.

## Change policy

Each observation contains:

- the fixed Actor id, exact source URL, collection time, and town;
- a normalized full-content hash and content length;
- separate hashes and counts for date, time, and same-host event-link signals;
- a confidence value and parsing warnings;
- the exact final URL and provider run ids in the private artifact; and
- a check against `config/venue-sources.json` and committed
  `src/data/venue-events.json` records for the same venue and exact source.

Confidence measures the strength of the **review alert**, not confidence that
an event exists:

- `high`: a date or time fingerprint changed;
- `medium`: an event-link signal or same-host redirect needs review;
- `low`: a first baseline, a provider failure, or content-only drift.

The radar classifies results this way:

- `baseline`: store the first private fingerprint without opening an issue;
- `unchanged`: all fingerprints match, so the issue step is skipped;
- `cosmetic`: only the full-content hash changed while date, time, and event
  link hashes stayed the same;
- `changed`: at least one schedule signal changed; and
- `error`: retrieval, final-host, response, or cost validation failed.

One cosmetic result stays quiet. Two consecutive content-only changes are
configurable as a low-confidence review warning. A same-host redirect is also
actionable. If a reviewed source id moves to a different exact URL, the old
page fingerprint is never compared with the new page: the radar stores a fresh
baseline and opens a `source-url-changed` review warning. A cross-host redirect
is rejected as an error. A retrieval error breaks any cosmetic-change streak,
so changes separated by a failure are not treated as consecutive.

Warnings such as `no-date-signals`, `no-time-signals`,
`no-event-link-signals`, `same-host-redirect`, and
`provider-usage-unreported` are structured labels. No source text is copied
into the summary or GitHub issue.

## Spend and scope controls

One live radar run:

- checks at most three reviewed pages;
- makes one depth-zero, one-result Actor request per page;
- passes Apify `maxTotalChargeUsd: 0.05` for each provider request;
- reserves at most $0.15 before the first request;
- permits at most six runs and $0.90 of reserved ceiling per UTC month;
- persists completed observations after every source; and
- runs under one non-overlapping GitHub concurrency group.

The provider parameter is the hard per-request ceiling. The local run and
monthly gates refuse work before a request. The GitHub workflow also derives a
durable monthly reservation floor from this workflow's own run history. Live
runs, whether scheduled or manually dispatched, have a fixed `(live)` run name; reruns
count through GitHub's `run_attempt`, and the current attempt must already be
present in paginated run history before the secret is exposed. Missing or
uncertain history fails closed. The CLI reconciles cached budget upward from
that floor, so an interrupted runner cannot erase a reservation by failing to
save its cache.

The private cache is still used for fingerprints. Cache keys include both the
run id and attempt so a rerun can save a new immutable entry; prefix restore
selects the newest retained entry. Observation state is saved only after the
review-queue step succeeds. If issue delivery fails, the old fingerprint stays
authoritative so the signal is retried rather than disappearing as unchanged;
the run-history floor still preserves that attempt's budget reservation.
GitHub caches can be evicted, so the workflow still refuses a missing
fingerprint state unless initialization is explicit.
An operator must verify current Apify usage before deliberately initializing a
new fingerprint ledger. Deleting workflow history or the cache is an operator
action that requires the same account-side reconciliation. Keep an Apify
account spending limit in place as the authoritative account-wide backstop.

The August 2026 account review found an active $5 monthly platform limit,
roughly $0.03 used, no provider-side Apify schedules, and four saved tasks. Do **not** reuse
the legacy `Downtown Frederick App` task: it targets three whole sites, has an
unlimited maximum cost, and previously ran for nearly two hours before being
aborted. The radar starts the locked one-page Actor input in code instead.

## GitHub schedule and launch gate

`.github/workflows/apify-source-change-radar.yml` uses the existing dedicated
GitHub environment named `APIFY_TOKEN` and its `APIFY_TOKEN` secret. Do not move
the secret into `Data Enrichment` or expose it to Vercel visitor routes.

Following the accepted launch proof below, GitHub runs the radar at 15:17 UTC on
the 5th, 15th, and 25th of each month (`17 15 5,15,25 * *`). Three automatic
attempts reserve at most $0.45, leaving three of the six monthly attempts and
$0.45 of reservation headroom for an intentional proof, rerun, or recovery.
Keep orchestration in GitHub; do not create an Apify-side schedule.

Issue #1467 held the schedule until the baseline and unchanged proofs succeeded
on `main`. The accepted proof sequence was:

1. Run the workflow on `main` with `confirm_live` off. Confirm the three exact
   URLs and $0.15 ceiling in the plan.
2. Check current Apify account usage and its spending limit.
3. Run once with `confirm_live` and `initialize_state` on. This stores private
   baselines and should not open a change issue.
4. Run again with `confirm_live` on and `initialize_state` off. Stable pages
   should report `unchanged` and skip the issue.
5. Review the private artifact, state-cache result, job summary, and issue-step
   log. Confirm that no publisher text appears anywhere.
6. Merge the scheduling change only after that evidence is reviewed. Scheduled
   runs always use the restored state with initialization off and fail closed
   if the private fingerprint cache is unavailable.

## Review queue lifecycle

The workflow has `actions: read`, `contents: read`, and `issues: write`. It can
create or comment on one marked review issue. It cannot commit, open a data pull
request, call a Radius publishing route, or update the database. Every
actionable signal carries a machine-readable 14-day expiry marker. A later
quiet run adds context but does **not** resolve or close an unexpired alert. A
reviewer must promote, reject, or correct it explicitly. On a quiet run at or
after the latest marked expiry, the workflow can close only the review queue as
expired with an audited comment; canonical Radius data is never changed. A
legacy issue without a valid expiry marker fails safe and remains open for a
human.

### Promote

Open the original first-party page and verify the specific event facts. Use the
existing venue ingestion and manual-review path to produce a normal candidate.
Before committing, deduplicate against official feeds and committed venue
events using at least normalized title, `starts_at`, and `venue_slug`. Retain
the direct publisher URL and collection time. A fingerprint or Apify run URL
is never a public citation.

### Reject

Reject and close the review item when the change is navigation, marketing copy,
an expired listing, a parsing artifact, a duplicate, or an unsupported claim.
Record the short reason in the review issue. Do not weaken the fingerprint rule
to force promotion.

### Expire

Do not act on an issue signal after its `expiresAt` time. Re-run the exact page
and verify it again. Closing an expired item does not change canonical data.

### Correct

If a reviewed event exposes an error in committed data, use the normal manual
correction and pull-request path. Preserve the direct source and explain the
correction. The radar must never overwrite a human correction or republish an
old provider snapshot.

## Social and rights boundary

Facebook, Instagram, X, Reddit, arbitrary URLs, discovered links, whole-domain
crawls, and user-selected Actors are out of scope. A social claim can only be a
lead; it cannot become a confirmed event without a direct attributable source.
Descriptions, artwork, captions, and media remain with their publisher.

Official Apify references:

- [Website Content Crawler](https://apify.com/apify/website-content-crawler/api)
- [Run Actor API](https://docs.apify.com/api/v2/actors-runs-post)
- [Actor permissions](https://docs.apify.com/actors/running/permissions)
