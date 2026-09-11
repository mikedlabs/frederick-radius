# Historical Apify venue retrieval pilot

Radius uses Apify only as a bounded way to evaluate difficult, exact public
pages. It is not a general web crawler, a social-media bypass, or a publishing
pipeline.

The pilot was intentionally separate from the live app and from the daily
venue refresh. It proved that three difficult first-party pages could be
retrieved within a narrow provider cap. Its GitHub workflow has now been
retired in favor of the lower-cost, durable
[Apify source change radar](./APIFY_SOURCE_CHANGE_RADAR.md).

`config/apify-venue-pilot.json` and `scripts/apify-venue-pilot.ts` remain in the
repository because the radar imports their reviewed URL registry, validation,
and types. Retaining those files does not expose a scheduled pilot or a second
GitHub spending path.

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

## Retirement

`.github/workflows/apify-venue-pilot.yml` is intentionally absent. Do not
restore or schedule it: its advisory cache and $0.25 per-run ceiling were
separate from the radar's durable reservation ledger. The dedicated
`APIFY_TOKEN` GitHub environment now belongs to the radar only. The Vercel copy
of `APIFY_TOKEN` is not used by either review workflow.

The successful historical runs compared content hashes, final URLs, text
length, date/time signals, event-like links, Actor runs, and provider usage.
Their reports did not store downloaded pages, full Markdown, HTML, captions,
or media.

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
the scheduled, review-only
[Apify source change radar](./APIFY_SOURCE_CHANGE_RADAR.md). That radar remains
a review queue and cannot publish event data.

Official references:

- [Website Content Crawler](https://apify.com/apify/website-content-crawler/api)
- [Run Actor API](https://docs.apify.com/api/v2/actors-runs-post)
- [Actor permissions](https://docs.apify.com/actors/running/permissions)
- [Dataset items API](https://docs.apify.com/api/v2/dataset-items-get)
