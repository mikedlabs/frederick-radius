# Fair Day visitor intelligence

Frederick Radius uses community discussion to discover missing questions, not
to manufacture answers. A Reddit title, review, or social post can reveal a
visitor problem. It cannot by itself establish a current parking rule, a live
wait, an accessible route, or any other decision-sensitive fact.

## Evidence ladder

| Evidence state | What Radius may do | What Radius must not do |
| --- | --- | --- |
| Verified official | Publish an original, source-linked answer with the check date | Copy organizer prose, logos, maps, or imply partnership |
| Repeated public pattern | Prioritize a feature or a field check; describe it internally as a reported pattern | Present it as a measured live condition or universal experience |
| Single anecdote | Add a private research question | Repeat the allegation publicly or identify the poster |
| Not confirmed | Tell the visitor the answer is not confirmed and give the safest next action | Fill the gap with an old post, a guess, or a third-party summary |

The public practical-answer data enforces these states in
`src/lib/fair/practical-answers.ts`. A `community-pattern` needs at least two
reviewed sources. The first release uses official answers plus an explicit
not-confirmed state for re-entry; it does not publish a community claim.

## What the first research pass found

Official pages confirm the high-impact details that are easy to miss:

- Lots A through D are cash only; Gate 3/Infield accepts cash or card.
- Advance entertainment tickets are scanned at the Fair gate and again at the
  Grandstand.
- Regular ride wristbands do not include admission or parking. The Jack Pass
  has a separate two-scan flow.
- Will Call requires the original purchaser and identification.
- Gate 4A is the designated rideshare, taxi, and friend drop-off point.
- Family care, lost-person help, mobility rentals, and the Lot D ADA shuttle
  are available, with important location and availability limits.
- Rain alone does not automatically close the Fair; the official site remains
  the status source.

Public discussion adds useful research prompts:

- Fair traffic is repeatedly discussed around East Patrick Street and the
  nearby I-70 approach, but Radius has no live 2026 traffic forecast.
- General Frederick discussions report uneven cellular data. That justifies an
  offline-resilient Fair experience, not a claim that service will fail at the
  Fairgrounds.
- Limited reviews mention peak concession or restroom lines. Radius must not
  publish a wait estimate without direct, current evidence.
- A 2023 Reddit post describes a no-re-entry experience. The reviewed 2026
  official pages do not clearly state the current rule, so Radius tells people
  to ask before leaving.
- One concert review raised a mobility and concourse concern. That is a field-
  verification prompt, not a grounds-wide accessibility conclusion.

Relevant review links include the
[Fair traffic discussion](https://www.reddit.com/r/frederickmd/comments/16jcwk6/),
[older re-entry discussion](https://www.reddit.com/r/frederickmd/comments/16kmkxx/),
[2025 Grandstand question](https://www.reddit.com/r/frederickmd/comments/1mqw5ml/),
and the official [Fair FAQ](https://thegreatfrederickfair.com/faq/).

## Private Reddit radar

Radius uses Reddit's public Atom feeds, not a logged-in scraper:

- `/admin/radar` now includes an exact Great Frederick Fair search.
- The feed is cached for one hour.
- Radius reads titles, post links, and publication times only.
- It does not retain usernames, post bodies, comments, media, deleted/private
  material, or sentiment scores.
- Friction labels such as `arrival`, `tickets`, or `accessibility` are triage
  hints, not factual classifications.
- Every item links back to Reddit and remains owner-only.

The NAS monitor uses the same boundary:

```sh
npm run fair:community-watch -- --live --fail-on-new
```

The first run establishes a private baseline without raising historical posts
as new. Later runs return a distinct status only when a new public Fair post is
found. The report is stored under the gitignored `scripts/reports/` directory.

## Why broad scraper search stays manual

A bounded Firecrawl search on September 1, 2026 returned a noisy mix of old
social posts, unrelated pages, and general Frederick results. A second targeted
query failed to preserve the event-name intent. The results did not add a
publishable Fair fact, and the search-quality feedback recovered one of the two
credits used by the targeted search.

Firecrawl can still help with an occasional deep research pass when a reviewer
has a precise question. It should not run on a schedule or feed the public app.
The exact Reddit RSS feed and exact official-page watcher are both more focused,
cost nothing per run, and make their evidence boundary easier to audit.

## Free official-page watcher

The NAS can check six exact first-party pages without Firecrawl, Tavily, an API
key, GitHub Actions minutes, or a Vercel invocation:

```sh
npm run fair:source-watch -- --live --fail-on-change
```

It observes:

- 2026 visitor information;
- the Fair FAQ;
- carnival pricing and promotions;
- parking and arrival information;
- the concert entry guide; and
- the official schedule page.

Only normalized content hashes, source URLs, timestamps, response sizes, and
statuses are retained. Page copy is transient. A change creates a private
review signal; it never modifies the Fair pack or public app.

The baseline and an immediate unchanged repeat both completed successfully on
September 1, 2026: six new baselines on the first run, then six unchanged pages
with zero errors on the second. The Reddit watcher likewise established 20
public post links, then found zero new discussions on its repeat.

## NAS cadence after deployment

Use DSM Task Scheduler only after this branch is merged and the NAS checkout is
updated to that release:

| Task | In season | Outside season | Alert condition |
| --- | --- | --- | --- |
| Official Fair pages | Daily at 6:10 a.m. Eastern | Weekly | Any changed page or retrieval error |
| Public Fair discussions | Every six hours | Weekly | A new matching public post or retrieval error |

The task account needs read/write access only to the Radius checkout and its
ignored reports directory. It does not need a GitHub token, Vercel token,
Supabase service key, Firecrawl key, or inbound internet port. DSM can notify
on a non-zero task result. A reviewer then opens the original source and makes
any public change through the normal reviewed PR path.

## First-party learning loop

Scraped discussion will always be incomplete and self-selecting. Fair Day
should also expose Radius's existing feedback intake on the public Fair route
with one focused prompt: “What did you wish you knew before arriving?” The
pathname provides the Fair context. Free text remains private, rate-limited,
and review-only. Repeated themes can then be counted without pretending they
represent every attendee.

The most valuable future prompts are:

- Which lot and gate did the visitor actually use?
- What was confusing before arrival?
- What was hard to find after entering?
- Did the saved-car return help work?
- What information failed when connectivity was weak?
- What would have made a family, mobility, sensory, or concert visit easier?

Do not collect precise car coordinates, movement history, ticket barcodes,
purchase details, children's information, or private contact data for this
research. A saved car point stays on the visitor's device only.
