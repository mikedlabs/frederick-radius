# Frederick Radius — UX Redo Plan (plan of record)

> The sequenced plan to move the app from feature-rich-but-diffuse to the
> answer-first field guide `docs/NORTH_STAR.md` describes. NORTH_STAR is
> the *why* and the laws; this is the *how* and the order. Companion to
> `docs/DESIGN_UX_AUDIT.md` (the systemic findings) and `ROADMAP.md`
> (status).
>
> **Last updated:** 2026-06-01.

---

## Operating principle

**No more wandering analysis. Every audit now produces a decision, a
commit, or a removal.** If a review does not change the code, the docs,
or the plan, it did not happen. We have enough understanding; what we
lacked was concentration.

---

## The thesis: concentration, not addition

The app is not missing features. It went **wide** — more routes, more
data — when it needed to go **deep** on the few things that carry the
feeling: the answer-first behavior and the polish system. A directory
with great data still feels like a directory. The distance between this
and "so much better" is concentration, not addition.

## The two failure modes this plan exists to prevent

Every layer below is checked against both:

1. **A pretty directory.** Beautiful, but it lists the county instead of
   answering it. Guarded by: the answer-first home model and the
   no-new-surface rule (NORTH_STAR), and Law 1 (one question in, one
   answer out).
2. **A beautiful shell with unreliable answers.** Looks premium, but the
   open status is wrong, the distance is invented, the event time is off.
   Guarded by: the **data-confidence gate** below, which runs through
   every layer. *Visual work never ships ahead of the data it presents.*

If a change does not move us away from both, it is not the work.

---

## The dependency order

Each layer makes the next one cheap. Doing them out of order is how the
drift happened. **Do not start a layer until the one before it is done.**

### Layer 0 — Write it down (this doc set) · in progress

Capture the thinking so it stops drifting, and fix the docs that lie.

- `README.md` corrected to reality (tab names, route renames, the real
  `/today` composition, Supabase).
- `docs/NORTH_STAR.md` gains the 2×2 user model, the "home is the
  intelligence layer" model, the field-guide product language, the
  no-new-surface rule, and a sharpened data law.
- `UX_REDO.md` (this file): the plan of record, Layers 1 to 3, and the
  data-confidence gate.

**Done when:** the three docs are committed to PR #391 and a stranger can
read them and know what the product is and what happens next.

### Layer 1 — Adopt the design system (the foundation)

The UX audit's root cause: the token system exists in `globals.css` and
almost nothing uses it (≈359 raw hex, ~20 ad-hoc text sizes, duplicate
Button/Chip/Card/Sheet primitives). This is *why* it reads as
inconsistent. Fix adoption and most surface complaints resolve at once.

1. Map `globals.css` tokens into the Tailwind `@theme` (color, ink,
   spacing, radius, shadow) plus a **6-step type scale**.
2. Codemod ad-hoc `text-[Npx]` to scale steps and raw hex to tokens.
   Adopt a **3-weight rule** (400 body / 500 label / 600 emphasis; 700
   reserved for numerics).
3. Consolidate to **one** each: `Button`, `Chip`, `Card`/`Surface`,
   `Sheet` (cva + tailwind-merge; Radix behavior under the existing
   skin). One shared **spring** config for all motion.
4. Add lint guards banning `text-[Npx]` and raw hex in `.tsx` so the
   drift cannot return. (Pair with the existing `style:lint`.)

**Done when:** one type scale, one weight rule, one of each primitive,
one motion system; lint green; a new screen is composed, not hand-styled.
This layer is invisible to users and is the highest-leverage work in the
plan.

### Layer 2 — The transformation (what people feel)

On the new foundation, rebuild the few surfaces that define the product.

1. **The answer-first home.** Make `/today` the intelligence layer: the
   ask + a small anticipatory layer + the daypart sky as context; weather
   depth and event lanes collapse below. Weather is context, events are
   inventory. Reuse TodayMoves / MoveStack / TwoDoors, re-framed under the
   ask rather than stacked under weather.
2. **The three signature moments** (the shareable ones; each is a
   half-started item in `docs/VISION_TRACEABILITY.md`):
   - **The living radius** — the hero slider as a real instrument with
     live feedback (B5), breathing rings (B6), within-reach blobs over
     raw pins, the same ring as the loading and brand motif. Own a
     geometry no competitor has.
   - **The daypart-sky home** — visibly tracks real sky, golden hour, and
     weather. Alive and time-aware.
   - **The ask** — the field guide's key: a need in, the answer out, in
     ≤2 taps, with source + freshness.
3. **Behavior fixes the reviewers already named:** time-first event cards
   (D3), tethered pin↔card (B8), "I'm here now" one-tap (B10).

**Done when:** the home answers in ≤2 taps and reads as "your next move,"
not "here is the county"; the three signatures ship; motion is one
system. Every surface in this layer passes the data-confidence gate.

### Layer 3 — The moat and the sweep (what makes them stay)

1. **The buried-civic moat.** Wire the highest-value answers with source
   + freshness: recycling/trash by address (depends on acquiring the
   collection-schedule data), government hours, "when does X happen."
   Apply the OSM open-now honesty fix. Without the moat this is a prettier
   directory.
2. **The surface sweep.** Bring every remaining surface onto the new
   primitives, behavior-matched to the 2×2, each passing the gate. Make
   town pages alive (E2), add situational layers (E3), build radius
   stories (F5).

**Done when:** the moat answers exist with provenance, every surface
passes the gate, and no surface is left hand-styled.

---

## The data-confidence gate (runs through every layer)

"Trust is the product." This gate is not a phase; it is a check every
change to a data-bearing surface must pass. Visual work does not ship
ahead of the data it presents.

### Confidence tiers

Every fact the UI states carries one of three tiers, and the UI treats
them differently:

- **Verified** — official/curated source, or Google-confirmed within the
  freshness window. May assert facts ("Open now," hours, category).
- **Probable** — enriched but aging past the window. Assert with a hedge
  and the date ("hours as of 3 weeks ago").
- **Unconfirmed** — raw feed, OSM, or unvetted submission. Never assert
  open/closed or precise facts; show "not confirmed."

### Cross-cutting trust primitives (one each, used everywhere)

- **Source badge** — one `SourceChip`, one source taxonomy (Google,
  County, NWS, OSM, curated, submitted), on every place / event / civic /
  real-time answer. Never restyled per surface.
- **Freshness** — one `FreshnessChip`, one threshold table, consistent
  wording. Stale degrades the claim; it is never hidden.
- **Open status** — one engine (`hours.ts` / `googleHours.ts`), one rule:
  assert open/closed only on Verified or Probable hours; otherwise "hours
  not confirmed." Never a confident "Open now" on unverified hours.

### Per-surface requirements

| Surface / element | The requirement |
| --- | --- |
| **Today (home)** | Every answer it surfaces is traceable and fresh. No "open now" pick without verified hours. If confidence is low, hedge or omit. The intelligence layer never states what it cannot source. |
| **Places** | Category shown as verified vs inferred; open status only when verified; source + freshness on the card and sheet; deduped; closed/nonexistent suppressed (`isOperational`); distance only with a known origin. |
| **Events** | Correct `America/New_York` instant (the recurring time-bug class); source + freshness; recurrence collapsed to one series; cancelled/postponed surfaced honestly; civic separated from the fun feed; nothing labeled "tonight" that is not. |
| **Map** | Pins only for valid coordinates (`coord-audit`); honest open/closed pin states; overlays cite source + freshness; **filters and the visible count always agree.** |
| **Radius** | Within-reach reflects real travel time (isochrone), not straight-line distance dressed as a drive time; the origin is a real user location or a clearly stated assumed center, never a faked "8 min away." |
| **Source badges** | One component, one taxonomy, every data-bearing surface. |
| **Freshness** | One component, one threshold table; visible, never silently stale. |
| **Open status** | One rule, one engine; "hours not confirmed" beats a confident lie. |
| **Categories** | One canonical taxonomy; one primary category per place; inferred categories flagged; never render a raw Google `primary_type` or a government department string as a category. |
| **Municipalities** | Correct assignment (or "unincorporated"); a town page shows only places in or near that town; the 12-town parity gap is tracked, not faked. |
| **Distance** | Computed only with a known origin; units shown; travel-time and straight-line labeled distinctly; never imply precision we do not have. |
| **Filters** | A filter and its result count always agree; zero results show an honest empty state, never stale results; no filter silently no-ops. |
| **Empty states** | Designed, not accidental: tell the truth ("nothing on the calendar tonight"), offer a real next move (a populated adjacent slice, or a browse fallback), and never look like a broken or still-loading screen. |

### The PR rule (adds to the existing NORTH_STAR PR question)

NORTH_STAR already asks every PR: *which interaction law does this serve,
and how many taps does it save?* Data-bearing changes add a second
question:

> **What is the source, how fresh is it, and what does this show when the
> data is missing or unverified?**

A PR touching a data surface that cannot answer all three does not merge.

---

## Definition of done (the whole redo)

- The docs match reality and hold the vision (Layer 0).
- One token system, one type scale, one weight rule, one of each
  primitive, one motion system; drift is lint-blocked (Layer 1).
- The home is the intelligence layer; the three signature moments ship;
  ≤2 taps to a known answer (Layer 2).
- The buried-civic moat answers exist with provenance; every surface
  passes the data-confidence gate; nothing is hand-styled (Layer 3).
- At no point did we ship a pretty directory or a beautiful shell with
  unreliable answers.
