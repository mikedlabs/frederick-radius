# Interaction craft — house rules (2026-07-21)

The working rules for how Frederick Radius should FEEL, distilled from the
best-documented interaction craft (Krug, Raskin, Norman, Cooper, Tufte,
Kahneman's peak-end, the modern spring-physics school) and applied to this
codebase. VOICE.md governs words; DESIGN_TELLS.md governs looks; this governs
behavior. Cite the rule number in PRs that lean on one.

## The rules

1. **Count decisions, not taps.** Three mindless taps beat one tap that needs
   thought. When auditing a journey, list the DECISIONS (which surface? which
   tab? which word?) — that list is the friction. The map finder rebuild
   (12 categories visible instead of one-chip-plus-"More") was this rule.

2. **Content may reorder; controls never move.** Habituation is what makes an
   app feel like a limb, and it only forms on things that stay put. Time-aware
   reordering is welcome on content (the Most-needed tail, shelves, lists) and
   forbidden on controls (nav, anchors, buttons). The needs row pins
   Open now / Near me first at every hour for exactly this reason
   (`src/components/map/needsOrder.ts`).

3. **Design the ending (peak-end).** A journey is remembered by its best
   moment and its last one. The find journey currently ends at a handoff —
   the ARRIVAL (directions, "you're here", the stamp) is the most remembered
   screen and the least designed. Standing next build: the arrival/place card.

4. **Speed budgets are design decisions.** Under ~100ms feels attached to the
   finger; under ~400ms keeps flow. Frequent interactions get the 100ms
   budget and near-zero animation; rare moments may spend ceremony. Never
   animate a chip someone taps forty times a day.

5. **Motion: interruptible, origin-aware, proportional to novelty.** Things
   grow from where they were touched, can be redirected mid-flight, and get
   theater only when rare (the wheel, first-run, a stamp earned). Respect
   `prefers-reduced-motion` everywhere, always.

6. **Defaults are the product.** Most sessions never type and never open
   settings; the zero-input state must already be the answer. Time-aware
   leading (needs row by Eastern hour, /today's evening gear) is the pattern;
   weather-aware is the approved next step.

7. **Separate by ink, not boxes (Tufte's 1+1=3).** Two elements side by side
   create a third: the noise between them. Prefer weight/color/space over
   borders; on the map, DIM the irrelevant instead of removing it so context
   survives (pins already do this).

8. **The placeholder is the manual.** Every search/filter input teaches its
   range with concrete examples in the user's words — and must not
   overpromise (no "ask a question" until the Ask handoff is actually wired
   to that box). Shipped sitewide: global search "Find places, events, towns,
   tools"; map boxes "Find coffee, a trail, a town"; the niche surfaces
   (contacts, transit, markers, beer) already complied.

9. **Spend novelty in one place per surface.** Be boring where users have
   habits from other apps (search, nav, back, sheets); be unforgettable in
   the signature (the wheel, poster tiles, stamps, the woodcuts). Novelty
   everywhere is chaos; novelty in one place is identity.

10. **Undo over confirm — with a written exception.** Confirmation teaches
    fear; undo teaches exploration. Frequent or reversible actions never get
    a dialog. EXCEPTION (logged): the once-ever preferences reset
    (`PreferencesPanel.tsx`) keeps its confirm — it immediately navigates
    into the welcome flow, so no undo toast could survive it, and Cooper's
    rule targets frequent actions. Do not add a second confirm without adding
    it here.

11. **Trust is a UX surface.** Honest states (degraded banners, "we can't
    confirm", stale flags) and visible provenance are features, not
    metadata. Never let a data failure look like local absence (the
    SearchOverlay error state is the model).

## Applied so far (evidence)

- Rule 1: map finder grid; "Most needed" row; amenities into the find-flow.
- Rule 2 + 6: time-aware needs ordering with pinned anchors (unit-tested).
- Rule 8: placeholder sweep (global search, both map boxes) — this pass.
- Rule 11: /today sourceHealth banner; honest counts; /open-now empty copy.
- Rule 10: exception log started (preferences reset).

## Standing next builds (named, in priority order)

1. **The Radius bar** (rules 1, 2, 6): one persistent find bar, thumb-zone,
   on every surface — needs row, recents, type-anything. Placement decision
   pending (above the nav pill vs replacing its center).
2. **The arrival card** (rule 3): design the end of the find journey —
   distance, open-state, directions, the stamp moment.
3. **Motion audit** (rules 4, 5): inventory transition durations on frequent
   controls; zero-out the frequent, keep ceremony rare.
4. **Weather-aware defaults** (rule 6): radar-on-rain floats indoor needs up.
