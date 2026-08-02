# Radius Source Intelligence

Source Intelligence has two operator-only tools and one prepared, approval-
gated background recovery:

- **Source Watch** checks a small, reviewed list of exact public pages for meaningful changes. It uses `scripts/source-watch.ts`, the allowlist and cost policy in `config/source-watch.json`, and the REST adapter in `scripts/lib/firecrawl-rest.ts`.
- **Source Scout** searches for possible sources when Radius has a known data gap. It uses `scripts/source-scout.ts`, the profiles and limits in `config/source-scout.json`, and the REST adapter in `scripts/lib/tavily-search.ts`.
- **Visit Frederick recovery** is activation-ready for one fixed event RSS URL, but is deliberately unscheduled until written factual-reuse permission is documented. If activated, it tries the publisher feed directly first, reserves one of at most 12 app-side Firecrawl recovery attempts per Eastern day only after a safe transient failure, and writes a factual-only Blob snapshot.

The operator tools produce review evidence. They do not publish to the app,
edit canonical place or event data, or answer a user directly. The prepared
Visit Frederick recovery stays dormant and publishes nothing until approval is
documented. If activated, it may publish normalized event facts from the same
reviewed publisher feed, but never publisher prose or images.

## Which Radius problems they solve

| Radius problem                                                                                                            | Best tool                   | Safe outcome                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An official page is JavaScript-heavy, blocks a normal request, or produces unusable HTML                                  | Firecrawl fallback          | Retrieve one reviewed public page after native fetch and Playwright fail, while retaining requested/final URL provenance.                                     |
| Radius does not know the first-party source for a venue, menu, accessibility detail, food-truck schedule, or civic update | Tavily Source Scout         | Return a small, domain-constrained list of original publisher URLs for operator review.                                                                       |
| A known first-party page silently changes an event time, transit document, food-truck roster, or public notice            | Source Watch with Firecrawl | Record a bounded change candidate and content hash; a person verifies the original page before any data change.                                               |
| A curated business may have closed or moved                                                                               | Tavily closure detector     | Produce a review queue with supporting source URLs. It never edits the closure registry.                                                                      |
| A normal event or civic ingestion page fails after the native and rendered paths are exhausted                            | Firecrawl fallback          | Recover a candidate snapshot offline without adding provider latency to a user's visit.                                                                       |
| Radius lacks useful local facts for original decision copy                                                                | Both, in sequence           | Tavily finds the first-party source; Firecrawl can retrieve it; a reviewer records facts and Radius writes original copy rather than copying publisher prose. |

They do **not** repair GitHub Actions billing, reconcile a dirty branch, apply
database migrations, repopulate `radius_search_documents`, eliminate a
resolver timeout, or prove that a business is open now. Those are separate
code, database, or operational jobs.

## Source hierarchy

Use the strongest available source and stop when it is sufficient:

1. Prefer a structured, authoritative source such as an official API, GIS service, RSS feed, iCal feed, GTFS feed, or publisher-supplied identifier.
2. Use an official government, organizer, venue, or business page when no structured source exists.
3. Use an approved partner feed or a reliable local publisher to corroborate a change.
4. Treat Tavily results, search snippets, directories, community posts, and other discovered pages as leads. They are not proof.

Firecrawl is a retrieval provider, not an authority. Tavily's score measures search relevance, not factual confidence. The public citation is always the original publisher URL, never a Firecrawl or Tavily endpoint.

## What must never auto-publish

Source Watch and Source Scout must not automatically:

- mark a business open, closed, moved, or temporarily closed;
- assert current hours or power an "open now" label;
- cancel, postpone, reschedule, or retime an event;
- change emergency, weather, traffic, public-safety, school, utility, or civic instructions;
- publish menu prices, item availability, dietary claims, accessibility claims, or other decision-sensitive details;
- add or remove a place, event, amenity, source, description, photo, or logo;
- copy marketing prose, images, social posts, or other material without a valid reuse basis; or
- change ranking, sponsorship, or recommendation behavior.

A failed fetch, an empty page, or a missing search result is not evidence that something was removed. Existing data remains untouched until a person verifies the change.

## Required provenance

Every proposed field change must retain:

- the canonical Radius entity and field name;
- the proposed value and prior value;
- the original publisher URL and source type;
- the requested URL and final URL after redirects;
- the retrieval provider, observation time, content hash, and last meaningful change time;
- a short supporting excerpt or deterministic page location;
- the extraction or normalization version;
- the license or reuse basis;
- the confidence level; and
- the review status, reviewer, and review time.

For Source Scout, also retain the query, Tavily request ID when available, relevance score, and reported credit use. Those values describe discovery only. They do not raise the source's trust level. Tavily result content is transient: the Scout strips content snippets before writing either its report or reusable cache. Reviewers follow the original URL instead of treating a search excerpt as evidence.

Do not commit full downloaded pages or provider responses to the application data files. Operator reports and observation state stay under the gitignored `scripts/reports/` area.

## Operator workflow

### Source Watch

1. Add or edit only reviewed public URLs in `config/source-watch.json`. The script intentionally has no arbitrary URL command-line override.
2. Review the configured per-run and monthly limits.
3. Preview one exact allowlisted source for no provider cost:

   ```sh
   npm run source:watch -- --source=weinberg-performances
   ```

4. After reviewing the plan, run the one-source pilot:

   ```sh
   npm run source:watch -- --live --confirm --source=weinberg-performances
   ```

5. Inspect the candidate observations and timestamped report under `scripts/reports/source-watch/`.
6. Confirm the entity identity, read the original page, and check whether another authoritative source agrees.
7. Move an accepted fact through the existing Radius review path and open a normal data PR. Run the relevant provenance, copy, data-quality, and application tests before merging.

Source Watch plans by default. A live run requires both `--live` and
`--confirm`. `--source` accepts only ids already present in the reviewed
allowlist; it cannot accept an arbitrary URL. Source Watch checks exact pages
only. Do not turn it into a broad domain crawl or use Firecrawl Map/Crawl as an
unattended shortcut.

Source URLs are HTTPS by default and must resolve to public targets. Localhost,
private, link-local, and reserved network addresses are rejected. A source that
truly has no HTTPS endpoint needs a documented `httpException` with a reviewer
and reason in the tracked allowlist. Source Watch stores the requested and final
URL separately and rejects an unexpected cross-host redirect. Its run lock also
stores a PID and timestamp, so an abandoned lock can recover after 30 minutes
without allowing two healthy runs to overlap.

The manual GitHub pilot keeps one stable review issue per Source Watch source
id. Ordinary first baselines remain visible in the workflow evidence without
opening an alert. A changed, removed, or failed page opens or updates only that
source's issue. If a reviewed id moves to a different exact URL, the old hash is
discarded and the new page becomes an actionable fresh baseline; unrelated page
hashes are never compared. The queue stores only the source id, exact public
URL, timestamps, hashes, counts, status, expiry, and workflow link. It stores no
publisher prose, page diff, HTML, image, or extracted event. A quiet run leaves
an unresolved alert open until its 14-day expiry, then can close only that issue
with an audited `not_planned` comment. Fingerprint state is cached only after the
issue step succeeds, so a delivery failure retries the same signal.

### Source Scout

1. Keep queries, allowed domains, search depth, result count, and credit caps in `config/source-scout.json`.
2. Preview the plan for no provider cost:

   ```sh
   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts
   ```

3. Run one configured profile when possible:

   ```sh
   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts -- --profile <id> --live --confirm
   ```

4. Use the dedicated one-request profile when verifying a new key or provider
   response:

   ```sh
   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts -- --profile provider-smoke --live --confirm
   ```

5. A deliberately approved full capped run is:

   ```sh
   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts -- --live --confirm
   ```

6. Review `scripts/reports/source-scout-latest.json`. The reusable provider cache is `scripts/reports/source-scout-cache.json`. Neither artifact retains Tavily content snippets.
7. Reject directories, copied pages, wrong-location matches, old articles, and unsupported snippets. Add a promising exact source to the appropriate Radius registry or to Source Watch for verification.

Source Scout never writes to `src/data`. A search result becomes useful only after Radius verifies the original source and matches it to the correct canonical entity.

GitHub live runs also maintain one bot-owned `source-scout-review` issue per
profile/query. The queue retains only IDs, timestamps, public candidate URLs
and domains, scores, a URL-set fingerprint, bounded request/credit/error
metadata, and workflow evidence. It does not retain search snippets, query
prose, result titles, raw responses, or canonical records. A new URL set or a
provider error opens or reopens the issue. An unchanged fingerprint preserves
the human's open or closed decision; cache hits, budget skips, and quiet runs
cannot erase it. Only a fresh fetched result with no candidates may close an
unresolved issue after its 30-day review window. The workflow clears each
transient issue signal before the matching live step and will not process a
signal unless that current provider step actually ran.

A live Scout run takes an exclusive lock at `scripts/reports/source-scout.lock`. An active lock blocks a second run; an expired lock can be recovered after the configured stale window. Before every provider request, the Scout reserves the estimated credit in `scripts/reports/source-scout-usage.json`. That UTC daily/monthly ledger counts failed attempts as well as successful ones, so repeated or overlapping runs cannot bypass the tracked caps. The plan command does not acquire the lock, touch the ledger, call Tavily, or write files.

## Cost controls

The tracked configuration files are the authority for budgets:

- `config/source-watch.json` owns the exact URL allowlist and Firecrawl per-run and monthly limits.
- `config/source-scout.json` owns Tavily profiles, allowed domains, search depth, maximum results, per-run credit limits, UTC daily/monthly attempted-credit limits, and the stale-lock window.

Keep Firecrawl to one exact-page scrape per configured observation. Keep Tavily searches narrow and use cached results before spending another credit. Stop with a partial report when a limit is reached. Do not add an environment variable or command-line option that silently raises a tracked cap.

The GitHub pilot also treats workflow history as a durable reservation ledger,
so a deleted cache or interrupted runner cannot erase attempted spend. Each
Tavily live workflow reserves 12 credits against limits of 24 per UTC day and
300 per UTC month. A Firecrawl live workflow selects exactly one configured
page, so it reserves one credit against limits of two per UTC day and 30 per
UTC month. That permits a controlled baseline-and-repeat proof while keeping
routine spend small. Reruns and unsuccessful attempts count. Unknown or
malformed recent history fails closed before either provider secret is exposed.
The provider dashboards remain the final billing record.

The shared operator extraction engine uses native fetch or Playwright first.
Firecrawl is an opt-in fallback only when native retrieval fails. Its recovery
request always asks for a fresh page (`maxAge=0`), disables provider cache
storage, and fixes the proxy to `basic` so one reservation cannot silently turn
into an enhanced scrape.

Fallback activation is independent for each ingestion workflow:

- venues use `VENUE_FIRECRAWL_FETCH_FALLBACK` and
  `VENUE_FIRECRAWL_FALLBACK_MAX_REQUESTS`;
- business details use `BUSINESS_FIRECRAWL_FETCH_FALLBACK` and
  `BUSINESS_FIRECRAWL_FALLBACK_MAX_REQUESTS`; and
- civic sources use `CIVIC_FIRECRAWL_FETCH_FALLBACK` and
  `CIVIC_FIRECRAWL_FALLBACK_MAX_REQUESTS`.

Each enable flag defaults to `0`; each request cap defaults to `1` and the
workflow rejects a value above `2`. These six controls must be **repository
variables**, not `Data Enrichment` environment variables. GitHub resolves the
repository values into the durable run title and the cross-workflow concurrency
lock before a runner starts. The step-level value must match that recorded
title; an environment-level override therefore fails closed instead of
silently escaping the shared ledger. `FIRECRAWL_API_KEY` remains an environment
secret.

The venue, business, and civic workflows share one durable Firecrawl fallback
reservation ledger. Paginated main-branch history for all three workflow files
counts the configured one- or two-request cap for every enabled attempt,
including failed and rerun attempts. Disabled runs reserve zero. The combined
ceiling is two requests per UTC day and 30 per UTC month, and enabled runs share
one concurrency group so two workflows cannot pass the gate at the same time.
Missing current-run evidence, a title/config mismatch, malformed history, an
unclassified current-month run, or an unavailable history endpoint stops the
job before the Firecrawl secret is exposed. The extractor also defaults to one
fallback request and has an absolute per-process maximum of two.

Before the first enabled fallback proof, set the repository variable
`FIRECRAWL_LEGACY_DISABLED_RUN_IDS` to the comma-separated IDs of the exact
current-month legacy runs audited with the old global fallback flag off. Only a
listed first attempt with the exact old workflow title reserves zero. An
unlisted static title, a legacy rerun, malformed IDs, or more than 100 migration
IDs fails closed. This one-time explicit ledger avoids a date cutoff becoming
stale while the change is awaiting deployment. Venue and municipal runs print
an aggregate fallback usage summary.

- Cross-host Firecrawl redirects are rejected unless the source registry names
  the exact reviewed destination host.

Both `requestedUrl` and `finalUrl` are retained on refreshed venue and civic
source records. The API key is never included in the usage summary or source
data.

The separate Visit Frederick route is not controlled by the operator per-
process limit. It is activation-ready but must remain unscheduled while the
source ledger says `pending_approval` and
`VISIT_FREDERICK_FACTS_REUSE_APPROVED=0`. Its code accepts no URL input and,
if approved and activated, requests only
`https://www.visitfrederick.org/event/rss/`, requires the provider to report
that exact reviewed HTTPS destination, disables provider cache reuse and TLS
skipping, and reserves an atomic database counter before each paid attempt.
The ceiling is 12 app-side recovery attempts per Eastern day and cannot be
raised with an environment variable. This counter is not a provider-credit
meter; Firecrawl's dashboard remains the billing authority. Public routes read
the resulting bounded Blob snapshot only after activation; they never call
Visit Frederick or Firecrawl.

The separate closure detector remains review-only. Its ordinary
`npm run closures:detect` command is a zero-cost plan, even when a Tavily key
exists. A provider request requires the operator to add both `--live` and
`--confirm`. `--limit` accepts only a positive whole number no higher than the
hard 10-request run ceiling. Long-tail selection separately requires both
`--all` and `--confirm-all`; neither confirmation can raise the immutable
10-credit run, 20-credit UTC-day, or 100-credit UTC-month ceilings. The script
holds an exclusive fail-closed run lock, records each attempt in
`scripts/reports/closure-usage.json` before making the request, counts failed
attempts, reuses cached raw results, and stops on authentication, rate, plan,
or billing errors. Add `--refresh` to the zero-cost plan to preview a fresh
search of cached places, then repeat it with `--live --confirm` only when that
spend is intentional. Tavily is fixed to basic search, so the app reserves one
credit before each request and records provider-reported credits separately;
the provider dashboard remains the billing authority. The review report never
changes public place data.

If a local process is interrupted and leaves `closure-detector.lock`, verify
that no detector is still running before removing the lock manually. The tool
does not auto-expire locks because a second paid run is riskier than a stale
local lock.

Neither provider belongs in the request path for Today, Search, Map, Events, or Ask Radius. Scheduled or operator runs must not add latency or provider cost to a user's visit.

## Secrets and connections

The unattended REST tools use:

- `FIRECRAWL_API_KEY` for `scripts/lib/firecrawl-rest.ts`;
- `TAVILY_API_KEY` for `scripts/lib/tavily-search.ts`.

For local use, place keys in `.env.local`. Never commit them, print them, place
them in client code, or prefix them with `NEXT_PUBLIC_`. For the manual GitHub
pilot, add both keys as secrets in the repository's `Production` environment.
The three ingestion fallbacks read `FIRECRAWL_API_KEY` from the separate
`Data Enrichment` environment; copy the secret there without printing it only
when an individual fallback is ready for proof.
`TAVILY_API_KEY` does not belong in Vercel. A Vercel `FIRECRAWL_API_KEY` does
not activate Visit Frederick collection by itself. The fixed-URL route remains
unscheduled and `VISIT_FREDERICK_FACTS_REUSE_APPROVED` remains `0` until
written permission is documented; no provider key is ever available to client
code or a visitor request path.

An OAuth-backed MCP connection is different. It represents an interactive user's consent inside Codex or another connected client. A scheduled GitHub Action cannot borrow that session, and an OAuth cookie or token must never be copied into the repository. Unattended Source Watch and Source Scout runs require their provider API keys.

## Rollout

The manual workflow is `.github/workflows/source-intelligence.yml`. It has
read-only contents permission plus narrowly scoped issue-write permission. It
never commits or publishes, uploads compact review reports for 14 days, keeps
one stable issue per watched source, and persists only the provider cache,
attempted-credit ledger, and Firecrawl comparison hashes between runs.

1. Revoke any provider key previously pasted into chat, logs, or a URL.
2. Add fresh `TAVILY_API_KEY` and `FIRECRAWL_API_KEY` secrets to the GitHub
   `Production` environment.
3. Run **Source intelligence (plan)** with `tavily-plan`. This costs nothing and
   writes nothing.
4. For the first intentional live run, choose one reviewed profile or source,
   check `confirm_live`, and check `initialize_state`. The latter creates the
   first persistent budget ledger or comparison baseline.
5. On later runs, leave `initialize_state` off. The workflow fails closed if
   the relevant prior state cannot be restored, preventing an unnoticed budget
   reset or lost Firecrawl baseline.
6. Download the review artifact, open every original publisher URL, and measure
   useful findings, false positives, and provider credits. Nothing in the
   artifact is approved app data.
7. Prove each Firecrawl source twice from `main`: create a fresh baseline, then
   run it again unchanged with `initialize_state` off. Confirm the second run
   uses the same baseline and does not create or erase a review alert.
8. Keep every ingestion fallback disabled while evaluating Source Watch. Start
   with venues only by setting the repository variables
   `VENUE_FIRECRAWL_FETCH_FALLBACK=1` and
   `VENUE_FIRECRAWL_FALLBACK_MAX_REQUESTS=1`; leave the business and civic
   repository flags at `0`. Review the fallback usage summary after a manual
   venue run.
9. Consider a low-frequency schedule only after several reviewed runs stay
   inside budget and produce trustworthy candidates.

Expand by source type, not by crawling the whole county. Structured feeds and existing official integrations remain preferable even when a provider can scrape the same information.

GitHub Actions caches are branch-scoped. Run live pilots from `main`; do not
initialize a second ledger from a feature branch. The closure detector keeps
its own local persistent ledger, which is separate from the workflow cache.
Preserve that file between intentional local runs. Provider account limits
remain the outer safety net across machines and deleted local state.

## Rollback

Disable or remove the Source Watch or Source Scout workflow, then remove its API key from the automation environment. Revert the relevant config or adapter commit if the provider behavior is unreliable. Rotate a key immediately if it may have appeared in logs.

Because both tools are candidate-only, stopping them does not require a database migration and does not change the live site. If a separately reviewed data PR introduced a bad fact, revert that data commit through the normal review process. Keep the private report long enough to understand the failure, then remove it according to the project's retention policy.
