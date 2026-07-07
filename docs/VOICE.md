# Voice & copy — Frederick Radius

This is the source of truth for how Frederick Radius *sounds*. Design
tokens live in `STYLE.md`; the writing rules live here. If a string ships
to a user, it answers to this document.

The test for every line: **would a calm, knowledgeable local actually say
this?** Not a marketer, not a chatbot, not an app trying to sound friendly.
A neighbor who genuinely knows the county and has nothing to prove.

---

## What it is (say it this plainly)

> One place for the whole county — the city and every town in it — that
> tells you what's open, what's on, and what's actually worth your time.

That's the entire brand. There is no metaphor underneath it. No sweep, no
signal, no "always on." The product's competence is the story; the copy
just states it and stops. If a line needs a metaphor to sound impressive,
the line is weak.

---

## The name

Say **"around here."** That is how a local refers to their radius — what's
near them — and it carries the name without a geometry lecture.

**Never write the sentence that explains the circle.** Do not say "your
radius is the area around you" or anything that defines the word. The mark
holds the geometry; the words stay human. If someone doesn't parse "Radius"
on day one, the product teaches them by being useful, not by explaining
itself.

- **Tagline (locked):** *Around here.*
- **Descriptor (the line under the name):** *What's open, what's on, and
  what's worth your time — across the city and every town in the county.*

Backup tagline register, if a surface needs a fuller line: *The whole
county, close up.* / *Frederick County, the way a local knows it.*

---

## Voice principles

**1. Say the true thing.** State the fact. "Open till 9." "Closed Mondays."
"Twelve blocks of antique shops." Don't dress it. The truth, plainly told,
is more trustworthy than any adjective.

**2. Specific over abstract, always.** Name the real thing. "Carroll Creek,"
"the Great Frederick Fair," "the Saturday-only bakery," "Catoctin." Never
"local attractions," "amazing spots," "hidden gems" as a headline. Specifics
prove you actually know the place; abstractions prove you're a template.

**3. Confidence through understatement.** A local expert never oversells.
"Worth the drive" beats "an unforgettable experience." "People come from the
next county for this" beats "world-class." Let the reader conclude it's good;
don't announce it.

**4. Counts are support, never the headline.** "Coffee near you" leads;
"37 places" is the quiet detail underneath. A number is evidence, not a boast.

**5. Verb-first where there's an action.** Chips and buttons start with the
verb: "Eat & drink," "Open now," "Plan a day," "Save this." Labels are what
you *do*, not categories you *are*.

**6. The product is calm.** No urgency theater, no exclamation points, no
"Don't miss out!" If something is genuinely time-sensitive ("closes in 30
min"), the fact carries the urgency. We never manufacture it.

---

## Banned words (these ship us into template territory)

Never use, in any user-facing string or marketing copy:

> discover · curated · seamless · effortless · unlock · elevate · your
> gateway to · powered by · reimagined · the future of · real-time · live ·
> smart · vibrant · immersive · "hidden gems" (as a headline) · "we've got
> you covered" · "everything you need" · "at your fingertips" · "explore" (as
> a CTA) · "dive in" · "level up" · game-changer · revolutionary (in
> product copy)

Also banned: **em dashes** in user-facing copy (`cleanFeedText` converts a
stray one to a comma, but don't author them). And **exclamation points**
except where a real human would genuinely use one, which is almost never.

Why the list matters: these are the words every vibe-coded app reaches for.
Refusing them *is* the brand position. The absence is the differentiator.

---

## Worked copy, by surface

The most useful reference is a good/bad pair. Match the left column.

### Today / the open screen

| Ship this | Not this |
|---|---|
| Tuesday, 6pm. Here's what's open and close. | Discover what's happening around you right now! |
| Rain's coming by 4. Here's the indoor list. | Don't let the weather ruin your day — explore indoor fun! |
| Quiet night in the county. A few places still open. | Endless possibilities await you tonight! |

### Town pages

Lead with what the town *is*, in one true line, then what's actually there.
In a thin town, don't fake depth — say the honest thing and point onward.

| Ship this | Not this |
|---|---|
| Thurmont. The gateway to Catoctin, Camp David just over the ridge. | Explore the vibrant community of Thurmont! |
| Burkittsville is tiny. Come for Gathland's overlooks and the walk up South Mountain. | Discover the hidden gems of charming Burkittsville. |
| Not much open in Woodsboro tonight. The nearest is Keyes Creamery, 6 min out. | No results found in your area. |

### Place & event cards

State, don't sell. The place's own facts do the work.

| Ship this | Not this |
|---|---|
| Open till 10. Downtown Frederick. | Conveniently located and open late for your enjoyment! |
| Saturday only, 8am till they sell out. | A must-visit local favorite you won't want to miss! |
| Free. Outdoor. Dogs welcome. | The perfect spot for the whole family! |

### Empty states (honest, never dead-ends)

| Ship this | Not this |
|---|---|
| Nothing saved yet. Find a place worth remembering and it lands here. | You haven't saved anything yet. Start exploring! |
| No events match that. Try a different day, or widen the town. | 0 results. |
| We don't have hours for this one yet. Call ahead. | Hours unavailable. |

### Onboarding (≤3 taps, plain)

| Ship this | Not this |
|---|---|
| Where are you? We'll sort everything by what's close. | Let's personalize your experience! |
| What are you here for? Pick a few. You can change it anytime. | Unlock your custom feed by selecting your interests! |

### 404 / errors (calm, a way out)

| Ship this | Not this |
|---|---|
| That page moved or never existed. Here's the map. | Oops! Something went wrong. |
| Off the calendar. That event isn't listed. See what's on this week. | Event not found. |

### Push notifications (earn the interruption, or don't send)

| Ship this | Not this |
|---|---|
| The Wine Kitchen's happy hour starts in 30 min. | 🔥 Don't miss out on amazing deals near you! |
| Rain cleared. Baker Park's dry by 5. | Your daily update is here! |

### Share text

| Ship this | Not this |
|---|---|
| Saved on Frederick Radius: Brewer's Alley, open till 10. | Check out this amazing place I discovered! |

---

## Mechanics (the non-negotiables)

- **No em dashes.** Comma or a full stop instead.
- **Times are Eastern**, rendered like a person reads them: "6pm," "8am,"
  "till 10," not "18:00" or "10:00 PM" in body copy. (Mono/data surfaces
  keep tabular time; prose does not.)
- **No trailing "!"** except a genuine human moment.
- **Sentence case** for headings and buttons, not Title Case. ("Open now,"
  not "Open Now.") Proper nouns keep their caps.
- **One primary action per view.** If two things shout, neither is heard.

---

## The vision line (pitch only, never in-product)

The "Frederick is the first, this scales to other counties" idea does not
belong on any product surface. In the pitch deck it is exactly one line and
appears nowhere else:

> Frederick is the first. A county fits in a radius. So does the next one.

Keep it out of the app. The user in Frederick is not buying a platform; they
are looking for somewhere to eat.

---

## How this reconciles with earlier docs

- Supersedes the scattered voice notes in `NORTH_STAR.md` and the "living
  field guide" phrasing (retired — it was doing metaphor work this doc
  removes on purpose).
- `CLAUDE.md`'s one-paragraph voice summary points here for the full rules.
- Boundary cleaning (`cleanFeedText`, `normalize.ts`) enforces the mechanics
  on ingested text at the seams; this doc governs the copy *we* author.
