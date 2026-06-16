# Frederick Radius — Photo Policy (decision record)

**Status:** Amended (2026-06-16). Owner-approved.
**Scope:** Where photography may and may not appear in the UI.
**Companion:** implementation phases at the bottom — *no code until the plan is approved.*

---

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
