# Decisions

Structural decisions and reasoning. One entry per decision. Newest first.

## 2026-05-16: Data-quality flags flipped to default ON ("ship everything")

The owner directed shipping everything after a long period in which
correct, tested data-quality work was built behind flags that defaulted
off and the flip was deferred each time. That deferral loop became the
problem: the live site did not reflect the work.

Decision: invert the defaults for the proven flags so the work is
active in production without a Vercel env change: RADIUS_DEDUPE,
RADIUS_EVENT_NOISE_FILTER, RADIUS_EVENTS_BY_TOWN, and HOURS_GATE now
read `!== "0"` (default on). Each keeps an escape hatch: set the env
var to "0" for an instant, code-free rollback. This reverses the
earlier "flags default off equals today's production is the rollback
path" posture, which was prudent but had compounded.

Consequence to note honestly: at today's roughly 3.6 percent
verified-hours coverage, HOURS_GATE on hides the Open-now affordance
widely in favor of an honest message. That is the trustworthy behavior
the data-layer brief asked for, and it is reversible with HOURS_GATE=0.
RADIUS_OBDB stays off because the brewery source is not yet surfaced;
flipping it would change nothing visible.

## 2026-05-16: Mapbox funded, map migrated MapLibre to Mapbox GL

The owner funded a Mapbox account and provided a public token, reversing
the earlier "Mapbox deferred" ruling. This is the P1 audit-remediation
foundation: P1-1 static placeholder, P1-3 isochrone, P2-1 Studio style,
P2-5 search box, and P3-3 directions all require Mapbox.

Changes: react-map-gl swapped from the maplibre entrypoint to the mapbox
entrypoint; mapbox-gl added; AppMap and PlaceMiniMapInner pass
mapboxAccessToken from NEXT_PUBLIC_MAPBOX_TOKEN. Interim base style is
mapbox://styles/mapbox/dark-v11, which aligns with the System Black brand
target; the custom Frederick Radius Studio style is P2-1, an owner-only
manual workflow whose published URL replaces the interim style when
ready. applyFrederickPalette is Positron-specific and now no-ops safely
on the Mapbox style (it iterates existing layers with guarded writes).
categoryMarkers re-adds its runtime icon images on style.load because
Mapbox loads its style asynchronously after onLoad, unlike OpenFreeMap.

Verified: tsc, vitest, node:test, and a browser screenshot showing the
dark base with category pins rendering. The transient styleimagemissing
warnings during first paint are the original code's documented one-frame
flash, mitigated by the style.load re-add, not a functional defect.

## 2026-05-16 — Stack ruling made: proceed on MapLibre, Mapbox deferred

The Checkpoint 1 stack question went unanswered across three requests
while the directive each time was maximum visual impact. Mapbox plus
Mapbox Studio cannot be built without a paid account and a manual Studio
workflow that only the owner can create, so waiting blocks all visual
progress indefinitely.

Decision: proceed on MapLibre and OpenFreeMap and push them to their
visual ceiling (custom style overrides, terrain and hillshade where the
free tiles allow, refined palette, motion). This is reversible. If
Mapbox is funded later, the style work ports and the migration is its
own phase. Reasoning: a perfectly good free path exists, and an
unanswered decision should not freeze the product's biggest visual win
forever. Recorded as a deviation per the brief.

## 2026-05-16 — Admin review decisions persist as committed JSON, not runtime writes

Vercel serverless storage is read-only at request time. An /admin route
cannot write a decisions file that survives. Rather than ship a writer
that fails silently in production, the admin tooling is a review surface.
Dedup overrides live in `src/data/dedup-decisions.json` and copy
rewrites in `src/data/copy-overrides.json`. They are committed and
applied by `npm run dedup` and `npm run copy:scores`. The nightly cron
recomputes and reports the numbers; it does not persist artifacts.

Reasoning: this matches how every place, enrichment, and dedup record
is already persisted in this codebase. A future phase may add a Supabase
table for live editorial workflow, which is an additive change recorded
here when made.

## 2026-05-16 — Map stack stays MapLibre and OpenFreeMap until a Phase 3 ruling

The brief's canonical stack names Mapbox GL JS, a custom Mapbox Studio style, and deck.gl. The repository runs MapLibre GL 5.24, react-map-gl 8.1, and OpenFreeMap Positron tiles, with a runtime palette override. Mapbox and deck.gl are absent.

Decision: keep MapLibre and OpenFreeMap for Phase 1 and Phase 2. Phase 1 is data quality with no visual work, so the map vendor is irrelevant to it. The Mapbox migration is a funded, key-gated, manual Studio workflow and a strategic call. It is recorded here as OPEN and must be ruled at the Phase 3 checkpoint before any Phase 3 map work begins.

Reasoning: migrating the map vendor speculatively would burn budget and time before the data spine is fixed, which the brief's anti-pattern 13 forbids in spirit. Deferring costs nothing because no Phase 1 or Phase 2 work depends on it.

## 2026-05-16 — Paid API keys deferred to their gating phases

PredictHQ, Algolia or Typesense, Stripe, Twilio, SafeGraph or Placer, Cloudinary or Imgix, Geocodio, Google Civic Information, Open States, Eventbrite, Ticketmaster, and Bandsintown are not present.

Decision: none are required for Phase 1. Each is requested at the start of the phase that needs it, per working rule 4. Status tracked in INTEGRATIONS.md as that file is built out.

## 2026-05-16 — CMS choice deferred to Phase 1 close or Phase 2

The brief asks to choose Sanity or Payload in Phase 1. Editorial copy infrastructure in Phase 1 (the copy-review tooling) can be built against the existing static data and a new Supabase table without committing to a CMS yet.

Decision: defer the Sanity vs Payload choice until the copy-review tooling shape is known. Record the choice here when made. Reasoning: choosing a CMS before the editorial workflow is designed risks a wrong fit.

## 2026-05-16 — Deploy of the 14 unpushed commits is the user's call

Local main is ahead of origin by 14 commits, including this session's work. Pushing and deploying is a shared, hard-to-reverse action.

Decision: do not push without an explicit instruction. Surface the need at Checkpoint 2, since Phase 1 results are invisible in production until the tree ships. Reasoning: deploy timing is an owner decision, not an engineering default.
