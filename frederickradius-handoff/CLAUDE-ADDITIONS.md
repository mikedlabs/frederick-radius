# FrederickRadius: Project Constitution (appended June 12, 2026)

These rules govern every session. They encode decisions already made from a verified live audit. Do not relitigate them; execute against them. Full evidence lives in `frederickradius-handoff/docs/05-site-capture.md`.

## Locked decisions

Confirmed by Mike before Session 1. These are the recommended defaults; if a line is edited, the edit wins.

- **DECISION 1, the root:** `/` becomes the Today surface. The field-guide gallery page retires as a landing surface and its hidden gems content moves to `/collections/hidden-gems`. `/guide` 301s to `/`.
- **DECISION 2, Ask:** The Ask tab is replaced by a Search tab that opens the command sheet (the existing cmdk engine rendered in a mobile sheet). The word Ask leaves the navigation. Tab bar: Today, Events, Map, Search, Saved.
- **DECISION 3, Pulse:** Pulse becomes a conditional alert strip on Today that renders only when at least one category is non-zero, plus an `/alerts` page with empty categories collapsed to one line. `/pulse` 301s to `/alerts`.

## Operating rules (structure)

1. One job per screen. Today answers "what should I do right now." Events answers "what is happening and when." Map answers "where is it relative to me." Saved holds the user's list. A module serving a different screen's job moves there or dies.
2. No event or place renders twice on one screen.
3. Counts are control labels, never content. Any surviving count derives from the exact selector that renders the list it describes.
4. One search system: the command sheet. No page-level text inputs.
5. Empty states collapse to one line or nothing.
6. Weather is one sentence and one link out.
7. Reveal on intent: filters, sort, towns, view modes, and layers live behind a single Refine affordance.
8. Subtraction ships first. No new features, modules, or data sources until the persona suite passes.

## Rules of expensive (design)

- R1. One signature, everywhere. The Radius line owns arrival, pulse, rule, and confirm. Nothing else gets to be clever.
- R2. Motion is physics or nothing: springs, 250 to 400 ms, interruptible, user-caused. No linear fades, no decorative animation.
- R3. Imagery leads editorial surfaces only, and only from Mike's drone library. Lists, results, and civic data stay typographic and fast. No stock photography, ever.
- R4. The interface follows the clock. Daypart token sets (afternoon, golden hour, after dark) driven by the sunset time already fetched with weather. Copy keys off the same clock.
- R5. Texture at two percent: grain and glass are felt, never noticed.
- R6. The signature layer ships only after the subtraction sessions pass their gates.

## Approved dependency kit

`vaul` (sheets and drawers), `cmdk` (command engine, already present), `embla-carousel-react` (snap decks), `@radix-ui/react-*` (tabs, toggle group, dialog primitives), `framer-motion` (layout transitions and springs), `posthog-js` (events and replay). Reach for these before writing custom equivalents. Anything outside this list requires Mike's sign-off in chat first.

## Budgets and gates

Baselines captured June 12, 2026 (see `docs/05-site-capture.md`): /today 310 visible lines and 326 KB decoded HTML; /events 951 lines and 788 KB; root 50 lines; /pulse 122 lines.

Targets: /today under 150 lines and under 150 KB; /events under 400 lines and under 300 KB.

Every session ends with both of these, run against the preview deployment:

```
bash scripts/budget.sh
npx playwright test tests/clutter.spec.ts
```

A session whose gate fails is reverted, not merged. Gate results are appended to `docs/BASELINE.md` with the date so progress is a record, not a feeling.

## Banned vocabulary in code, copy, and commits

No em dashes anywhere. Never the words "craft," "crafting," "soothing," or "staff" (use "team"). Counts never appear in body copy. Complete sentences in all user-facing text.
