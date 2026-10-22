# Daily listing and event upkeep

Daily collection must produce useful published facts, preserve the date each
source was actually observed, and stay within a finite spending boundary.
A successful fetch, a reviewed main artifact and a verified public deployment
are separate outcomes.

## Owners and cadence

GitHub schedules use UTC. They run without this Mac being open. Start times can
be delayed by GitHub; these are windows, not guaranteed publication deadlines.

| Owner | Window | Scope and publication rule |
| --- | --- | --- |
| `transit-steward.yml` | Daily 07:23 | Public Frederick GTFS. Existing review and release checks remain. |
| `data-steward.yml` official-hours jobs | Daily 09:17 | Both required library pages plus fourteen exact reviewed native merchant URLs for fifteen listing identities. Unchanged accepted facts may renew observations after checks; changed facts and removed holds need review. The two manual sources are preserved without a request or new date. |
| Existing Codex data upkeep, manual merchant cohort | Review before evidence expires | Sumittra and Curious Iguana only. Read their official pages through the existing Firecrawl connection when evidence is within 48 hours of expiry. A private preflight reserves each attempt before a read, capped at two attempts per UTC day and 30 per UTC month. No automatic paid GitHub job. |
| `ingest-venues.yml` native job | Daily 11:07 | Banyan, Weinberg and New Spire native sources. No model, Firecrawl key, browser or paid-review prerequisite. Future changes need review. Failed/unselected sources retain their rows and dates. |
| `refresh-commerce-links.yml` native mode | Daily 12:37 | At most 20 eligible official business sites and one same-host follow page each. Static HTML only, finite body/deadline, no retries, redirects or destination probes. New/changed actions need review. |
| `listing-maintenance.yml` | Daily 14:07 | Offline reconciliation of every promoted public listing, per-field states, town/category totals and bounded source candidates. No merchant or provider requests. |
| `build-marc-schedule.yml` | Monthly, day 1 at 08:00 | Existing public MARC GTFS cadence, hosted runtime capped at 15 minutes, isolated review publisher. No dependency on an unregistered NAS. |

Staggering leaves room for protected checks between publishers. It reduces
collisions but does not waive the current-main guard. An app merge or a long
verification can still require reconciliation.

`bot/venue-native-refresh` is distinct from the old paid venue review branch.
Model-assisted venue work requires explicit manual `include_model_sources`.
Other pre-existing paid adapters retain their current caps, approval and
recovery holds. This change does not reset Apify fingerprints, grant Google
policy authority, raise provider budgets or provision services.

## Facts that may refresh

- An unchanged accepted schedule can receive a new observation only after a
  successful current source read. Published date coverage and expiry still apply.
- A failed library cohort leaves its bytes, observations and expiry untouched.
  Independent merchants can still refresh. The run reports partial collection.
- Individual changed/unparseable merchant sources keep their old approved
  evidence and a review hold. Repeated reads cannot approve a candidate.
- A complete native venue read may replace that source's inventory. Failed and
  unselected source inventories remain unchanged. Actual end times, separate
  showtimes, school-show qualifiers and cross-source recovery remain intact.
- A menu/order/reservation link must be an exact safe anchor on an eligible
  official source. Found anchors are not checkout or destination verification.
  Preserve classifier priority so the main menu precedes an individual section.
- A partial link crawl cannot prove an old deep destination is dead. Such a
  candidate is held privately; the complete prior public record and its old
  observation remain. Do not freshly stamp an unseen PDF or silently delete it.
- Images need exact place identity and owner permission or a supported license.
  Provider eligibility is not a successfully decoded image. Missing local bytes
  and remote availability are different states.
- Reviewed bundled City Hall and Mount St. Mary's photographs load before a
  provider fallback. Barbara Fritchie House retains its preferred accurate
  image policy using existing local licensed bytes. Source and license credits
  travel with the selected photograph; no new merchant image rights are inferred.

The native merchant fetcher normally accepts at most 512,000 HTML bytes. The
exact enrolled Aleko's URL has a reviewed 1 MiB exception because its complete
official page was 773,517 bytes at enrollment. The registry owns that exception;
callers cannot raise it through a URL or command option. Every source still has
the existing deadline, body-read ceiling, no-redirect and no-retry policy.
Failed or changed evidence remains held for review.

Common Market's one exact official homepage has independent Route 85 and 7th
Street grocery bindings. Its shared contact card supplies ordinary store hours
only; separate cafe contacts do not establish cafe service hours, and no
holiday calendar is verified. Within one
collection run, those bindings reuse the same immutable response, observation
and hash. Each listing retains its own review/acceptance state. There is no
persistent page cache and no reused receipt receives a new observation.
Both bindings retain the ordinary 512000-byte limit and seven-day expiry.

## Reviewing groups of official listings

The existing native merchant owner supports reviewed cohort declarations in
`scripts/lib/merchant-hours-cohorts.ts`. Each binding names an exact slug,
source owner, official URL, name, address and phone. Shared daily contact cards
and location cards with agreeing visible and JSON-LD weekly hours are supported.
The latter has an offline twenty-branch regression; it does not enroll those
synthetic branches or grant authority to other websites. A source still needs
an exact entry in `MERCHANT_HOURS_SOURCES` and source-ledger review. Unknown
dates, admission cutoffs, service qualifiers, missing weekdays and conflicts
remain held. Common Market is the currently enrolled shared-page cohort;
FCPL retains its independently reviewed nine-branch adapter.

The scheduled native run preserves original merchant HTML and an index of
actual observations, hashes, exact member slugs and failed/manual-skipped
outcomes in the separate authenticated
`official-hours-review-evidence-<run>-<attempt>` artifact, retained seven days.
The index records the exact source revision when available. Its
`collection_complete` flag means every registered native URL has an attempt
outcome, not that reads succeeded or facts were approved. It is false for an
incomplete collection. No new requests or retries are made to create evidence.
Raw pages never enter Git, generated client datasets or the publication
allowlist. Preserve useful older pending evidence privately before expiry.

Review multiple pending candidates offline from a current artifact:

```sh
npm run --silent review:official-hours-batch -- --template > /private/path/review-plan.json
npm run review:official-hours-batch -- --plan=/private/path/review-plan.json
npm run review:official-hours-batch -- --plan=/private/path/review-plan.json --apply
```

The template starts every candidate at `hold`. For each accepted member,
substantively review its identity, complete schedule and notices, then set
`decision` to `accept`, supply the original local HTML `evidence_file`
(relative to the plan or absolute), and write a `review_note`. The plan pins the
exact input artifact hash plus each candidate's source URL, hash and actual
observation. Execution replays the source parser against the original bytes;
it never fetches a page or alters the observation. A stale, mismatched,
incomplete or expired accepted member rejects the whole batch. Held and
unselected records retain their complete prior evidence. Apply is explicit;
dry-run is the default. The collector and batch reviewer share an exclusive
commit lock and refuse a changed baseline, existing lock or older staged file.
Do not reset a lock to make a run succeed.

This command changes only the merchant evidence artifact. Reconcile onto current
main, rebuild affected client artifacts, promote only the places release stream,
and use the normal required review, GitHub checks and production verification.
It does not merge a PR, run a provider or bypass a release gate. Batches reduce
repeated code and review operations; they do not turn unverified candidates
into verified schedules or expand any source/request/provider budget.

Delaplaine's exact homepage supplies public gallery hours only. Its Plan Your
Visit and footer schedules must both be complete and agree with the exact
Frederick address and contact. Class and event times cannot fill a missing
gallery day. Conflicting copies, hidden hours, closure notices or an unreviewed
admission cutoff require review. This source uses the ordinary 512000-byte
native limit and seven-day evidence window; no holiday hours are inferred.

## Bounded manual hours evidence

The ordinary native collector must not request a manual-owned source or create
a failure solely because it intentionally skipped that transport. It carries
the exact approved row and any existing hold unchanged. The original observation
and expiry still determine whether users see current hours.

Before an explicitly authorized manual read, check the existing Firecrawl credit
balance and the established private ledger, then reserve an attempt:

```sh
npx tsx --tsconfig tsconfig.json scripts/manual-merchant-refresh-budget.ts --ledger "$RADIUS_MANUAL_CREDIT_LEDGER" --check
npx tsx --tsconfig tsconfig.json scripts/manual-merchant-refresh-budget.ts --ledger "$RADIUS_MANUAL_CREDIT_LEDGER" --reserve=sumittra-thai-cuisine
```

The ledger must already exist outside a Git worktree. The tool has no initialization,
reset, increased-cap or provider-execution option. Missing, invalid, locked or
uncertain history stops the paid read; pending and failed attempts still count.
Keep the reservation, exact source/final URL, fresh-fetch result, actual response
capture time, source hash and reported credit use privately. Do not commit account
balances, raw merchant pages, provider credentials or credit ledgers.

Use plain HTML retrieval only: no search, crawl, agent, model JSON extraction,
browser actions, enhanced proxy, retry, top-up or additional service. This manual
merchant lane does not reset or unblock Source Watch, Tavily, Apify or Google holds.
New or changed facts still require source review and explicit candidate acceptance.

Curious Iguana's ordinary Saturday closes earlier than First Saturday. Its
ordinary-week evidence ends before that New York midnight, and collection on
First Saturday is rejected until a dated extension can be represented. Do not
use an early-closure exception to invent a later closing. Avoid repeated reads
when this known boundary, rather than evidence age, limits the horizon. Sumittra's
Sunday/holiday wording supplies ordinary weekly hours only; it does not establish
an independently verified holiday calendar.

## Whole-catalog evidence

Run `npm run audit:listings -- --output-dir /private/tmp/radius-listing-review`.
The report refuses an invalid release manifest or a mismatched canonical public
catalog. JSON contains exactly one row per promoted public slug, with:

- Current, stale, review-required or unknown hours and the actual evidence horizon.
- Owned, licensed local/remote, provider-eligible or missing image plans.
- Missing contacts, source candidates and concrete next actions.
- Town/category totals that reconcile to the full public denominator.
- Exact reviewed data version and git revision. Served deployment, remote-image
  decoding and contact ownership remain explicitly unverified by this report.

The daily diagnostic artifact lasts 30 days. One listing exception issue tracks
expired accepted official evidence, source/promotion holds, missing bundled
images or an unverifiable report. Unknown inventory remains visible as product
debt. Identical failure fingerprints do not create repeated issue edits.
Recovery requires committed-source status and complete version, scope, row and
image-total evidence. Local reports label uncommitted work as a working-tree
draft; its git revision identifies the base, not a published release.

Native commerce observations also have a separate 30-day artifact with selected
slugs, successes, failures and held candidates. It contains no secrets or raw
page bodies. The public publisher accepts only its established allowlist;
diagnostics never become a public fact by being uploaded.

## Serialized review and publication

The daily Codex upkeep pass reviews the existing native-source updates, then
processes them one at a time. It must preserve older pending source candidates
from authenticated diagnostic artifacts rather than overwrite them blindly.
A still-current source receipt may be reconciled onto current main, rebuilding
the client models and release manifest. Never copy an old generated client set
or a whole release manifest over newer reviewed data, restamp a retained source,
or rerun a paid collector just because its branch is stale.

Keep the existing enrichment snapshot compact when writing it. Whitespace
expansion can exhaust the tracked repository budget even when no source facts
change. Compacting bytes must preserve every parsed value and observation and
requires the normal places-stream digest refresh; it does not renew evidence.

Normal `verify` and `style-lint` remain required. Vercel owns the normal build
from merged main. Confirm the exact deployment, public aliases and relevant
mobile flows before reporting an update as live. Do not deploy the same SHA
again or start duplicate production canaries.

The Codex review pass needs its execution host available and consumes Codex
account usage. GitHub collection continues independently. If review cannot run,
new or conflicting facts stay held; accepted evidence expires honestly.
