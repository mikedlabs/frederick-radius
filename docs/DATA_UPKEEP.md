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
| `data-steward.yml` official-hours jobs | Daily 09:17 | Both required library pages plus twenty-two exact reviewed native merchant URLs for twenty-three listing identities. Three identities retain display-only venue or dinner qualifications. Unchanged accepted facts may renew observations after checks; changed facts and removed holds need review. The two manual sources are preserved without a request or new date. Run summaries derive their source/binding counts from the current registry. |
| Existing Codex data upkeep, manual merchant cohort | Review before evidence expires | Sumittra and Curious Iguana only. Read their official pages through the existing Firecrawl connection when evidence is within 48 hours of expiry. A private preflight reserves each attempt before a read, capped at two attempts per UTC day and 30 per UTC month. No automatic paid GitHub job. |
| `ingest-venues.yml` native job | Daily 11:07 | Banyan, Weinberg and New Spire native sources. No model, Firecrawl key, browser or paid-review prerequisite. Future changes need review. Failed/unselected sources retain their rows and dates. |
| `refresh-commerce-links.yml` native mode | Daily 12:37 | At most 20 eligible official business sites and one same-host follow page each. The same static responses supply private listing-intake evidence as well as commerce links. Finite body/deadline, no retries, redirects or destination probes. New/changed facts need review. |
| `listing-maintenance.yml` | Daily 14:07 | Offline reconciliation of every promoted public listing, per-field states, town/category totals and bounded source candidates. No merchant or provider requests. |
| `build-marc-schedule.yml` | Monthly, day 1 at 08:00 | Existing public MARC GTFS cadence, hosted runtime capped at 15 minutes, isolated review publisher. No dependency on an unregistered NAS. |

Staggering leaves room for protected checks between publishers. It reduces
collisions but does not waive the current-main guard. An app merge or a long
verification can still require reconciliation.

## Protected publication evidence

Native `pull_request` runs supply the required `verify` and `style-lint`
checks. The existing `automated-pr-checks.yml` caller loads a bounded helper
from the exact current protected-main revision. It revalidates the same-repository
open PR, exact current main/base/head/content-proven merge and complete unchanged
branch-specific path allowlist before approving only the exact existing eligible
held CI/style runs. Already running or completed native runs are observed, never
rerun. Old, moved, forked, ambiguous, missing or otherwise ineligible runs stay
held. A failed approval, including HTTP 403, requires an owner to inspect and
approve the recorded exact native run IDs in GitHub; it does not fall back to a
manual dispatch, copied check, new token, service, ruleset change or relaxed gate.

CI classifies native PRs through the same protected-main helper before checkout
or dependency installation. Only a positively verified data-only result may use
the focused artifact gate. Ordinary code PRs and manual dispatches retain the full application gate.
Recognized same-repository publisher bot PRs with stale, moved, missing or
uncertain identity/bootstrap/API evidence fail preflight and remain held; a
full application pass cannot replace current-main data publication authority. Both classification and
execution approval retain exact private receipts even when their preflight fails.
The data-only job repeats the same current-main/PR proof after its artifact
gates; main/head/base movement during execution remains held. No publisher
source credentials are exposed to PR code.

Execution approval starts tests; it does not accept source facts, remove review
holds, renew timestamps or add auto-merge authority. The caller's existing review
and auto-merge policy remains separate. Passing native tests is still not
publication: require the protected merge and its rule evaluation, then the exact
ready Vercel deployment and relevant public checks before saying an update is live.

The historical `automated-pr-status-bridge.yml` is manual recovery only. Its
explicit attach and stale-failure modes and saved transport receipts remain
available, but it has no schedule or automatic CI caller. Synthetic API/legacy
greens did not establish eligibility: an earlier proof was rejected with
`required checks cancelled` after the native current-head runs were cancelled.
`workflow_dispatch` jobs cannot stand in for eligible native PR jobs. This native
path supplied genuine native required checks for the protected data-only merge
of PR #1544 on October 23, 2026 (`75cd522df1159d5530105a5ad4544232839e0c09`).
That release passed its rule evaluation and reached the public aliases. This
does not prove the approval API for a future held bot run: retain the exact
run evidence and owner-approval boundary above. Do not replay old generated
client files to recover publication.

See [GitHub's required-check guidance](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated).

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
- Owner-library imports are selected and visually reviewed, never a bulk
  assignment by camera GPS, search keywords or a nearby building. Keep rendered
  export/master hashes and source identifiers privately; ship optimized,
  metadata-stripped bytes with the exact owned place registry and places release
  stream. Preserve useful older frames in the existing detail gallery. Archive
  scenery does not establish current weather, events, services or opening hours.
  The owner permits these photographs without public credit or capture dates.
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

Safeway's two exact Middletown and Walkersville pages use a reviewed grocery
disclosure shape. Require the primary GroceryStore identity, exact address and
phone, the labeled Store Hours button/wrapper relationship, seven complete
weekday rows, microdata and agreeing table/hero schedules. The complete week
starts collapsed behind the publisher's own disclosure. This is an explicit
source shape, not permission to trust arbitrary hidden fields. Pharmacy hours
are a separate service and never supply grocery days. Both sources retain the
ordinary native transport limits and seven-day expiry; no holiday calendar or
image reuse rights are inferred.

Food Lion's three exact Crestwood, Yellow Springs and Thurmont pages bind only
their primary GroceryStore identities and labeled Store Hours. Require the
reviewed exact name, address and phone, seven visible weekday rows, GroceryStore
microdata, and agreement with the table configuration and hero/core schedules.
The corporate Gift Card Sales Department FAQ week is support service and never
supplies grocery hours. Nearby teasers, pharmacy and deli schedules cannot fill
grocery days. These sources retain the ordinary 512000-byte cap and seven-day
expiry. No holiday changes or page/image reuse rights are inferred. Preserve
the original response hash and actual observation through review; registration
or successful collection does not accept evidence or establish publication.

## Reviewing groups of official listings

Source-expansion review may read at most 30 additional official public pages
and enroll eight carefully reviewed sources per day, as authorized on October
22, 2026. These limits are separate from existing scheduled native refreshes.
Failed reads and each separately reviewed redirect destination still count;
they do not authorize retries or transparent redirect following. Paid-provider
budgets, manual ledger limits and policy holds remain unchanged.

The existing native merchant owner supports reviewed cohort declarations in
`scripts/lib/merchant-hours-cohorts.ts`. Each binding names an exact slug,
source owner, official URL, name, address and phone. Shared daily contact cards
and location cards with agreeing visible and JSON-LD weekly hours are supported.
The latter has an offline twenty-branch regression; it does not enroll those
synthetic branches or grant authority to other websites. A source still needs
an exact entry in `MERCHANT_HOURS_SOURCES` and source-ledger review. Unknown
dates, admission cutoffs, service qualifiers, missing weekdays and conflicts
remain held unless their exact source adapter preserves an explicitly reviewed
display-only qualification. That qualification never establishes generic
Open now. Common Market is the currently enrolled shared-page cohort;
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

### Qualified venue and dinner schedules

The National Museum of Civil War Medicine, The Tasting Room and Hootch & Banter
have exact daily source owners in the same native collector. Their complete
weeks carry `qualification` with an explicit `scope`, readable `label` and
condition `note`, and `usage: display_only`. These schedules are useful visit
information, but never drive generic Open now, open-only search or recommendation
eligibility, admission availability, or SEO opening hours. Report this coverage
separately from schedules that can establish current visitability.

The museum adapter binds only the Frederick location card at 48 East Patrick
Street. It keeps gallery last admission at 4 p.m. separate from the 5 p.m.
closing time and never borrows the Washington museum's schedule. The Tasting
Room adapter reads labeled dinner periods and explicit Sunday closure; happy
hour and bar times cannot extend that week. Hootch & Banter retains dinner
periods separately from weekend brunch, the kitchen gap, late bar service and
upstairs private events. Neither restaurant's dinner schedule becomes a claim
that its whole venue is open or closed.

Museum and Hootch source conditions name annual closures without observed
calendar dates. A weekly evidence window spanning one of those boundaries is
held for a separate dated review. Calendar calculations only detect that hold;
they never publish a fabricated exception. Unknown notices, changed conditions,
duplicate or hidden disclosures, incomplete weeks and conflicting source facts
remain blocking. No qualification may launder unresolved contradictions into
verified hours.

Every qualification travels with the exact original source bytes, hash, actual
observation and seven-day expiry through candidate replay, explicit acceptance,
public client rebuilding and production verification. An old capture never
receives a new observation. These three source enrollments use the existing
512000-byte native cap and transport policy. Paid budgets, source-review limits,
provider holds and image licensing rules remain unchanged.

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

### Reuse captured official pages before requesting more

The commerce owner preserves each complete original response before extracting
anchors. Its separate authenticated
`official-commerce-source-evidence-<run>-<attempt>` artifact lasts seven days
and contains the original bytes, exact source URL, actual per-page observation,
SHA-256, source revision and canonical identity context. Successful originals
survive a missing-anchor response, failed follow page or prior-destination hold.
The compact outcomes and held intake candidates remain in the 30-day diagnostic
artifact. Preserve useful pending evidence privately before raw-artifact expiry.
These artifacts add no page requests, rendering, models or paid providers.

Intake is a candidate extractor, not a second publication owner. An exact
JSON-LD identity, complete week or image URL is still held for review. Missing
weekdays do not mean closed; corporate, dinner, brunch, bar and holiday hours
cannot be substituted for the business's complete schedule. A scraped image
URL supplies no reuse rights. Expected held intake states do not block valid
commerce work for that source, and a failed source must not erase another
source's accepted record.

Review already-captured evidence before spending additional source reads. For a
new identity, inspect the original page and enroll only a supported reviewed
source shape with its exact identity and source ledger. Existing
`jsonld_weekly_location_cards` cohort declarations reuse one parser across
independent bindings; they still require agreeing visible hours and JSON-LD.
Replay the original bytes through that enrolled parser, then use the existing
held batch plan and explicit acceptance procedure above. A new enrollment must
join the daily official-hours owner. Commerce's 30-day rotation cannot renew
seven-day accepted hours, and intake must not silently change that cadence.

The offline connector pins the original index revision and explicitly selects
one response hash per listing. Its default is a read-only preview:

```sh
npm run stage:official-listing-hours -- --index=/private/path/index.json --source-revision=<captured-full-sha> --select=<slug>@<original-response-sha256>
```

After reviewing that preview, the same command with
`--output-dir=/private/new-handoff --write` creates a new private directory with
selected original pages, `pending-merchant-hours.json` and `review-plan.json`.
It never edits the approved repository artifact. Use the existing
`review:official-hours-batch` command with `--artifact` pointing at that private
pending artifact and `--plan` at the held plan. Existing enrolled parsers remain
the authority for their reviewed formats, including visible-only and microdata
sources; generic JSON-LD discovery is not an additional gate. Older captures
and equal-time conflicting hashes cannot replace newer accepted, pending or
failed-source observations. A captured revision may differ from current main,
but must match its own index and selected original records.

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
