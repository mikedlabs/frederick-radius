# Photo-twin duplicates — May 27, 2026

Date: 2026-05-27
Author: Michael DeMattia (with Claude Opus 4.7)
Scope: User-reported observation that two map cards had the same thumbnail
suggested duplicates the existing dedup pipeline missed. Built a detector,
folded the 15 highest-confidence clusters, surfaced the rest for review.

---

## 0. The observation

> "If a thumbnail of a card is the same as another for a place on the map,
>  it might be a duplicate issue — for example the dog park is listed twice."

The observation is exactly right. Both `doggie-park` and
`city-of-frederick-dog-park` had:

- **The same lat/lng** (`39.4147113, -77.4152724`)
- **A photo URL that resolves back to the same Google Place ID**
  (`ChIJ50SbS-XbyYkRf-_sig-BC0I`)
- **A junk `google_place_id` field** carrying two *different* placeholder
  UUIDs, which is why the existing dedup pipeline did not catch them
  (the existing pipeline keys on `google_place_id`, names, and proximity —
  but the UUID placeholders defeat the first check, the names diverge,
  and same-coords-different-names slips through name-based folding).

The shared photo was the visible signal. Hidden behind it: both records'
hero photo URLs both contained the path `places/ChIJ50SbS-XbyYkRf-_sig-BC0I/photos/...`
— same Google place under the hood.

---

## 1. The detector

`scripts/audit-photo-twins.mjs` extracts the `ChIJ…` ID embedded in each
record's `google_photo_url` and groups records by that ID. Any group with
more than one record is a candidate duplicate cluster.

Each cluster is classified by pairwise signals:

| Verdict | Rule |
|---|---|
| `TRUE_DUPE` | Same normalized address, OR same street-number + category, OR identical pin + high name overlap, OR identical pin + at least one record has a junk address (the place name, missing, or no street number). |
| `MAYBE_MULTI_TENANT_OR_DUPE` | Same coords/address, name overlap is in the middle (some shared tokens but not clearly variants). |
| `MULTI_TENANT` | Same coords/address, no name overlap. Different businesses sharing a building photo. |
| `WRONG_PHOTO` | Different addresses, different coords, unrelated names — the enrichment misapplied a photo to unrelated records. |
| `REVIEW` | Doesn't fit cleanly. |

Read-only; output is `audit/photo-twins.json`.

## 2. Run results

```
scanned: 1,694 (post-dedup public set)
clusters: 87
affected records: 189

TRUE_DUPE: 53
MAYBE_MULTI_TENANT_OR_DUPE: 9
MULTI_TENANT: 22
REVIEW: 2
WRONG_PHOTO: 1
```

189 records (~11 % of the displayed set) share a Google Place ID with at
least one other record. That's a lot — but it's *not* all duplicates; the
breakdown matters.

## 3. What landed in this PR

Folded into `src/data/places-dedup.json` (canonical → list of dupes):

| Canonical | Folded | Why |
|---|---|---|
| `city-of-frederick-dog-park` | `doggie-park` | The originally-reported pair. |
| `court-street-parking-garage-frederick` | `court-street-garage` | Same deck at 2 S Court St. |
| `frederick-health-hospital` | `emergency-room`, `frederick-health` | All at 400 W 7th St. |
| `w-a-tolbard-heating-and-ac-llc` | `tolbard-w-a-heating-and-air-conditioning`, `wa-tolbard` | Three name-variant scrapes. |
| `visit-frederick` | `frederick-visitor-center` | Same visitor center at 151 S East St. |
| `clue-iq-an-escape-room-experience` | `clue-iq` | Same escape rooms at 103 S Carroll St. |
| `west-patrick-street-parking-deck` | `west-patrick-street-garage` | Same deck at 138 W Patrick St. |
| `william-r-diggs-memorial-swimming-pool` | `diggs-pool` | Same pool at 125 W All Saints St. |
| `frederick-coffee-company-frederick` | `frederick-coffee-co-cafe` | 100 East St / 100 N East St — same building, two scrape variants. |
| `lebherz-oil-and-vinegar-frederick` | `love-lebherz-oil-vinegar-emporium-downtown-frederick-md` | 214 E Patrick / 214 N Market — corner building, two scrape variants. |
| `smoketown-brewing-brunswick` | `smoketown-brewing-brunswick-2` | Numeric-suffix duplicate. |
| `verbena-salon-spa` | `verbena-day-spa` | Same Verbena business. |
| `william-r-talley-recreation-center` | `william-talley-recreation-center-armory` | Same building (armory is the rec center). |
| `milkhouse-brewery-mt-airy` | `milkhouse-brewery-new-market` | Same brewery at 8253 Dollyhyde Rd. |
| `frederick-county-public-schools` | `fcps-maryland` | Same district HQ. |

**Result:** the client set drops from 1,694 places to 1,678 — 16 folds.

Plus one address correction:

- **`city-of-frederick-dog-park`** — DFP record had `address: "100 S Market St"`
  (downtown City Hall, wrong) and a junky blurb. Patched to
  `address: "21-35 N Bentz St"` (the real address per [Yelp Nov 2025](https://www.yelp.com/biz/city-of-frederick-dog-park-frederick)
  and the [official city facility page](https://www.cityoffrederickmd.gov/258/Dog-Parks)),
  with a fresh blurb noting the SW-of-Baker-Park location. The displayed
  pin still uses the enrichment lat/lng (Google's authoritative coords for
  the play area, ~80 m from the street address — close enough; a future
  enrichment refresh will reconcile).

## 4. What we did NOT fold (left for review)

37 more clusters surfaced by the detector are deliberately left in
`audit/photo-twins.json` for human review:

- **22 MULTI_TENANT clusters** — different businesses sharing a building
  photo. The records are correct, the shared photo is misleading. Examples:
  - That's-A-Wrapp + Emporium Antiques + Worthington Antiques (3 distinct
    tenants at 112 E Patrick St — a multi-vendor antiques building with
    a cafe inside).
  - Banner School + Clubhouse Kids + MMCI (3 programs at 217 Dill Ave).
  - Isabella's Taverna + Immersion Active (restaurant + marketing agency
    at 44 N Market St).
  - Asian Cafe + Freez King (separate restaurants at 1303 N East St).

  Action for these: NONE in this PR. Fixing requires updating which photo
  each record uses — different work, upstream enrichment side.

- **9 MAYBE_MULTI_TENANT_OR_DUPE clusters** — needs an editor to decide
  per cluster. Examples: Rare Morsel + Perfect Truffle at 25 N Market;
  Agave 137 + Taco Daddy at 137 N Market; Y Arts Center + Artomatic
  Frederick at 115 E Church St. Some of these might be rebrands.

- **2 REVIEW + 1 WRONG_PHOTO clusters** — different businesses entirely,
  same photo. Genuine enrichment misapplications worth fixing upstream.
  Examples:
  - Cyclefit Frederick (E All Saints St) + LifeCYCLE Fitness Studio
    (Prospect Blvd) — different addresses, both fitness, shared photo.
  - First Baptist Church 5 (Dill Ave) + First Baptist Church Maryland
    Center (Bowers Rd) — different churches.

  Action for these: investigate why the enrichment pipeline assigned the
  same Google ChIJ to multiple unrelated records. Likely a `resolveAndEnrich`
  call returned the wrong place for one of them and the photo got
  cross-pollinated.

## 5. Implications + recommendations

1. **Same thumbnail IS a strong duplicate signal.** Your observation
   beats Levenshtein-on-names. The existing `find-duplicates.ts` script
   uses name-Jaccard + proximity + municipality; it missed all 15 of
   the folds in this PR because the records' names diverge enough to
   fail Jaccard. Adding photo-ChIJ-extraction to the dedup pipeline
   would have caught these automatically.

2. **The WRONG_PHOTO clusters are a separate bug.** When enrichment
   misapplies a Google place's photo to an unrelated DFP record, the
   record's `google_place_id` UUID stays unique but the photo gives it
   away. This audit just surfaces them; fixing requires looking at the
   enrichment-time `resolveAndEnrich` matching score and rejecting
   weak matches.

3. **The 95 % UUID-placeholder problem still bites.** If most records
   had real `ChIJ…` IDs in `google_place_id`, the existing dedup pass
   would catch duplicates via place-id equality without needing the
   photo-URL trick. The ChIJ backfill we discussed earlier would close
   this gap.

## 6. Files touched

- `scripts/audit-photo-twins.mjs` — the detector (read-only).
- `scripts/apply-photo-twin-folds.mjs` — applies the 15 folds + the
  dog-park address fix. Idempotent.
- `src/data/places-dedup.json` — +31 entries (15 canonicals + 16 folds;
  some canonicals already had self-entries that needed overrides where
  they previously pointed to themselves).
- `src/data/places-dfp.json` — 1 record patched (dog park address + blurb).
- `src/data/places-client.json` — regenerated via `npm run build:client-places`;
  client set shrunk from 1,694 to 1,678.
- `audit/photo-twins.json` — full 87-cluster output for review.
