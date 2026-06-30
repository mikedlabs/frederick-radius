# Frederick Radius — the Community Layer (vision + plan)

_A crowdsourced, real-time layer of local truth — Waze for civic life — built on
the `/collect` foundation. Captured June 2026._

## The thesis

Frederick Radius is an **answer engine, not a directory**. Today those answers
come from curated data + scraped feeds. The Community Layer adds a third, more
powerful source: **people on the ground, in real time.** A contribution makes
the map smarter → smarter answers pull more users → more users contribute. The
report is not the product; the **fresher, more honest local truth** is.

We already built most of the bones in `/collect` + `field_amenities`: a typed
point model, a `status` moderation switch, photos, edit/delete, passcode gating,
and a live map layer. The Community Layer generalizes that from "fixed amenity
types" to "anything a person sees."

## Three classes of data (the core model)

1. **Permanent infrastructure** — `field_amenities` today. Trash, water, benches,
   EV, outlets, dog stations, restrooms. Stable; trusted collectors instant-publish.
2. **Community reports** — ephemeral, observational. Hazards (pothole, bad
   sidewalk, flooding, ice), tips, "heads up," local notes. Moderated, **expiring**,
   confirmable.
3. **Conditions** — live status on what people actually wonder: "splash pad on?",
   "trail muddy?", "parking full downtown?", "line at the brewery?". Short TTL;
   feeds **Ask Radius** so answers are fresher than Google.

## The seven force-multipliers (ranked by win-win impact)

1. **Close the civic loop.** We already read SeeClickFix (311) + MDOT CHART.
   Route a hazard report to the real 311 system and show `reported → acknowledged
   → fixed`. Residents get action; the county gets clean reports; we become the
   friendly front-end to civic infrastructure. _(External: needs 311 write access.)_
2. **Reputation layer = the spam solution AND the growth engine.** Trust is
   earned as reports get confirmed. Trusted "rangers" instant-publish; new/anon
   reports queue. Moderation load _drops_ as the community grows. Light local
   pride ("your markers helped 1,200 people"), not point-grinding.
3. **Conditions, not just hazards.** Crowdsourced live status feeding the
   concierge — the answers no other app has.
4. **Accessibility layer.** Crowdsource accessible restrooms, broken curb cuts,
   ramps, stroller-friendly trails, sensory-quiet hours. Underserved, on-mission,
   huge goodwill, a partnership hook for the city.
5. **Live business layer.** Verified owners (`place_claims`) post "open now /
   sold out / wait time / live music." Blended with crowd confirmation. The
   sustainability seam without ad clutter.
6. **Hyperlocal opt-in push.** Geofenced: "flooding on your street," "pool just
   opened," "street sweeping tomorrow — move your car." Retention via real utility.
7. **Open-data give-back.** Publish the crowdsourced amenity/accessibility set
   back to the county (attributed). Positions Radius as civic infrastructure,
   not a walled garden.

## Spam & abuse — designed for first, because it is the product

- **Default to a moderation queue.** Public submissions land `status='pending'`;
  only approved reports hit the map. Trusted/passcode collectors instant-publish.
- **Everything expires.** Reports carry `expires_at` (a pothole gets fixed; ice
  melts). The map shows only live reports — this alone kills most stale-spam value.
- **Confirmation, Waze-style.** "Still there?" / "Gone" taps auto-retire reports.
- **Friction by category.** Photo required for hazards; per-device rate limits;
  content filter on free text; no targeting people or private addresses.
- **Reputation gating** (idea #2) makes all of the above scale.

## Architecture (reuses, doesn't rebuild)

- A sibling **`community_reports`** table — `kind` (hazard/tip/alert/condition…),
  `status`, `expires_at`, `confirmations`, `photo_url`, `lng/lat`, `created_by`.
  Kept separate from `field_amenities` so permanent infrastructure stays clean.
- A **reputation** model: `contributor` standing derived from confirmed reports;
  drives instant-publish vs queue.
- `/collect` stays Leo's amenity tool; a lighter **"Report something"** flow feeds
  the queue.
- A real **moderation queue in `/admin`** (approve / reject / set expiry) — built
  on the existing `submissions` + `status` pattern.
- A new map **"Community" layer** toggle, styled distinctly (caution marks, age
  fade) so reports never get confused with verified places. Conditions feed
  **Ask Radius**.

## Phasing

- **Phase 1 (private) — the foundation + spearhead:** `community_reports` table +
  the `/admin` moderation queue + a "Report something" submit flow + the map
  layer, with one or two report kinds (hazard + condition). Owner approves
  everything by hand. Proves the loop end-to-end on our own infra (no external
  dependency). _Everything else builds on this substrate._
- **Phase 2:** public submission at scale + the spam controls (TTL, rate limit,
  required photo, confirmations) + the reputation model.
- **Phase 3:** the civic loop (311 write), live business layer, hyperlocal push,
  open-data export.

## Recommended spearhead

**Phase 1: community reports + moderation queue + map layer.** It's the
substrate every other idea (civic loop, conditions, business-live, accessibility)
sits on, it ships on infrastructure we already have, and it has no external
blocker. Build it private, prove the approve→map loop, then layer the
force-multipliers on top.
