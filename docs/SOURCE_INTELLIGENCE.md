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

A live Scout run takes an exclusive lock at `scripts/reports/source-scout.lock`. An active lock blocks a second run; an expired lock can be recovered after the configured stale window. Before every provider request, the Scout reserves the estimated credit in `scripts/reports/source-scout-usage.json`. That UTC daily/monthly ledger counts failed attempts as well as successful ones, so repeated or overlapping runs cannot bypass the tracked caps. The plan command does not acquire the lock, touch the ledger, call Tavily, or write files.

## Cost controls

The tracked configuration files are the authority for budgets:

- `config/source-watch.json` owns the exact URL allowlist and Firecrawl per-run and monthly limits.
- `config/source-scout.json` owns Tavily profiles, allowed domains, search depth, maximum results, per-run credit limits, UTC daily/monthly attempted-credit limits, and the stale-lock window.

Keep Firecrawl to one exact-page scrape per configured observation. Keep Tavily searches narrow and use cached results before spending another credit. Stop with a partial report when a limit is reached. Do not add an environment variable or command-line option that silently raises a tracked cap.

The shared operator extraction engine uses native fetch or Playwright first.
Firecrawl is an opt-in fallback only when native retrieval fails:

- `FIRECRAWL_FETCH_FALLBACK=1` enables it.
- `FIRECRAWL_FALLBACK_MAX_REQUESTS` sets the per-process ceiling, defaulting to
  6 and never exceeding the code-level ceiling of 20.
- Venue and municipal runs print an aggregate fallback usage summary.
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

The separate closure detector remains review-only. `--limit` accepts only a positive whole number no higher than its hard 125-request ceiling. Long-tail selection requires both `--all` and `--confirm-all`; confirmation never raises the immutable 125-request / 125-credit run ceiling. It reserves an attempt before each request and stops on authentication, rate, plan, or billing errors.

Neither provider belongs in the request path for Today, Search, Map, Events, or Ask Radius. Scheduled or operator runs must not add latency or provider cost to a user's visit.

## Secrets and connections

The unattended REST tools use:

- `FIRECRAWL_API_KEY` for `scripts/lib/firecrawl-rest.ts`;
- `TAVILY_API_KEY` for `scripts/lib/tavily-search.ts`.

For local use, place keys in `.env.local`. Never commit them, print them, place
them in client code, or prefix them with `NEXT_PUBLIC_`. For the manual GitHub
pilot, add both keys as secrets in the repository's `Production` environment.
`TAVILY_API_KEY` does not belong in Vercel. A Vercel `FIRECRAWL_API_KEY` does
not activate Visit Frederick collection by itself. The fixed-URL route remains
unscheduled and `VISIT_FREDERICK_FACTS_REUSE_APPROVED` remains `0` until
written permission is documented; no provider key is ever available to client
code or a visitor request path.

An OAuth-backed MCP connection is different. It represents an interactive user's consent inside Codex or another connected client. A scheduled GitHub Action cannot borrow that session, and an OAuth cookie or token must never be copied into the repository. Unattended Source Watch and Source Scout runs require their provider API keys.

## Rollout

The manual workflow is `.github/workflows/source-intelligence.yml`. It has
read-only repository permission, never commits or publishes, uploads review
reports for 14 days, and persists only the provider cache, attempted-credit
ledger, and Firecrawl comparison hashes between runs.

1. Revoke any provider key previously pasted into chat, logs, or a URL.
2. Add fresh `TAVILY_API_KEY` and `FIRECRAWL_API_KEY` secrets to the GitHub
   `Production` environment.
3. Run **Source intelligence pilot** with `tavily-plan`. This costs nothing and
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
7. Keep `FIRECRAWL_FETCH_FALLBACK=0` while evaluating Source Watch. After the
   Firecrawl pilot is reliable, set the GitHub environment variable to `1` and
   keep `FIRECRAWL_FALLBACK_MAX_REQUESTS=6` to enable the bounded fallback in
   the existing business, venue, and civic ingestion workflows.
8. Consider a low-frequency schedule only after several reviewed runs stay
   inside budget and produce trustworthy candidates.

Expand by source type, not by crawling the whole county. Structured feeds and existing official integrations remain preferable even when a provider can scrape the same information.

GitHub Actions caches are branch-scoped. Run live pilots from `main`; do not
initialize a second ledger from a feature branch. Provider account limits
remain the outer safety net because local runs and the separate closure
detector do not share GitHub's cached ledger.

## Rollback

Disable or remove the Source Watch or Source Scout workflow, then remove its API key from the automation environment. Revert the relevant config or adapter commit if the provider behavior is unreliable. Rotate a key immediately if it may have appeared in logs.

Because both tools are candidate-only, stopping them does not require a database migration and does not change the live site. If a separately reviewed data PR introduced a bad fact, revert that data commit through the normal review process. Keep the private report long enough to understand the failure, then remove it according to the project's retention policy.
