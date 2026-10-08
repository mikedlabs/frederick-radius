# UI primitives

Storybook is the catalog of shared primitives, not this page. Run
`npm run storybook` and inspect the real mobile states at 320, 375, 390 and
430 px. Stories sit beside their components as `*.stories.tsx` (for example
`src/components/ui/SectionHeading.stories.tsx`). Reuse a story's primitive
before inventing a new card, button, chip, heading, empty state or drawer, and
when you change a shared primitive, update or add its story and pass
`npm run test:storybook`. CLAUDE.md ("Component workshop") holds the full rule.

Some shared primitives have no story yet, so read their header comments:
`Pill` (`src/components/ui/Pill.tsx`) for standard toggles and intent chips,
`FilterChip`, and `Row` and `RowList` (`src/components/ui/Row.tsx`) for dense
directory rows. When you touch a hand-rolled toggle, convert it to `Pill`
unless its own style does real work, such as a control floating over the map
or a navigation active state. Weights and the type scale live in
`docs/brand/BRAND_GUIDE.md` and `docs/STYLE.md`.

## Sheets

A new sheet builds on `BottomSheet` (`src/components/ui/BottomSheet.tsx`),
directly or through its `Sheet` wrapper (`src/components/ui/Sheet.tsx`). It
owns one dialog contract for every consumer: drag, backdrop and Escape
dismissal, focus trap and return, reduced motion, safe areas and body scroll
lock. `PlaceSheet` and `EventSheet` are the canonical consumers. Do not start
a new modal stack, and keep to the one-overlay limit in
`docs/USER_FIRST_INTERACTION_CONTRACT.md`.

A second shell exists today. `BottomDrawer` (`src/components/ui/BottomDrawer.tsx`,
built on Vaul) backs the map selection surfaces, intercepted-route drawers,
PlanBuilder, the beer and food truck boards and the fair tools, and
`src/components/radius/MapControlSheet.tsx` uses Vaul directly. Do not add a
third shell.

## History

This page used to describe Pill tones, the RowList container and a 2026-06
chip rollout checklist. Those notes had gone stale or conflicted with current
guidance, so they were removed on 2026-10-08. Pill no longer has a gradient
tone, MapModeToggle was deleted, one example used a raw hex tone, and the
elevated RowList it recommended for directories conflicts with the ruled
sections in `docs/STYLE.md` ("Surface and shape"). Read the old version with
`git show 7371b1c8:docs/UI_PRIMITIVES.md`.
