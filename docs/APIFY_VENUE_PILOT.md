# Apify venue retrieval pilot

Radius uses Apify only as a bounded way to evaluate difficult, exact public
pages. It is not a general web crawler, a social-media bypass, or a publishing
pipeline.

The pilot is intentionally separate from the live app and from the daily venue
refresh. It can inspect one reviewed first-party page, record compact retrieval
evidence, and stop. It does not edit `src/data`, open a pull request, write to
the database, or make a provider request during a user's visit.

## Current allowlist

The tracked allowlist is `config/apify-venue-pilot.json`:

- Weinberg Center performances;
- Sky Stage calendar; and
- JoJo's events.

Arbitrary URLs, social profiles, whole-domain crawls, and user-supplied Actor
names are not accepted.

## Hard controls

Each live run:

- uses Apify's maintained `apify/website-content-crawler` Actor;
- sends the token only in an `Authorization: Bearer` header;
- supplies one exact start URL;
- sets crawl depth to zero, with one-page and one-result ceilings;
- respects `robots.txt`;
- blocks media and disables screenshots, saved HTML, and AI summaries;
- limits the Actor to 180 seconds;
- requests limited Actor permissions;
- sets Apify's cross-pricing-model `maxTotalChargeUsd` to at most **$0.25**;
- reserves that maximum charge before the request; and
- rejects private/reserved URLs and unexpected cross-host redirects.

The tracked operator ledger permits at most four attempts and $1.00 of reserved
maximum charge per UTC month when its prior state is available. It reserves
before a request, and failed attempts still count.

That monthly ledger is defense in depth, not an authoritative billing control:
GitHub Actions caches are evictable, and a runner can be lost before updated
state is saved. A missing ledger fails closed unless the operator deliberately
checks `initialize_state`, but that choice can still reset local history. Keep
an Apify account spending limit in place as the authoritative cross-run
ceiling. The provider-enforced `$0.25` `maxTotalChargeUsd` remains the hard
ceiling for each individual Actor run.

## GitHub setup

The manual workflow is `.github/workflows/apify-venue-pilot.yml`. It uses the
dedicated GitHub environment named `APIFY_TOKEN`, which contains the secret
also named `APIFY_TOKEN`. It has read-only repository permission and retains
private evidence for seven days.

The Vercel copy of `APIFY_TOKEN` is not used by this pilot. Keeping the provider
out of Vercel visitor routes avoids adding public request latency, cost, and an
unnecessary attack surface.

## First run

1. Open **Actions → Apify venue retrieval pilot → Run workflow**.
2. Select `main` and one reviewed source.
3. Leave `confirm_live` off to verify the zero-cost plan.
4. Before initializing missing state, inspect the Apify account's current
   monthly usage and spending limit. For the first paid run, check both
   `confirm_live` and `initialize_state`.
5. For later runs, leave `initialize_state` off. A missing prior ledger then
   fails closed instead of silently resetting the advisory monthly history.
6. Download the private artifact and compare the content hash, final URL,
   text length, date/time signals, event-like links, Actor run, and actual
   provider usage. Open the original publisher page before accepting a fact.

The report does not store the downloaded page, full Markdown, HTML, captions,
or media. The Apify run and dataset IDs make the provider result inspectable by
an authorized operator without copying it into Radius.

## Promotion rule

Only promote Apify into the existing venue fallback after several reviewed
runs show that it recovers useful first-party event text more reliably than
Playwright, stays within budget, preserves the expected final host, and does
not introduce rights or provenance problems. The intended order remains:

1. structured publisher feed;
2. native fetch or local Playwright;
3. one selected external fallback;
4. Radius normalization, validation, and human review.

Never chain Firecrawl and Apify for the same source attempt. A provider is a
retrieval mechanism, not the source or evidence that a claim is true.

The three reviewed pages have now produced successful private pilot evidence,
including an identical repeat fingerprint for JoJo's. The bounded follow-on is
the manual-only [Apify source change radar](./APIFY_SOURCE_CHANGE_RADAR.md).
That radar remains a review queue and cannot publish event data.

Official references:

- [Website Content Crawler](https://apify.com/apify/website-content-crawler/api)
- [Run Actor API](https://docs.apify.com/api/v2/actors-runs-post)
- [Actor permissions](https://docs.apify.com/actors/running/permissions)
- [Dataset items API](https://docs.apify.com/api/v2/dataset-items-get)
