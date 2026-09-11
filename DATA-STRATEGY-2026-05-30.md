# Frederick Radius — Data Sourcing and Cleaning Strategy

**Written:** 2026-05-30 · companion to `REVIEW-2026-05-30.md`.
**Grounded in live data:** the numbers below are measured from `places-client.json` (1,677 live places) and a real pull of Overture Maps release 2026-05-20.0 for the county bbox, not estimated. Re-run `node scripts/data-scorecard.mjs` and `python3 scripts/overture/pull_and_reconcile.py` to refresh them.

---

## The reframe

You asked how to find and use the best data sources. The honest finding: you do not have a discovery problem. `data/sources.yaml` already maps 71 sources with a real status taxonomy (11 active, 15 scaffolded, 39 pending approval, 5 pending review), including Frederick County ArcGIS, the full City of Frederick GIS catalog, MD iMAP, GTFS, Census, and restaurant inspections. That is a more complete source map than most civic apps ever build.

You have two real problems instead:

1. **Activation.** 54 of 71 sources are mapped but not flowing. The value is locked behind a status flip plus a schema and transform, not behind research.
2. **Two free modern POI datasets are missing entirely**, and they are the ones that change your cost structure: Overture Maps and Foursquare Open Source Places.

And one real cleaning problem, now that the data is measured: descriptions. Everything else is in better shape than the old audit claims.

---

## What the data actually looks like now (measured, not assumed)

The May-15 audit said hours coverage was 3.6%. That is stale. After your Google enrichment run, the live numbers are:

| Field | Coverage | Read |
|---|---|---|
| Verified hours | 79.6% | the "open now" gate is fine now, not broken |
| Rating | 96.5% | strong |
| Photo | 93.4% | strong |
| Website | 88.7% | good, Overture can close the gap for free |
| Phone | 88.0% | good, same |
| **Thin blurb (<40 chars)** | **56.5%** | the one real mass problem |
| **Placeholder "X in Town" blurb** | **40.9% (686 places)** | the most visible quality issue |
| Remaining same-name duplicates within 200m | 0 | your dedup pipeline works |
| Off-bbox or null-island coordinates | 0 | the loader filters these |

Translation: the catalog is healthy. Hours, ratings, photos, dedup, and coordinate sanity are handled. The single thing dragging perceived quality is that four in ten places still say "Coffee in Thurmont" instead of a real sentence. Fix descriptions and the catalog reads premium.

---

## Sourcing strategy

### 1. Add Overture and Foursquare as a free enrichment and validation layer (not a bulk import)

Both are now generally available, free, and permissively licensed:

| Source | License | Scale | Refresh | Carries |
|---|---|---|---|---|
| Overture Maps places | CDLA Permissive 2.0 | 17,319 in Frederick County | monthly | name, category, website, phone, socials, address, confidence, `operating_status` |
| Foursquare OS Places | Apache 2.0 | 100M+ global | monthly | name, category, contact, socials, `date_closed` |

A real pull (8 seconds, no key, no cost) reconciled against your catalog produced:

- **80% of your catalog matched** to an Overture place within 120m. Both datasets agree, which is the validation you want.
- **109 contact fills** ready: catalog places missing a website or phone that Overture supplies. Saved as `docs/audits/2026-05-30-overture-contact-fills.json`.
- **65 geocode suspects**: a same-name Overture record sits more than 250m from your pin. This is your "157 mis-geocoded DFP pins" problem turned into a finite review list.
- **7,018 net-new high-confidence places.** Do not be seduced by this number. The sample is 7-Eleven, NAPA Auto Parts, Terminix, insurance agencies. That is precisely the B2B and chain tail your `isNonDiscoverable` relevance filter already suppresses, and Overture has its own duplicates inside it. Overture is not a curation shortcut.

The correct use: a nightly or weekly reconciliation that fills contacts, validates coordinates against an authoritative second opinion, and feeds `operating_status` into your existing closed-business suppression. Run net-new through the same relevance and substance gates the catalog already enforces, never raw.

**One honest correction to my earlier claim:** neither Overture nor Foursquare carries opening hours. Overture has `operating_status` (open/closed) but not daily hours. Hours stay a Google Place Details or owner-submission job.

### 2. Reallocate the Google budget

This is the cost insight. You spent about $150 enriching website, phone, category, hours, photos, and ratings from Google. Overture now gives you website, phone, category, and a closure signal for free, at ten times the coverage. So:

- **Stop** paying Google for website, phone, and category. Overture covers them.
- **Spend** Google only on the three things Overture lacks and you actually need: hours, photos, and ratings, and only for high-traffic places (downtown, the towns, anything a user is likely to open). Your `BUSINESS_STATUS_CRON` cap of 40 calls per run is the right instinct; point those calls at hours refresh, not re-fetching contacts you can get free.

### 3. Activation priority for the 39 pending sources

Rank by value over effort, not alphabetically. Tiers:

**Tier 1, activate now (free, authoritative, and they clean your existing data):**

- City of Frederick GIS: address points, parcels, geocoder (`cof_addresses`, `cof_parcels`, `cof_geocoder`). These are the authoritative fix for the 65 geocode suspects. Snap pins to parcels, do not guess.
- Frederick County ArcGIS parks and trails (`fc_parks_trails`). Your `/parks` and `/trails` pages are editorial-only today; this makes them live.
- TransIT GTFS (`transit_gtfs`). `/transit` is marked half-working precisely because it has no live data. GTFS static is a one-file parse.
- Farmers markets (`usda_farmers_markets`, `md_farmers_markets`) and libraries (`fcpl_libraries`). Free, public, fill real categories.

**Tier 2, the Plan-tab fix (events):**

- Eventbrite (`eventbrite_frederick`), Visit Frederick (`visit_frederick`), Songkick (`songkick`), college athletics, library programs. `/events` is your weakest core tab because the feeds are thin. These are the fill. Some need a key or an outreach email, which is faster than engineering.

**Tier 3, trust and texture:**

- Restaurant inspections (`fc_restaurant_inspections`) is a genuine differentiator. Nobody else surfaces a health score next to a restaurant. High trust signal, unique to a civic app.
- Meeting agendas, snow removal, development review: civic depth for the residents who live there.

---

## Cleaning strategy, in priority order

### Lane 1 — Descriptions (the only mass problem left)

686 placeholder and 947 thin blurbs. This is the highest-visibility cleaning win and you already have the tool: `scripts/extract-known-for.mjs` runs gpt-4o-mini through the Vercel AI Gateway. Extend that pattern to a description pass.

- **Input per place:** name, category, town, plus the real signal you already hold: Google `editorial_summary`, `review_snippet`, Overture category, and `known_for` tags.
- **Rule:** rewrite only when the current blurb matches the placeholder pattern or is under 40 characters. Never overwrite a curated `seed` or `manual` blurb. Idempotent, like the known-for script.
- **Cost:** roughly 1,600 short completions on a mini model, a few dollars total. Gate it behind a flag and a `data:review` step so a human can spot-check before it ships.
- **Guardrail:** the style lint already in CI (`npm run style:lint`) catches em dashes and banned words in the output. Run it on the generated copy.

### Lane 2 — Contact fills (free, ready today)

Apply the 109 Overture website/phone fills through the existing `places-overrides.json` plus `npm run data:review` workflow. Additive, human-gated, lands on every surface through the one canonical loader. The JSON is already written.

### Lane 3 — Geocode accuracy

Review the 65 suspects against City of Frederick parcels and address points once Tier 1 is activated. Authoritative local geometry beats a Google text-match every time. This retires the mis-geocoded-pin class of bug for good.

### Lane 4 — Closure freshness

Feed Overture `operating_status` and Google `business_status` together into the existing `isOperational` predicate. Two independent closure signals are stronger than one, and Overture refreshes monthly for free.

### The loop

Run `node scripts/data-scorecard.mjs --md` before and after each pass. The placeholder percentage is your headline metric. Watch it fall from 40.9% toward zero. That single number is a better progress signal than any vibe check.

---

## The architectural through-line

Every reconciliation in this document is currently a JavaScript grid-walk over JSON in a script. That is fine for a weekly batch. It becomes trivial the moment places live in Postgres (see `REVIEW-2026-05-30.md`, P1.1): the Overture match is a spatial `ST_DWithin` join against an `overture_places` import table, the contact fills are an `UPDATE ... WHERE website IS NULL`, and the scorecard is a view. The data work and the database migration are the same project from two directions. Do the migration and this pipeline gets shorter, not longer.

---

## What I shipped with this doc

- `scripts/data-scorecard.mjs` — the repeatable quality scorecard. Run anytime.
- `scripts/overture/pull_and_reconcile.py` — the live Overture pull plus reconciliation. No key, no cost.
- `docs/audits/2026-05-30-scorecard.md` — today's baseline.
- `docs/audits/2026-05-30-overture-reconciliation.md` and `-contact-fills.json` — the 109 fills, 65 geocode suspects, and net-new counts.
- Overture and Foursquare registered in `data/sources.yaml`.
