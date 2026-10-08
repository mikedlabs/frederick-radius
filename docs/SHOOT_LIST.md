# Shoot list

**Status:** Proposed, 2026-10-07. Build step 6 of `docs/VISUAL_FIRST.md`.
**Owner:** Mike D. Every frame is published with a credit and a capture date,
and keeps its geotag so captions come from where it was taken.

## Shoot where people actually look

Vercel Web Analytics, August 8 to October 6, 2026 (production, all devices):

| Surface | Pageviews | Share |
| --- | ---: | ---: |
| /today | 1,879 | 39% |
| /moments/great-frederick-fair-2026 | 562 | 12% |
| /events | 435 | 9% |
| /map | 308 | 6% |
| /compass | 229 | 5% |
| /events/[slug], all events together | 141 | 3% |
| /places/[slug], all places together | 137 | 3% |

The site logged 4,795 pageviews in that window, 63% of them on phones. The
most-viewed place page had 9 views. Weekly pageviews ranged from 1,214 in the
week of August 17 down to 241 in the week of September 28.

So the camera goes to Today and to the big moments, not to individual
businesses. A place page is a long-tail visit, and its picture should come
from the self-hosted mini map (already built) and, if public claiming is
turned back on, from the business itself through a reviewed upload (see the
last section). Photographing every place in the catalog would take weeks for
pages that see a few visits a month.

## 1. Today's photo band, by season and time of day

Today shows one owner photo at the top on every visit, at every hour. The
archive has 104 geotagged frames, all within 4.3 km of downtown Frederick.
Counted by Eastern capture time:

| Season | Morning (5 to 11) | Midday (11 to 4) | Evening (4 to 8) | Night (8 to 5) |
| --- | ---: | ---: | ---: | ---: |
| Spring | 15 | 1 | 3 | 3 |
| Summer | 7 | 4 | 8 | 7 |
| Fall | 16 | 5 | 7 | **1** |
| Winter | 12 | 5 | 8 | **2** |

At 10:53 PM on October 6, Today showed a June frame of Carroll Creek. The gaps
that put a wrong season on screen most often:

1. **Fall at night, downtown Frederick.** One frame exists. Shoot October and
   November: Carroll Creek, Market Street and the steeples after dark.
2. **Winter at night.** Two frames exist. Shoot December to February,
   including the holiday lights downtown.
3. **Spring midday and evening.** One midday frame and three evening frames.
   Shoot April and May.
4. **Fall midday.** Five frames; two or three more give the rotation room.

Each frame should leave the top 60 px and the lower third calm, because the
band is planned to carry the dateline and weather inside it.

## 2. Towns with no photo at all

Seven towns have a verified, credited Wikimedia photo (Frederick, Brunswick,
Thurmont, Middletown, Emmitsburg, New Market and Walkersville). Six have no
photograph anywhere in the product:

- Mount Airy
- Myersville
- Woodsboro
- Burkittsville
- Rosemont
- Urbana

One honest daytime frame of each town's main street or landmark covers it.
Owner photos can then replace the Wikimedia frames over time.

## 3. Moments

The Great Frederick Fair moment was the most-viewed page after Today. Moments
are where owner photography is the product, so the recurring ones are worth a
planned shoot each year:

- **Catoctin Colorfest, Thurmont, October 10 and 11, 2026.** This weekend. It
  is the featured event, and Thurmont has only a Wikimedia photo.
- In the Streets, Frederick (18 moment pageviews this year).
- The Great Frederick Fair, September 2027.

## 4. Parks and trails

/parks did not register among the top 40 routes in the window, so this comes
last. When it is shot, start with the best-known county parks: Baker Park,
Gambrill State Park, Cunningham Falls and the Catoctin Mountain trails.

## Not a shoot: business photos

Public business claiming is off. `src/app/business/claim/page.tsx` is a
coming-soon page, and its header comment makes turning claiming on a deferred
owner decision. `/business/manage/[token]` opens only for a claim an admin
already approved, so no new owner can reach it or add a photo.

Pending owner call: turn public business claiming back on so owners can add a
reviewed photo, or keep it off and remove the business photo upload from
build step 6 of `docs/VISUAL_FIRST.md`?

If claiming returns, a reviewed upload on the manage page is the right supply
for place pages: owned, free, current, and credited to the business. It is a
product feature to build, not something to photograph, and it waits until
that call is made.
