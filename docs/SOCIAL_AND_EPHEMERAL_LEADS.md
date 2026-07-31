# Social and same-day local leads

Frederick businesses, organizers, and food trucks often publish their most
useful update as a post rather than a durable website record: tonight's time,
today's location, sold out, cancelled for weather, or an event graphic. Radius
can use those signals, but they need a separate trust lane from verified app
data.

## The product: Local Leads

The right internal tool is a short-lived review inbox, not a firehose copied
onto the public map.

```text
owner beacon / structured feed / authorized API / public lead
                         ↓
                short-lived intake
                         ↓
        Frederick-area + entity + duplicate checks
                         ↓
            candidate with source and expiry
                         ↓
         owner confirmation or human review
                         ↓
        schedule, live signal, event, or rejection
```

A candidate is not a fact merely because a collector found it. Calls for
service are not confirmed crime; community posts are not confirmed incidents;
and an old schedule is not proof that a truck is serving now.

## Source order

Use the strongest available source and stop when it is sufficient:

1. **Owner action:** the existing Radius food-truck beacon, an organizer
   submission, or an approved business update.
2. **Structured first-party data:** RSS, iCal, JSON, schema.org, ticketing feed,
   or an official schedule page.
3. **Authorized account data:** a post from a truck, venue, or organizer
   obtained through that platform's official API with the required access.
4. **Public community lead:** a post or link that sends an operator back to the
   original source. It stays unverified and expires quickly.

Apify is appropriate for reviewed public vendor websites, event pages, and
JavaScript schedules. It is not permission to bypass a social platform's API,
access controls, or automated-collection rules.

## Platform boundary

| Platform | Radius collection path | Rule |
| --- | --- | --- |
| Reddit | Approved Reddit Data API or a user-submitted original link | Do not use a scraper Actor without Reddit's written approval for this use. |
| Facebook | Graph API for Pages Radius manages or has approved access to | Do not build a general public Groups scraper. |
| Instagram | Instagram API for Professional accounts with the required account access/review | Consumer accounts and unrelated profiles are not a general collection surface. |
| X | Official recent search, stream, or account timeline API | Use the paid official API; do not scrape around it. |
| Bluesky | Public AppView search/lookups or a narrowly filtered Jetstream consumer | Apply moderation labels and Frederick/entity filters before retaining a lead. |
| Mastodon | Public, hashtag, or relevant-instance streaming APIs | Search support varies by instance; prefer known accounts and hashtags. |
| YouTube | YouTube Data API with required attribution and refresh/deletion behavior | Never scrape YouTube data. |

Official policy and API references:

- [Reddit Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
- [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms)
- [Meta automated data collection terms](https://www.facebook.com/legal/automated_data_collection_terms)
- [Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [X recent search](https://docs.x.com/x-api/posts/search/introduction)
- [Bluesky Jetstream](https://docs.bsky.app/docs/advanced-guides/firehose)
- [Mastodon public data](https://docs.joinmastodon.org/client/public/)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)

## Food-truck candidate shape

A same-day food-truck lead should retain:

- canonical truck slug and published name;
- candidate state: `scheduled`, `serving`, `sold_out`, `cancelled`, or
  `needs_review`;
- stated service date, start, and end time;
- published venue/location text plus a matched Radius place when available;
- coordinates only from a confirmed Radius place, owner beacon, or reviewed
  address—not from a guessed social caption;
- source account ownership: `truck`, `venue`, `organizer`, or `community`;
- platform post ID and canonical original link;
- first seen, source published, last checked, and expiry times;
- content hash/edit state, extraction version, confidence, and warnings; and
- reviewer or owner confirmation when promoted.

Store a short factual support excerpt only when necessary for private review.
Do not permanently copy full captions, comments, profile data, or post media.
Respect edits, deletions, privacy changes, moderation labels, and account
blocks.

## Freshness and override rules

- An approved owner beacon is the strongest evidence that a truck is serving
  at a location now.
- A same-day post from the truck or hosting venue can confirm a schedule after
  entity, date, time, and location checks. It should not create a live map pin
  without a beacon or another explicit first-party live signal.
- A first-party `cancelled` or `sold out` update immediately suppresses the
  conflicting schedule and live callout.
- Recheck active same-day authorized sources every 10–15 minutes when provider
  limits permit.
- Hide a serving window one hour after its stated end. With no end time, expire
  after six hours or at local midnight, whichever comes first.
- Expire an unverified community lead after 24 hours.
- If the source is edited, deleted, private, or unavailable, withdraw the lead
  or return it to review; do not infer what happened.

Public labels should say **Posted by the truck**, **Confirmed by the venue**,
**Owner live pin**, or **Community lead**, with the original link and last-check
time. “Scheduled” and “here now” must remain visually and logically distinct.

## Practical rollout

1. Improve the existing owner beacon with one-tap `sold out`, `cancelled`,
   `leaving early`, and `extend time` actions. This gives trucks a faster and
   more reliable tool than scraping their posts.
2. Let an approved truck or organizer register an official RSS/iCal/website
   schedule and, later, connect a managed social account through an official
   OAuth flow.
3. Add the private Local Leads queue and normalization schema before enabling
   any broad connector. Start with user-submitted source links and authorized
   accounts.
4. Add open-network connectors such as Bluesky or Mastodon only with locality,
   known-account, keyword, duplicate, retention, and moderation controls.
5. Apply for Reddit/Meta/X access only for a narrowly documented use. Keep the
   connector disabled until approval and credentials are present.

The goal is not to collect everything people say. It is to catch useful local
changes quickly, show where each one came from, and prevent weak signals from
quietly becoming public claims.
