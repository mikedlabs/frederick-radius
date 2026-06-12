# G. Phase 2 Token Plans (the two-pass process, before any prototype code)

The directive requires that each direction be planned first, then critiqued
against the question "would this same plan come out of any generic prompt for
a local guide app?", then revised, and only then built. This document is that
work for all three directions. No prototype route is written until a plan here
survives its own critique. Each direction names its palette hexes, its type
roles, its layout concept, and its one signature element.

The three directions share a fixed contract so they are judged on identity,
not on feature scope. Each builds five routes under `/labs/<dir>/`: home,
place detail, map, guided entry, and one empty state. Each follows the Phase 1
content hierarchy law and the imagery standard in F. Each lands every screen
at 5 or fewer above-fold choices with one primary action.

---

## Direction A: Field Guide, Executed

This direction tests Hypothesis A: the field-guide identity was sound and only
the execution drifted. It takes the existing identity and applies it with the
discipline the forensics proved was never there (34 type sizes, accent spent
on 13 non-primary elements).

### First-pass plan

**Palette.** Paper cream ground `#EEE6D4`, ink `#16140E`, a single accent of
Signal vermilion `#E14328` spent only on the one primary action per screen.
Structure is carried by two ink tints, `#16140E` at 8 percent and at 14
percent, never by the accent. Spruce `#2F5D50` appears only as the map's land
treatment, never in the interface. The enforced ratio is 82 percent paper, 13
percent ink structure, 5 percent vermilion, checked in code by a token-lint
that fails the build if a raw accent hex appears outside a primary action.

**Type.** One display face, Fraunces, used only at two sizes (the screen title
and the card lead). One text face, a grotesque with real metrics, for
everything else at three sizes. One data face, a monospace, for counts,
distances, and hours only. Five sizes total per screen, on a 1.25 modular
scale, enforced by a Tailwind plugin that exposes only those five steps.

**Layout concept.** The page as a field-guide spread: a fixed masthead, a
single lead entry with one image, then a tightly set index below. Generous
top margin, ragged-right text, a hairline rule system instead of boxes.

**Signature element.** The almanac line. Every screen carries one monospace
line under the masthead that states the day's facts in the product voice:
sunset time, the open count, the lead event. It is the one place data reads as
an almanac, and it changes through the day.

### Critique: would a generic prompt produce this?

Yes, partly, and that is the danger. "Serif display, warm cream, single red
accent, hairline rules" is the exact AI-default cluster the directive names.
The almanac line is the only element a generic prompt would not produce. The
plan as written would read as competent and generic.

### Revision

Three changes move it off the default. First, the display face is set far
larger than a generic layout dares, at a size that treats the place name as a
headline in a broadsheet, so the page reads as editorial confidence rather
than app chrome. Second, the index below the lead adopts the NPS Unigrid
constant band: a single ink rule runs the full width under the masthead on
every screen, unbroken, which is a wayfinding signature no generic prompt
includes. Third, vermilion is demoted further than any default would dare: it
appears on exactly one element per screen and nowhere else, so the eye learns
that red means "the one thing to do here." The discipline itself becomes the
identity. This passes because the restraint is more extreme than a generic
result, and the almanac line plus the constant band are specific.

---

## Direction B: The Living Atlas

This direction tests whether the product can feel like an instrument. The map
is the brand, not a utility layer. The type system is chosen specifically
against the serif-on-cream cluster.

### First-pass plan

**Palette, daylight.** Not cream. A cool paper-white `#F2F0EB` ground, ink
`#1A1C1B`, and a single accent of Carroll Creek blue `#1E5B7A` (a return to
the brand's original water idea, which the forensics found was abandoned).
The map carries warmth so the interface does not need to: land in a pale
clay, water in the creek blue, parks in a muted sage.

**Palette, evening.** After sunset the ground shifts to a deep slate `#14181B`,
ink inverts to `#ECEAE3`, the accent warms to a lit-window amber `#E8A33D`,
and the map switches to its night style. Content priority shifts with it: the
evening state leads with what is open and what is on tonight.

**Type.** No serif. One grotesque display face with a mechanical, drawn
quality (the instrument feel) at two sizes, and one neutral text face at
three. The data face is the same grotesque at a tabular weight, so numbers
feel like instrument readouts. This is the deliberate anti-cluster move.

**Layout concept.** The map is always present, full-bleed, and the content
rides over it on a single glass shelf that the user raises and lowers. The map
is never a tab you visit; it is the floor the whole product stands on.

**Signature element.** The adaptive light state. The entire product has a
daylight and an evening identity that switch on the real Frederick sun
position, changing palette, map style, photographic grade, and content order.

### Critique: would a generic prompt produce this?

The day-or-night dark mode is common and a generic prompt would produce a
palette swap. The full-bleed map with a glass shelf is the Apple Maps and
DoorDash pattern, which the codebase already uses, so it is not novel on its
own. The grotesque-instrument type is a real differentiator. The plan risks
reading as "a maps app with dark mode."

### Revision

Two changes make the light state identity rather than a setting. First, the
switch is tied to the real sun position in Frederick and is not user-toggled
by default, so the product is a different thing at 8am and 9pm
rather than offering a preference. The evening state does not merely darken; it
reorders the content and changes what the map emphasizes, so the same data
becomes two products. Second, the map itself is the signature, so it gets
commissioned as brand work: a custom style where the Catoctin ridge hillshade,
the Monocacy and Carroll Creek waterlines, and the historic downtown grid are
drawn as identity, with the type on the map set in the same face as the
interface. No generic prompt commissions cartography. The glass shelf stays,
but it is the supporting actor; the map and its two light states are the
brand. This passes because adaptive cartography keyed to the real sun is a
specific, uncommon idea.

---

## Direction C: Wildcard (the clustered spires)

This direction starts from one concrete artifact of Frederick: the "clustered
spires" skyline, the row of church steeples that has defined the city's
silhouette since the 19th century and gives it its nickname. The whole visual
language derives from that artifact. The directive requires real risk, so this
direction is allowed to be uncomfortable.

### First-pass plan

**The derivation.** The spires give three things: a vertical rhythm (tall, thin,
repeated forms against the sky), a material palette (weathered copper green,
slate, limestone, brick, the pale sky behind them), and a silhouette grammar
(the city is known by its outline, not its color). The language is built from
the silhouette.

**Palette.** Limestone `#E7E2D6` ground, slate ink `#23282B`, weathered copper
`#3E6B5A` as the structural accent, and a single warm brick `#B0432B` reserved
for the one primary action. The sky behind the spires, a pale `#D8DEE0`,
becomes the secondary surface for raised cards. This palette comes from a
specific skyline, not from a mood.

**Type.** A high-contrast condensed display face that recalls the verticality
of the steeples, used large, paired with a humanist text face. Numbers in a
condensed tabular face. The condensed display is the verticality of the
artifact expressed in type.

**Layout concept.** The skyline as a structural device. Each screen is headed
by a thin horizon rule with a small, accurate spire silhouette of the actual
Frederick skyline, drawn from real building positions, that doubles as a
progress and place indicator. Content hangs below the horizon like the city
below its spires.

**Signature element.** The living skyline header: an accurate, minimal line of
the Frederick steeples that is both the brand mark and a functional wayfinding
strip, where the spire nearest your current place or map center lifts slightly.

### Critique: would a generic prompt produce this?

No generic prompt for a local guide produces a skyline-derived condensed type
system with a functional silhouette header. The risk is the opposite one: that
the skyline header becomes decoration, an illustration stuck at the top of
every screen, which the directive explicitly forbids (three signature elements
per screen equals zero, and ornament is not identity). The condensed display
face is the second risk, since condensed type at small sizes harms legibility
and the premium bar requires AA contrast and readability.

### Revision

Two changes keep the artifact load-bearing rather than decorative. First, the
skyline header earns its place by doing a job: each spire maps to a real
district or a saved place, and the active one lifts, so the strip is a
wayfinding instrument a user reads, not a picture they ignore. If it cannot
carry a function on a given screen, it is removed from that screen rather than
left as ornament. Second, the condensed display face is used only at large
title sizes where contrast and legibility hold, never below the title step,
and the text face carries all working copy, so verticality is a voice at the
top of the screen and never a tax on reading. This passes because the language
is derived from a specific Frederick artifact and the one signature does a
functional job, but it stays uncomfortable because a condensed, vertical,
copper-and-brick system is far from the safe serif-on-cream default.

---

## What gets built

All three plans now have a signature that a generic prompt would not produce
(the constant band plus almanac line; adaptive cartography keyed to the sun;
the functional skyline strip) and an enforced discipline (the token-lint ratio,
the five-size scale). Phase 2 builds the five routes per direction on these
plans. The comparison gate, DIRECTIONS.md, will score all three against the
Section 2 metrics on a real phone, and the founder picks one or a justified
synthesis for the Phase 4 rebuild.
