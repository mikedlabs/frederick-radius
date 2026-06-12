# The Final Look — one card language, merged from every exploration

> The synthesis decision record. Four explorations each got something
> right; this is what each contributes to the single product look, what
> got dropped, and what still needs porting. Sources:
> `mock/premium-redesign` (six page reimaginings + /mock showcase),
> `mock/bento-field-card` (FieldCard specimen study), the
> `feat/today-premium-refresh` WIP, and main's shipped redesign.

## The one-sentence rule

**Field-guide grammar on a premium photographic surface.** Every entity
card is a *specimen plate*: photography-first with a cinematic scrim
when we have a photo, a matte-paper specimen panel when we don't, a
serif name always, ONE category accent per card, and zero standing
prose.

## The six laws (decided, enforced going forward)

1. **Serif names everywhere.** Every card title is Fraunces
   (`font-serif`), at every density: feature 22px+, tile ~17px,
   row ~16.5px, grid ~15px. Sans is for metadata only. *(From the
   premium mocks — the single biggest "expensive" signal.)*
2. **One accent per card.** The category color appears as the bottom
   hairline (photo cards) or the wash + watermark (photo-less cards),
   plus at most one full-color chip. Never two competing accents.
   *(From FieldCard's restraint principle: "a guide, not a casino.")*
3. **Photo-less ≠ poster.** Places fall back to `SpecimenPanel` (matte
   accent wash + dot-grid plate paper + glyph watermark). The saturated
   `CategoryGraphic` poster is reserved for events, which want poster
   energy. The only fully-saturated non-event card in the system stays
   the weather sky plate. *(FieldCard, adopted.)*
4. **Shelf tiles float at elev-2.** Photo-led shelf/grid cards carry
   `--app-elev-2`; list rows stay at elev-1; the answer lead at elev-3.
   The mocks' DEPTH_SHADOW maps onto the existing elev scale — no new
   shadow values. *(Premium mocks, mapped to existing tokens.)*
5. **Signals ride the photo.** Open/closed, distance, and the top
   reason live as glass pills ON the image (white 95% + blur), not as
   body rows. The body holds name, one metadata line, and at most one
   chip row. *(Already main's pattern — now the law.)*
6. **No standing prose.** A card never holds copy that restates what
   icons, chips, or links already say. Explainers live behind /trust
   or /about, empty-states get one sentence, attribution gets one
   muted line. *(The kill-list pass; see below.)*

## What each exploration contributed

| Source | Adopted | Dropped |
| --- | --- | --- |
| FieldCard study | Specimen panel for photo-less places; one-accent restraint; habitat/status caption grammar (future: detail sheet) | Specimen numbers ("No. 014") — charming but fake data |
| Premium mocks | Serif card names; depth shadows; glass pill recipes; full-color category chip + white type | Hand-curated fake copy; star-ratings-as-hero (we keep honest data only) |
| today-premium WIP | Four-tab nav + Radius launcher (PR #584); Saved rename | The June-2/3 feature reverts (lightbox, aerials, town chapters, story share) |
| Main (shipped) | Bottom category hairline; reason-chip system; honest self-hiding data rows | Standing prose footers (killed in this pass) |

## Landed in this pass (feat/premium-field-cards)

- `SpecimenPanel` (new, `src/components/ui/SpecimenPanel.tsx`) replaces
  the poster fallback in PlaceCard's tile / answer / grid variants.
- Serif names on PlaceCard tile/grid/row and EventCard tile/glance/row.
- Tile elevation: elev-1 → elev-2 on PlaceCard + EventCard tiles.
- Filler culled: PartnerAppsRow explainer paragraph, LocalNewsRail RSS
  footer, the /events bordered honesty footer (now one muted line
  linking /trust).

## Still to port (ranked, each its own PR)

1. **Cinematic /today hero** — full-bleed aerial + glass almanac bar
   (HomeMock recipe #1). Replaces the text-first TodayCard lead.
2. **Staggered two-column gallery** for /places browse + search results
   (DiscoverMock recipe #2): right column offset, same card frame.
3. **Snap-rail hero events** — 4:5 "happening now" card + numbered rail
   tiles (EventsMock recipe #3) for the /events lead.
4. **FieldIndexRow** — the compact specimen row (accent spine, mono
   index) as the dense-list variant on /my-radius.
5. **Timeline spine for /plan** — numbered nodes + travel pills
   (PlanMock recipe #4).
6. **Remaining kill-list** (lower priority): town subtitle lines in
   SavedList → tooltip; empty-state explainer → one sentence.

## Test for every future card

Before adding anything to a card ask: *does this earn its pixels at
shelf-scan distance?* If it's prose, it doesn't. If it's a signal the
user acts on (open, distance, price, "known for"), it rides the photo
or the single chip row.
