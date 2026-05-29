# Frederick Radius — North Star

> The single source of truth for what this product *is*, who it's for,
> and the laws every screen must obey. If a design decision doesn't pass
> these, it's wrong — no matter how nice it looks.

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
4. **Show the source.** Every civic/real-time answer carries provenance
   + freshness. Trust is the product.
5. **Restraint = confidence.** Calm by default; reveal depth on ask.
   No wall of equal-weight boxes. (See DESIGN_UX_AUDIT "no directories.")
6. **Local voice.** Plain, authoritative, human — a local dispatch that
   *knows*, not a tourism brochure or a gov portal.

---

## Voice & brand

**A calm, authoritative local almanac / dispatch.** It knows the county
and tells you plainly. Confident through restraint.

- Not cute, not corporate, not bureaucratic. Human and exact.
- "Good morning. Patio weather." "Recycling's Thursday." "Three places
  open near you." Short, true, useful.
- Visual: the field-guide system (warm paper, daypart sky, tactile
  cards, radius motif) — now with the **voice + interaction laws** above
  written down, so the brand is a *behavior*, not just a palette.

---

## What we cut / never do
- ❌ Boxes that tell a decided user what to want.
- ❌ Journeys longer than ~2 taps to a known answer.
- ❌ Answers without a source/freshness when it's civic or real-time.
- ❌ "Browse" as the response to a specific question.
- ❌ Competing with Google/Apple on turn-by-turn navigation. Not our lane.

---

## Execution roadmap

1. **Front door → answer-first.** An intent-led "ask Frederick" entry
   that routes natural queries (open-now, civic, events, places) to
   direct answers. Demote the category-box grid to secondary. *(Chosen.)*
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
> does this serve, and how many taps does it save?*
