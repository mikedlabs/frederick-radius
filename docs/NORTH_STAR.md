# Frederick Radius — North Star

> The product thesis and interaction laws. CLAUDE.md is the tiebreaker
> when this file and another doc disagree. No screen ships ahead of the
> data it presents: a beautiful answer that is wrong is worse than no
> answer.

---

## The thesis

**Frederick Radius is an answer engine for living in Frederick County —
not a local directory, not "Google Maps but local."**

People here have specific, recurring needs whose answers are **buried** —
in a county PDF, a Facebook post, a stale restaurant page, a government
portal. The job-to-be-done is:

> **Answer my question in one move. Don't make me dig.**

We win not by showing *more* data, but by **un-burying the right answer
faster than anyone else**, and by knowing the rhythm of this specific
county in a way a generic tool never will.

### The one-line principle
> **Don't assign homework. Answer the question.**

---

## Two users — stop treating them the same

Every visitor is in one of two states. The home must serve both, but
differently:

| State | They say | What they need | What KILLS it |
| --- | --- | --- | --- |
| **Decided** | "Restaurant tonight." "When's recycling?" "Movies?" | The answer, in ≤2 taps. Get out of the way. | A wall of boxes telling them what to want. |
| **Undecided** | "What should I do tonight?" | Gentle, *anticipatory* suggestion (time-, weather-, place-aware). | Generic lists with no point of view. |

**Today the app over-serves the Undecided (curated boxes) and makes the
Decided work for it. The reframe: lead with the answer for the Decided;
offer the lens for the Undecided.**

So the front door is an **intent-led "ask Frederick"** ("what's open",
"when is recycling", "movies tonight", "park near me"), with a *small*
anticipatory layer beneath it — not a box grid.

### The second axis: tenure (Visitor vs Resident)

Decided/undecided is *decision state*. It is not the same axis as
*tenure* — whether the person lives here. The app already implements
tenure as `mode` (Visitor vs Resident, in `useMode` + `mode-defaults`):
it sets default map layers and event/closure scope. The two axes are
independent, and layering them gives the four people we actually serve:

|            | **Decided** (has a need) | **Undecided** (open) |
| --- | --- | --- |
| **Visitor** | Parking, a restroom, coffee right now. Wayfinding, low patience, on cellular, one hand. | "We have an afternoon here, what's good?" Wants a confident, curated plan. **The acquisition moment.** |
| **Resident** | Recycling day, is it open, council meeting, showtimes. Repeat utility. **The retention engine, the moat.** | "It's Friday, what's happening? Date night? The kids?" Anticipatory, habit-forming. |

Two rules fall out of the grid:

- **Tenure sets the defaults and scope** (which layers, weekend-downtown
  vs county-wide). This is built.
- **Decision state sets the home's posture** (the answer box for the
  Decided, the anticipatory layer for the Undecided). This is the home
  reframe below.

Residents-Decided are *why people keep the app* (the buried answers).
Visitors-Undecided are *the screenshot that earns word of mouth*. Build
for both, differently.

---

## The home: the intelligence layer

The home is not a weather page and it is not an events feed. Today it
behaves like both. The reframe, stated plainly:

> **Weather is context. Events are inventory. The home is the
> intelligence layer.**

The home's job is to read the county *right now* and answer, in the
field-guide voice, "here is what is worth your time, and here is how to
ask for exactly what you need." Weather tints and informs that answer; it
does not lead. Events are stock the intelligence layer draws from; the
raw calendar is a different surface.

Concretely, the home is:

1. **The ask** — an intent-led "ask Frederick" entry that turns a known
   need into the answer in ≤2 taps, each answer carrying its source and
   freshness. (Serves the Decided.)
2. **A small anticipatory layer** — a few time-, weather-, and
   place-aware suggestions with a point of view. Not a grid. (Serves the
   Undecided.)
3. **The daypart sky as context** — alive and time-aware, but a frame
   around the answer, not the headline.
4. **Everything else collapsed** — weather depth, event lanes, and
   secondary modules are one tap away, never the opening wall.

If the home ever reads as "here is Frederick County" instead of "here is
your next move," it has regressed.

---

## The moat: buried-civic answers

The thing no competitor does, and the reason someone keeps the app:

- **Trash / recycling by address** → "Thursday. Next pickup: this Thu.
  Yard waste resumes April 1."
- **Government hours & "when does X happen"** → office hours, permit
  windows, council meetings, leaf collection, snow routes.
- **Real-time local info** → what's open *right now*, what's happening
  *tonight within walking distance*, movie showtimes.

Every answer states **its source and freshness** ("County, updated
today") — that's what makes it trustworthy where Facebook isn't.

---

## Interaction laws (hold every screen to these)

1. **One question in, one answer out.** A known need resolves in ≤2
   taps. More than that to a knowable answer is a bug.
2. **Never bury.** If the answer exists, surface it — don't route the
   user to "browse" and hope.
3. **Anticipate, don't impose.** Suggest only for the undecided; never
   make the decided scroll past suggestions to get to their answer.
4. **Show the source, and never outrun it.** Every civic/real-time
   answer carries provenance + freshness. Trust is the product, so no
   surface ships ahead of the data it presents: a confident wrong answer
   (a false "open now," a fake distance, a misplaced event) is worse than
   an honest "not confirmed." The per-surface requirements live in
   `docs/DATA_CONFIDENCE_GATE.md`.
5. **Restraint = confidence.** Calm by default; reveal depth on ask.
   No wall of equal-weight boxes. (See DESIGN_UX_AUDIT "no directories.")
6. **Local voice.** Plain, authoritative, human — a local dispatch that
   *knows*, not a tourism brochure or a gov portal.

---

## Voice & brand

Copy follows `docs/VOICE.md`, which supersedes the voice notes this section
used to hold. Identity, meaning the palette, type, the Ripple mark and
photography, follows `docs/brand/BRAND_GUIDE.md`.

---

## Product language: the field guide

The organizing metaphor is a naturalist's **field guide** to the county:
it identifies, locates, and tells you what is notable, with authority and
economy. Use this language in product and design decisions so the parts
cohere. It is a design model, not copy: `docs/VOICE.md` keeps field-guide
metaphors out of the words people read, while `docs/STYLE.md` and the brand
guide still use the printed field guide as the visual model.

- **Specimen** — a place, venue, or trail, presented as an identified
  entry (photo, a few authoritative facts, source + freshness), not a
  marketing page.
- **The key** — how you narrow from everything to the one: the ask, the
  intents, the lenses. A field guide's dichotomous key, not a search box
  that returns 2,400 rows.
- **Plate / page** — a curated view (a town, a category, a collection)
  composed like a guide's plate: a few specimens with a point of view.
- **Range / radius** — where a thing is and whether it is within your
  reach. How the Ripple mark and its arcs may appear is set by
  `docs/brand/BRAND_GUIDE.md`.
- **Annotation** — every observation cites itself. Source + freshness is
  the field guide's footnote, and our trust signal.
- **The dispatch** — the voice that reads the guide aloud. Its rules and
  worked examples are in `docs/VOICE.md`.

A field guide does not open with every species at once. It tells you what
you are looking at and how to find what you want. That is the
answer-first home.

---

## What we cut / never do
- ❌ Boxes that tell a decided user what to want.
- ❌ Journeys longer than ~2 taps to a known answer.
- ❌ Answers without a source/freshness when it's civic or real-time.
- ❌ "Browse" as the response to a specific question.
- ❌ Competing with Google/Apple on turn-by-turn navigation. Not our lane.
- ❌ A new surface that does not make the county easier to read. A new
  route earns its place by answering a question better, never by adding
  scope. When in doubt, deepen an existing surface instead of adding one.
- ❌ Visual polish that runs ahead of the data behind it.

---

## Execution roadmap

The current build sequence is the "Build order" in `docs/VISUAL_FIRST.md`
(owner direction, 2026-10-07). The June 2026 layer plan that used to be the
plan of record is archived at `docs/archive/2026-06/UX_REDO.md`, and its
data-confidence gate now lives in `docs/DATA_CONFIDENCE_GATE.md`. The
commitments below are the product outcomes this thesis asks for.

1. **Front door → answer-first.** An intent-led "ask Frederick" entry
   that routes natural queries (open-now, civic, events, places) to
   direct answers. Demote the category-box grid to secondary. *(Built:
   Today's primary action is the Find launcher,
   `src/components/today/TodayAsk.tsx`, and the full Ask workspace lives at
   `/ask`.)*
2. **Buried-info moat.** Wire the highest-value civic answers —
   recycling/trash by address first — with source + freshness. *(Chosen
   to build now; depends on acquiring the collection-schedule data.)*
3. **Surgical journey audit.** For each top intent (restaurant tonight,
   movies, recycling, parking, what's-open, events) count the clicks
   today, kill anything in the way.
4. **Rebuild screen-by-screen** against the laws above.
5. **One-map consolidation** (radius as a lens) — supports law #1 on the
   map surface.

> Every PR description should be able to answer: *which interaction law
> does this serve, and how many taps does it save?* Data-bearing changes
> answer a second question (see `docs/DATA_CONFIDENCE_GATE.md`): *what is
> the source, how fresh is it, and what does this show when the data is
> missing?*
