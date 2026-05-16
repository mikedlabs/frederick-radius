# Decisions

Structural decisions and reasoning. One entry per decision. Newest first.

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
