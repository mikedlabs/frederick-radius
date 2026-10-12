# Data-confidence gate

**Status:** Living, reviewed 2026-10-08. This gate moved here from the June
2026 UX redo plan, now archived at `docs/archive/2026-06/UX_REDO.md`, because
it was the only part of that plan still in force. The code names below were
re-checked against the tree on 2026-10-08. `CLAUDE.md` wins if the two
disagree.

Trust is the product. This gate is not a phase. Every change to a surface that
shows data must pass it, and visual work does not ship ahead of the data it
presents. A confident wrong answer, such as a false "Open now", an invented
distance or a misplaced event, is worse than an honest "not confirmed". This
agrees with `docs/VISUAL_FIRST.md`: visual first does not loosen the honesty
rules, and a picture is held to the same standard as a sentence.

## Confidence tiers

Every fact the UI states carries one of three tiers, and the UI treats them
differently. The closest counterpart in code is `TrustLevel` in
`src/lib/trust.ts` (`verified`, `likely`, `unconfirmed`). The words a person
reads come from `src/lib/trust-language.ts`, never from the tier names.

- **Verified** means an official or curated source, or a check at the source
  inside the freshness window. A verified fact may be stated plainly, for
  example open now, hours or category.
- **Probable** means enriched data that is aging past the window. It may be
  stated only with a hedge and the date.
- **Unconfirmed** means a raw feed, OpenStreetMap or an unreviewed
  submission. It never asserts open, closed or another precise fact, and the
  UI says the fact is not confirmed.

## Shared trust primitives

Each primitive exists once and is used everywhere. None is restyled per
surface.

- **Source.** `SourceBadge` (`src/components/place/SourceBadge.tsx`) labels
  where a place record came from, and `TrustChip`
  (`src/components/ui/TrustChip.tsx`) renders the trust signal from
  `src/lib/trust.ts` for events, hours and other answers. Both read one
  vocabulary from `src/lib/trust-language.ts`.
- **Freshness.** `FreshnessChip` (`src/components/ui/FreshnessChip.tsx`)
  shows one age scale with one wording. A stale fact weakens the claim; it is
  never hidden.
- **Open status.** One engine, `getOpenStatus()` in `src/lib/hours.ts`, with
  `src/lib/googleHours.ts` parsing provider schedules. A plain open or closed
  claim needs verified hours. A posted but unconfirmed schedule may only say
  "Likely open · check hours", which is how the `/open-now` list uses it.
  Otherwise the line reads "Hours not confirmed" or "Hours not posted".

## Per-surface requirements

| Surface or element | Requirement |
| --- | --- |
| **Today** | Every answer it surfaces is traceable and fresh. No "open now" pick without verified hours. When confidence is low, hedge or leave the item out. Today never states what it cannot source. |
| **Places** | Category is shown as verified or inferred. Open status appears only when verified. Source and freshness appear on the card and the sheet. Records are deduplicated, and closed or nonexistent places are suppressed through `isOperational()` in `src/lib/loaders/places.ts`. Distance appears only with a known origin. |
| **Events** | Each event resolves to the correct `America/New_York` instant. Source and freshness are shown. A recurrence collapses to one series. Cancelled and postponed events are shown honestly. Civic items stay separate from the fun feed, and nothing is labeled "tonight" unless it is tonight. |
| **Map** | Pins appear only for valid coordinates (`npm run coord:audit`, backed by `src/lib/coord-audit.ts`). Open and closed pin states are honest. Overlays cite source and freshness. Filters and the visible count always agree. |
| **Radius** | Within reach reflects real travel time from the isochrone, not straight-line distance presented as a drive time. The origin is a real user location or a clearly stated assumed center, never an invented "8 min away". |
| **Source labels** | One vocabulary on every surface that shows data. |
| **Freshness** | One component and one age scale. Freshness is visible and never silently stale. |
| **Open status** | One rule and one engine. "Hours not confirmed" beats a confident lie. |
| **Categories** | One canonical taxonomy and one primary category per place. Inferred categories are flagged. A raw Google `primary_type` or a government department string is never rendered as a category. |
| **Municipalities** | Each place is assigned correctly, or as unincorporated. A town page shows only places in or near that town. Gaps in town coverage are tracked, not faked. |
| **Distance** | Distance is computed only with a known origin and shows its units. Travel time and straight-line distance are labeled differently. The UI never implies precision it does not have. |
| **Filters** | A filter and its result count always agree. Zero results show an honest empty state, never stale results. No filter silently does nothing. |
| **Empty states** | An empty state is designed, not accidental. It tells the truth ("Nothing is on the calendar tonight."), offers a real next move such as a nearby populated slice or a browse fallback, and never looks broken or still loading. |

## The PR question

Every PR description says which interaction law in `docs/NORTH_STAR.md` it
serves and how many taps it saves. A change to a data-bearing surface also
answers this question:

> What is the source, how fresh is it, and what does this show when the data
> is missing or unverified?

A PR that touches a data surface and cannot answer all three parts does not
merge.
