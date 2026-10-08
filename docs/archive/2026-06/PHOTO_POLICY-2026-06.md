> Superseded. Current: docs/PHOTO_POLICY.md and docs/VISUAL_FIRST.md. History, not instructions.

This is the photo policy exactly as it stood before the 2026-10-07
visual-first amendment, moved here on 2026-10-08. The rules that are still in
force were carried into `docs/PHOTO_POLICY.md`, which is the only version to
follow. This copy keeps the original 2026-06-06 record, its 2026-06-16 and
2026-07-07 amendments, and the reasoning behind them. Notes marked
"Superseded" were added on 2026-10-08 beside the passages that later
amendments or `docs/VISUAL_FIRST.md` overturned. Nothing in this file gates
code.

---

# Frederick Radius — Photo Policy (decision record)

**Status:** Amended (2026-06-16). Owner-approved.
**Scope:** Where photography may and may not appear in the UI.
**Companion:** implementation phases at the bottom — *no code until the plan is approved.*

> **Superseded (2026-10-08):** the "no code until the plan is approved" gate
> is withdrawn. The plan it guarded was a photo-removal plan that the
> 2026-06-16 revision reversed and `docs/VISUAL_FIRST.md` replaced.

**Related:** `docs/VISUAL_FIRST.md` (owner direction, 2026-10-07) sets the
visual-first rule and the honest image ladder that this policy sits inside.

---

## ⚠️ Amendment — 2026-07-07 (one photo lead per events horizon group)

Image audit follow-up. On /events, the feature (photo-hero) treatment was
hard-limited to the FIRST horizon group's lead; every later group's lead was a
glance row even when it carried a real venue photo, so the browse spine read
as a wall of text. Now **each horizon group's lead renders the feature variant
when (and only when) it has a `hero_image`** — one photograph per window,
strictly leads-only. Photoless leads keep the glance row (an oversized glyph
plate per window would be ornament); peeks, expansions, compact/utility/agenda
stay photoless per the 2026-06-16 rule below. Only the first group's hero may
claim the LCP `priority` preload (`EventCard.priorityImage`). The venue-thumb
borrow also gained a hand-curated alias map + a unique-exact-match relaxed
radius (see `src/lib/loaders/eventThumb.ts`), and now runs in the
/events/[slug] detail resolvers so the detail hero matches the list card.

> **Superseded in part (2026-10-08):** "compact/utility/agenda stay
> photoless" no longer stops a venue map tile, which is not a photo. Whether
> those rows may also carry a flyer or venue photo is a pending owner call
> recorded in `docs/PHOTO_POLICY.md`. The rest of this amendment, one photo
> lead per horizon group and one LCP preload per page, is still in force. As
> of 2026-10-08 the code shows the poster card only in the first horizon group
> (`horizonLeadVariant` in `src/components/event/eventsExplorerLayout.ts`), and
> later groups lead with a glance card that may carry a small thumbnail. That
> is the current implementation, not a change to the rule.

## ⚠️ Revision — 2026-06-16 (places now lead with photos)

The owner reversed the places-on-cards rule below. **Place RESULT cards now lead
with the place's hero photo, with the category glyph as the fallback** when a
place has no usable photo (~86% of places carry `google_photo_url`; the rest
fall back to `CategoryMark`). This applies to the nearby (`/nearby`) answer
cards and the map result list — the two surfaces that had been forced to
`noPhoto`; every other `PlaceCard` already defaulted to photos.

**Still typographic on purpose — do NOT add photos to:**
- **Category / intent NAVIGATION** — the I WANT craving tiles (`CravingStrip`),
  the category filter chips, lane doorways. These name a *category*, not a
  specific business, so there is no single honest photo to show. Glyphs stay.
- **Event cards (amended 2026-06-16)** — the glance / default event card now
  shows the venue's hero photo when present (category-glyph tile fallback);
  the date block still LEADS the text, and the dense utility / compact
  variants stay photoless. Events remain calendar-native in structure — the
  photo is a trailing face on the row, not the lead.

  > **Superseded (2026-10-08):** event cards follow the events ladder in
  > `docs/VISUAL_FIRST.md`, where the flyer or venue photo is the lead
  > visual. The photoless rule for dense rows is a pending owner call; see
  > `docs/PHOTO_POLICY.md`.

- **Town heroes** — still curated/controlled only (seasonal/aerial/approved),
  never a random place's imported photo.

**Quality guard stays:** the #437 suppression mechanism still governs — a bad /
duplicate / mis-geocoded photo is suppressed and that place falls back to its
glyph. The reasoning below (why imported photos are risky) still explains *why*
suppression matters; the owner judged that, for a list of specific businesses, a
real storefront photo reads faster than a glyph and the surviving photos clear
the bar. Everything from "## Principle" down is the ORIGINAL 2026-06-06 record,
kept for context; where it conflicts with this revision (place result cards), the
revision wins.

> **Superseded (2026-10-08):** everything from here down is the original
> 2026-06-06 record. Its typographic default for browse, list, map, saved and
> event surfaces, and its "supplemental, not the spine" limit on detail-page
> photos, were overturned by `docs/VISUAL_FIRST.md`, which makes a loaded
> photo the first rung for places and events.

---

## Why this exists (the grounding)

An audit of every photo-rendering surface plus the underlying data found that the
browse UI's visual layer is, by the numbers, **an imported dataset we don't
control**:

- **1,644** public places; **89% (1,456)** render a photo.
- Of those photos, **~96% are imported** (Google ≈ 894, DFP bulk ≈ 508) vs
  **~4% curated** (seed/manual ≈ 54).
- There is **no stock-photo middle tier** — a place shows either an uncontrolled
  Google photo or a category graphic (0 fall back to `hero_image`).
- #437 already had to **suppress 79 photos across 71 clusters** because they were
  shared / wrong / mis-geocoded twins.

Imported photos bring bad crops, duplicate imagery, weak provenance, and a
"scraped" feeling that works *against* the trust layer the rest of the product is
built on. So the policy is not "photos vs no photos" — it is
**curated/controlled photography vs imported photography**, and imported
photography does not get to carry the core UI.

Two facts make this low-risk to act on:
1. The typographic card **already exists** — the 188 photoless places render
   `CategoryGraphic` today; `TodayMoves`, `EventCard` compact/utility, and the
   Collections index are already photoless and read as the most *designed*
   surfaces.
2. The supporting primitives are **already built**: `ReasonChip` /
   `StatusChipRow`, `CategoryGraphic`, event date logic, and the
   `geo_confidence` field (P1) that gates "distance only when confident."

---

## Principle

**Core browsing surfaces must not depend on imported photography.**

Frederick Radius should feel like a *designed county field guide*, not a skinned
directory. It owns its interface through typography, hierarchy, icons, chips,
date blocks, provenance, and editorial judgment — not by borrowing visual
authority from uncontrolled photos.

Three tiers of imagery:
- **Imported** (Google / DFP / feeds) — supplemental at most; not trusted enough
  for core cards.
- **Curated / controlled** (seed, manual, `AerialBeat`, `SeasonalPhoto`, approved
  assets) — allowed where it supports editorial quality.
- **Typographic / card UI** — the **default** for browse, list, recommendation,
  map, saved, and event surfaces.

---

## Default rule

Remove imported photos from core browse / list / recommendation cards. Replace
with a **unified typographic card**:

- category / icon mark
- title
- type / category
- town / area
- open / time / status
- **date block** for events
- distance **only when geo confidence is high** (`geo_confidence`)
- reason chips
- source / freshness cues

---

## Places

> **Superseded for RESULT cards by the 2026-06-16 revision at the top** — place
> result cards now lead with the hero photo (glyph fallback). The text below is
> the original 2026-06-06 stance, kept for the reasoning; it still holds for
> category/intent navigation, events, and town heroes.
>
> **Superseded in part (2026-10-08):** it no longer holds for events, which
> follow the events ladder in `docs/VISUAL_FIRST.md`. Category and intent
> navigation and town heroes keep the rule in `docs/PHOTO_POLICY.md`.

Place cards in browse / list / recommendation surfaces are **typographic by
default**. Applies to: Today place cards, category cards, town cards, map
drawer/list cards, saved rows, nearby cards, "Worth your time", "Best matches".

Imported place photos **must not** determine card hierarchy or visual quality.
Curated place photos may remain on **detail pages** and **future editorial
modules** — but **not** in standard browse cards.

> **Decision (curated 54):** even the ~54 seed/manual places with good photos stay
> **typographic on cards.** Letting only some cards carry images creates a
> hierarchy based on *media availability*, not user value. Their photos shine on
> detail / editorial only.

---

## Events

> **Superseded (2026-10-08):** this whole section. Events follow the events
> ladder in `docs/VISUAL_FIRST.md` (flyer, credited venue photo, venue map
> tile with a precise geocode, otherwise the date plate), and Today's event
> lead may carry an image. The 2026-06-16 and 2026-07-07 amendments above had
> already allowed venue photos on event cards.

Event cards use a **date/time-led** visual system, not photos:

- date block · event title · time · venue/location · lane/status · source/trust
  chip · distance only when geo confidence is high.

Do **not** use borrowed venue photos or feed imagery in normal event cards.

> **Decision (Today event hero):** the Today lead is a **date-block lead, no image
> by default.** Events should feel calendar-native, not photo-native — a borrowed
> venue photo doesn't help enough and risks making the event feel less accurate.
> Event imagery is allowed later **only** for an explicitly curated editorial
> feature, never normal event cards.

---

## Town pages

Town hero imagery **must be curated or controlled.** Do **not** use a random top
place's imported photo as a town's visual identity.

Preferred sources: `SeasonalPhoto`, `AerialBeat`, approved town-level imagery,
other curated assets.

> **Decision (town hero + "Looks like {town}"):**
> - **Town hero = curated only** (seasonal / aerial / approved). Never a random
>   place's Google photo.
> - **"Looks like {town}" stays only if the pool can be quality-gated to
>   curated/controlled images.** If the pool is mostly imported or inconsistent,
>   the module **self-hides or is removed** — a bad "Looks like" section is worse
>   than none, because it makes the app feel like it's guessing.

---

## Detail pages (the exception)

Detail pages may keep photos — the user has chosen a specific place/event and
expects richer context. But:

- photos are clearly **supplemental**, not the spine of the page;
- bad / duplicate / imported images stay **suppressible** (the #437 mechanism);
- curated photos are **favored**;
- `AerialBeat` and other controlled visual sets are **encouraged**.

---

## Goal

The main UI feels consistent, intentional, and trustworthy. Radius owns its
interface; it does not rent visual authority from uncontrolled photos.

---

## Implementation phases (bring back the detailed plan before any code)

> **Superseded (2026-10-08):** the approval gate in this heading, the hard
> guardrail below, and Phases 1 and 2 are withdrawn. Phase 1 removed photos
> from place cards, which the 2026-06-16 revision reversed. Phase 2 replaced
> event images with date-led cards, which `docs/VISUAL_FIRST.md` reversed.
> The town and detail-page intents of Phases 3 and 4 survive as rules in
> `docs/PHOTO_POLICY.md`.

> **Hard guardrail:** this is a **trust + consistency pass, not a visual redesign
> free-for-all.** Use the existing card primitives (`CategoryGraphic`,
> `ReasonChip`, `StatusChipRow`, date logic) FIRST. Refine design only *after*
> the imported-photo dependency is gone.

**Phase 1 — Core card photo removal (places)**
PlaceCard browse variants · CategoryView cards · Today "Worth a look" ·
map drawer/list cards · Saved rows · Town "Worth your time".
Replace image regions with `CategoryGraphic` / icon marks / reason-chip hierarchy.

**Phase 2 — Event card date-block system**
EventCard variants · Today event hero · event rails · nearby event cards.
Replace images with date/time-led cards.

**Phase 3 — Town visual policy**
Town hero → curated-only (seasonal/aerial/approved). "Looks like {town}" →
curated/quality-gated or self-hide. Remove imported town-mosaic behavior if
quality can't be guaranteed.

**Phase 4 — Detail-page exception**
Keep place/event detail photos for now. Keep `AerialBeat` + curated editorial
imagery. Continue suppressing imported photos with weak quality/provenance.
