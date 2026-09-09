# Fair discovery polish, September 9

Local candidate on `codex/radius-visual-20260909`. Not committed, merged, or deployed. This builds on the existing visual candidate without changing its unrelated Today work.

## Visitor-facing changes

- Program opens the selected day's schedule directly. The intermediate discovery portal and Browse full program step are removed.
- Eight visible category controls replace two different category menus: All, Kid Zone, Animals, Music, Rides, Food & drink, Grandstand, and Exhibits & farm. Each has a text label, an icon, and an explicit selected state; color is supplementary.
- Category accents use the same schedule accent function as event rows. Rides and Food & drink labels agree between controls and rows. This does not introduce a new global palette or change map geometry.
- The selected-day Grandstand photograph remains, in a compact presentation that leaves more space for discovery. Existing source facts, opener/headliner distinctions, and the Mike D 2024 atmosphere credit remain.
- Food and drink activities are explicitly distinguished from vendor booths, with a labeled external official-directory handoff.
- Categories and search remain selected across Fair navigation and day changes. Clear filters is explicit, rather than an incidental effect of pressing Program again. Program scroll position is retained for return navigation within the mounted Fair workspace; this is not cross-device or reload-persistent search.
- Household Building and other explicit exhibit wording are classified at the view-data boundary so the Exhibits filter does not omit them.
- The native map-place dialog preserves focus when it reopens after a program handoff, preventing focus from unexpectedly moving from the selected place to its close button.

## Scope boundaries

No new subscriptions, generated photography, source downloads, ticket checkout integrations, public map submissions, migrations, or production publication. Existing saves, official ticket handoffs, transit distinctions, and reviewed map locations remain in use.

## Checks

The direct-discovery checks cover 320, 375, 390, 430, and 1280 pixel widths, keyboard category activation, category continuity, enlarged label text, and automated WCAG A/AA checks. Enlarged text initially clipped and was repaired; the revised checks passed at every width. Automated checks do not replace actual assistive-technology and native-device testing.

The 18-case broader Fair browser run passed 16 initially. The obsolete portal assertion was updated for the new direct schedule; the real map-focus regression was repaired. Both failing journeys then passed in a focused rerun.

The full unit run passed 7,523 tests with two skipped; one loopback-network test was blocked by the sandbox. That test and the changed Fair data/workspace tests passed outside the sandbox (71 tests). Component previews passed all 46 tests across 11 files. TypeScript, changed implementation ESLint, whitespace checks, and style lint passed.

The final focused Fair unit suite passed 289 tests across 37 files. All 35 final browser checks passed together, covering discovery, map keyboard/focus behavior, narrow and enlarged-text layouts, automated accessibility, saved-plan reloads, and live-bus status dismissal. This is not a clean sitewide release gate: the separate dependency-security gate and previously incomplete main-map UX sweep remain outside this pass.

The final visual review shortened the All label and search hint and corrected narrow-screen category padding. The 12 discovery/visual journeys passed again; the final 320px spacing checks also passed. The category regression additionally checks that Grandstand does not split across lines at normal text size, while enlarged text can still reflow.
