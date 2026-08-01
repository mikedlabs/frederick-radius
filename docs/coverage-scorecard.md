# Coverage scorecard

Per-municipality place coverage + enrichment depth, generated from the
published client set, source schedules, enrichment, and field notes.
A stored schedule is inventory; published fresh hours are the schedules
currently allowed to support an open-now claim. Regenerate with
`npm run coverage:scorecard`. The Downtown-Frederick centre of gravity
(BACKLOG Cluster A) is the share of the dataset in the first row.

_Generated 2026-07-28 — 1613 places._

| Municipality | Places | Stored schedule | Published fresh hours | With rating | Publishable photo | Field-notes | Local favorites |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frederick | 854 | 680 (80%) | 84 (10%) | 713 (83%) | 716 (84%) | 50 | 299 |
| Thurmont | 116 | 80 (69%) | 12 (10%) | 105 (91%) | 104 (90%) | 4 | 33 |
| Brunswick | 97 | 65 (67%) | 6 (6%) | 85 (88%) | 78 (80%) | 2 | 24 |
| Walkersville | 87 | 66 (76%) | 14 (16%) | 81 (93%) | 78 (90%) | 2 | 29 |
| Middletown | 85 | 52 (61%) | 8 (9%) | 72 (85%) | 74 (87%) | 4 | 27 |
| New Market | 78 | 52 (67%) | 3 (4%) | 65 (83%) | 62 (79%) | 4 | 13 |
| Mount Airy | 67 | 52 (78%) | 8 (12%) | 62 (93%) | 62 (93%) | 5 | 28 |
| Emmitsburg | 59 | 41 (69%) | 9 (15%) | 54 (92%) | 53 (90%) | 2 | 19 |
| Myersville | 56 | 41 (73%) | 5 (9%) | 49 (88%) | 49 (88%) | 3 | 17 |
| Woodsboro | 42 | 23 (55%) | 3 (7%) | 33 (79%) | 30 (71%) | 2 | 12 |
| Burkittsville | 37 | 18 (49%) | 1 (3%) | 35 (95%) | 37 (100%) | 2 | 10 |
| Urbana | 31 | 20 (65%) | 6 (19%) | 23 (74%) | 25 (81%) | 2 | 9 |
| Rosemont | 4 | 1 (25%) | 0 (0%) | 3 (75%) | 3 (75%) | 0 | 2 |
| **Total** | **1613** | 1191 (74%) | 159 (10%) | 1380 (86%) | 1371 (85%) | **82** | **522** |

## Hours refresh artifact

This is the committed rolling snapshot that strict `Open now` claims read.
Stored source schedules above are inventory only; they do not make this
artifact current.

| Check | Count |
| --- | ---: |
| Public Google-backed places expected in the seven-day cycle | 1524 |
| Snapshot rows | 216 |
| Rows matched to the public set | 212 |
| Rows carrying a schedule | 167 |
| Rows refreshed within policy, including status-only results | 212 (13.9%) |
| Rows fresh within policy | 167 (11%) |
| Seven-day cycle state | warming |
| Cycle buckets meeting the minimum write ratio | 1 / 7 |
| Stale rows | 0 |
| Invalid verification timestamps | 0 |
| Unmatched rows | 4 |

Oldest refresh: 2026-07-27T12:49:47.617Z. Newest refresh: 2026-07-27T12:49:47.617Z.

| Cycle day | Expected places | Refreshed within policy | Fresh schedules | Minimum met |
| ---: | ---: | ---: | ---: | --- |
| 0 | 225 | 0 | 0 | no |
| 1 | 200 | 0 | 0 | no |
| 2 | 221 | 0 | 0 | no |
| 3 | 240 | 0 | 0 | no |
| 4 | 212 | 212 | 167 | yes |
| 5 | 234 | 0 | 0 | no |
| 6 | 192 | 0 | 0 | no |

The first complete seven-day pass is still warming up. Missing buckets are visible, but they are not called failed until the cycle window has elapsed.

Live recovery path:

1. Apply `drizzle/0024_place_hours_refresh.sql` and `drizzle/0034_expose_place_hours_refresh_read_only.sql` in Supabase.
2. In Vercel Production, set `HOURS_REFRESH_CRON=1`, `GOOGLE_PLACES_API_KEY`, `DATABASE_URL`, and `CRON_SECRET`.
3. Confirm `/api/cron/hours-refresh` reports `enabled: true` and writes rows.
4. In GitHub Actions, add browser-safe repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the 09:00 UTC data-steward job reads the snapshot through Supabase's read-only Data API after the 08:00 UTC Vercel writer.
5. Review and merge the bot PR containing `places-hours-refresh.json` and the rebuilt client snapshot.

## Committed event quality

This table covers the curated event rows committed with the app. Runtime
feed health remains a separate hosted check because live events are assembled
after deployment.

| Gap | Count | Why it matters |
| --- | ---: | --- |
| Missing category | 0 | The event cannot enter a useful browse lane. |
| Placeholder category | 0 | Generic labels hide the event's real purpose. |
| Missing venue name | 0 | A user cannot tell where to go. |
| No native venue join | 9 | Radius cannot inherit venue details; review whether a standalone event location is intentional. |
| Area-centroid location | 1 | The event may be listed, but must not claim precise distance. |
| Unknown location | 0 | The event should not appear on a precise map. |
| Invalid time | 0 | The event cannot be ordered safely. |
| Zero duration | 0 | Often signals a lost end time. |
| End before start | 0 | The schedule is internally contradictory. |

Category distribution (41 rows): arts: 8, family: 5, market: 1, music: 25, outdoors: 1, theater: 1.

## Core amenity coverage by town

The committed OpenStreetMap baseline has 843 points.
Approved `field_amenities` rows are merged from Postgres at runtime and are
not copied into this repository report, so the field count here is
0. Audit live field rows in the owner desk before
calling a town complete. A zero means “not mapped in the committed baseline,”
not proof that the amenity does not exist.

| Town | Restroom | Water | Trash | Dog bags | Bench | Power |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Frederick City | 7 | 7 | 7 | 0 | 167 | 0 |
| Brunswick | 0 | 3 | 6 | 1 | 32 | 0 |
| Thurmont | 0 | 14 | 2 | 1 | 3 | 0 |
| Middletown | 0 | 2 | 0 | 0 | 2 | 0 |
| Walkersville | 0 | 1 | 0 | 0 | 2 | 0 |
| Emmitsburg | 0 | 1 | 16 | 0 | 59 | 0 |
| New Market | 0 | 0 | 0 | 0 | 1 | 0 |
| Mount Airy | 0 | 0 | 0 | 0 | 0 | 0 |
| Myersville | 0 | 6 | 1 | 0 | 23 | 0 |
| Woodsboro | 0 | 0 | 0 | 0 | 0 | 0 |
| Burkittsville | 0 | 1 | 0 | 0 | 0 | 0 |
| Rosemont | 0 | 0 | 18 | 0 | 9 | 0 |
| Urbana | 0 | 0 | 1 | 0 | 6 | 0 |

There are 50 empty town/kind cells in the committed baseline.

## Brewery media trust

The beer guide tracks 17 breweries. Source photo
candidates exist for 16; only candidates with
exact individual source metadata pass the publishing policy and use the
no-store photo transport.

| Check | Count |
| --- | ---: |
| Exact-attribution photos publishable now | 16 |
| Source candidates waiting for attribution | 0 |
| Breweries without a source candidate | 1 |

Preferred operator path: in GitHub Actions, run **Google photo attribution
backfill** with a reviewed limit. The first 16 eligible candidates are the
brewery rows. This requires `GOOGLE_PLACES_API_KEY`; the workflow rebuilds
the public data, runs the photo-policy tests, and opens a review PR.

The equivalent local command is
`npm run backfill:photo-attributions -- --limit 16 --live --confirm`.
Review the paid request ceiling before running it. The beer page will pick
up each exact-attribution photo after the generated data PR is merged.
