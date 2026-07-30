# Answer audit — 4,317 persona queries (2026-07-30)

## Method

Not roleplay. A harness drives the app's **real** answer stack — the same
three sources `SearchOverlay` calls — with a generated corpus:

- `findQuickAnswers()` (quick-route intents)
- `findDepartments()` (buried government)
- `searchIndex()` (ranked places, events, towns, categories, app pages)

The corpus is 15 personas × 90 distinct needs × natural phrasings
("{n}", "{n} near me", "where can i get {n}", "best {n} in frederick",
"i need {n}", "closest {n}", …) plus town-scoped variants across all 13
municipalities. Each need carries a machine-checkable expectation
(satisfying category, title pattern, surface href, or result type).

Verdicts: **PASS** expected answer in top 3 · **WEAK** in 4–12 ·
**FAIL** results but none right · **EMPTY** nothing at all.

## Result

| | before | after |
|---|---|---|
| PASS | 74.5% | **87.1%** |
| WEAK | 10.7% | 6.4% |
| FAIL | 12.4% | 5.8% |
| EMPTY | 2.4% | 0.6% |

Worst personas before → after: Faith 39% → 96%, New resident 68% → 90%,
Foodie 68% → 88%, Student 73% → 92%.

## What was actually broken

**1. No everyday-word → catalog-vocabulary layer.** The catalog is filed
under 35 category slugs and Google-derived names; people speak neither.
`prescription` (category `pharmacy`), `sunday service` (`worship`),
`a show` (`theater`), `atm` (`services`) returned nothing or noise.

**2. The typo net answered confidently with nonsense.** The trigram
fallback fires when exact ranking finds no place, with no length
guard — so `kayaking` returned King's Pizza and Burger King, and
`barbecue` returned three barber shops. Worse than an empty state,
because it looks like an answer.

**3. The MVA was unreachable.** `findDepartments` matched the whole query
as one substring, so bare `mva` worked but `dmv`, `drivers license`, and
`where is the mva` dead-ended — and there is no place row for it.

## Fixes shipped here

- `src/lib/search/synonyms.ts` (new) — spoken need → `cats` (the need IS
  a category, boost it) + `terms` (the need is a topic inside a broad
  category; evidence required, so "barbecue" never promotes all 165
  restaurants). Unit-tested.
- `src/lib/search/fuzzy.ts` — length-ratio floor (0.6) on typo matching.
  Keeps every real correction (thurmount→Thurmont is 0.89), rejects the
  short-word coincidences (king→kayaking is 0.5).
- `src/data/departments.ts` — MVA hint terms, so the vehicle questions
  reach the verified state line.

Verification: `npx tsc --noEmit` clean · `npx eslint` clean on changed
files · full vitest suite 4,406 passed / 0 failed.

## Remaining gaps that code cannot fix — these need verified data

Confirmed absent from `places-client.json`, listed in impact order.
Each needs the normal verify gate before it is added.

| Gap | Evidence | Note |
|---|---|---|
| **No mosque anywhere** | 0 rows match islam/mosque/masjid | The Islamic Society of Frederick is already an *event* feed source (PR #1084) but has no place row. Faith persona's last hole. |
| **Pharmacies: 4 rows** | all CVS + Whitesell | No Walgreens, Rite Aid, Walmart/Giant/Weis counters. |
| **Post offices: 1 row** | literally named "Post Office" | County has many; `/shipping` carries the surface. |
| **Public safety: 5 rows** | 1 police + 4 fire companies | No Sheriff's Office row; most fire companies missing. |
| **Urgent care: 2 rows** | both Frederick Health | No Patient First / MedExpress equivalents. |
| **Chabad of Frederick miscategorized** | filed `civic`, not `worship` | Fix via `places-overrides.json` patch + rebuild. |

## Known limits of this audit

- Events were ranked against the **curated seeds**, not the live unified
  set the server passes in production. Event-goer numbers (69%) are a
  floor, not the real figure.
- Some expectations are deliberately loose (any restaurant satisfies
  "kid friendly restaurant"), so the headline overstates quality on
  taste-based needs. The structural findings above do not depend on those.
- Harness lives in the session scratchpad, not the repo.
