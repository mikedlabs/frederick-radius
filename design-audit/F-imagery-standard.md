# F. Imagery Treatment Standard (Phase 0 blocker 4)

The audit verified that 88.6 percent of places carry a photo and that typical
resolution is 1,200 px, which is adequate for a mobile hero at 2x density. The
open problem is editorial quality, not coverage. The photos are uncurated
Google Places submissions: storefronts shot at angles, food close-ups, dim
interiors, and the occasional parking lot. An image-led hierarchy fails the
moment one of these lands in a hero slot. This standard is the law any
direction must follow before it makes photography load-bearing. It has two
parts: a curation policy that decides which images may lead, and a treatment
that makes mixed sources read as one voice.

## Part 1: The curation policy

Images earn their position by tier, the same way places earn their ranking.

**Tier 1, lead-eligible.** An image may fill a full-bleed hero or a Plate card
only if it is on the curated lead list. The list is the top 150 editorial
places by feature score that also pass a one-time human glance for framing
(the subject is recognizable, the shot is level, the light is not broken). 150
is the working number because it covers every place a Daily Cover, a town
lead, and a guided answer would surface in a season, and a human can review
150 images in under an hour. The list lives in a new
`src/data/lead-images.json`, slug to chosen photo index, so the choice is data
and reviewable, never a render-time guess.

**Tier 2, grid-eligible.** Any place photo that exists may fill a standard
Entry card at half width. At that size a mediocre photo reads as texture, not
as a claim. The treatment in Part 2 still applies.

**Tier 3, no image.** A place with no photo, or whose only photo failed the
glance, renders as a typographic Entry card: the name in the display face on
the paper field, the category and one fact below. This is not a fallback to
apologize for. A clean type card next to photo cards is a deliberate rhythm
that the reference set (Wildsam, Monocle) uses on purpose. The card never
shows a gray box or a broken-image glyph.

## Part 2: The treatment

Every place image, in every position, passes through one treatment so a Google
storefront and a curated interior read as the same product.

1. **One crop family.** Heroes are 3:2. Plate cards are 3:2. Entry cards are
   1:1. The thumbnail in an Index Row is 1:1 at 40px. Three ratios total, each
   tied to one card type, never mixed within a type. The crop is center-weighted
   with a slight upward bias so signage and faces survive the cut.

2. **One tonal pass.** Every image receives the same light grade: a small
   contrast lift, a slight desaturation toward the paper-warm point, and a
   1 px inner line at the ink color at 8 percent so the image sits ON the
   paper rather than floating. This is the single move that makes mixed
   sources cohere. It is applied with CSS filters and a box-shadow inset at
   render time, so it costs no pipeline work and reverses with one token
   change. Direction B may swap the grade for its evening state.

3. **One overlay grammar for text-on-image.** When type sits on a photo (the
   hero), a bottom-up gradient scrim from the ink color carries the text, and
   the type is always the inverse paper color. Text never sits on a raw photo,
   and the scrim is never a flat 50 percent wash. The gradient stops are
   tokens so all three directions share the mechanism while choosing their
   own darkness.

4. **One motion rule.** An image fades from the paper field over 200ms on
   load and never slides, zooms, or parallaxes by default. Reduced-motion
   shows it immediately. Motion is reserved for spatial transitions, not for
   decorating a static photo.

## What this unblocks and what it costs

This standard unblocks every image-led concept: the Daily Cover, town leads,
the Plate card, and guided answers may all use photography once the lead list
exists and the treatment ships as tokens. The cost is one human review pass
over 150 images, recorded as `lead-images.json`, plus a treatment layer that
is one component and a handful of tokens. Until the lead list exists, a
direction may prototype with the curated subset already visible on production
hero surfaces (the places that already pass), and the Tier 3 type card carries
everything else honestly.

## The asset standard for new sources

When the product commissions or accepts new photography, the brief is fixed:
shoot level, fill the frame with the subject, favor available light, deliver
at 2,000 px on the long edge in 3:2. One photograph that meets this brief
outranks five Google submissions in a hero slot. Photography is load-bearing,
so the product treats it as a sourced asset with a standard, not as a field
that happens to be populated.
