# Frederick Radius finishing pass

September 9, 2026. **Owner approved merge and publication. Awaiting the required CI gates and production verification.**

## Release lineage and scope

Production was verified READY at `303dde2d3c7168ef8f67ca16619e888f98ead6dc`. The saved connected-experience implementation at `370278b25ec58a63e48cbf51f5c670a8e1661ccc` was restored into an isolated durable worktree on `codex/radius-finishing-pass-20260909`. The user's older checkout and unrelated work were preserved. This pass builds on that saved implementation, rather than recreating it.

The design critique prioritized the Fair entrance, map controls, and a truthful ticket handoff. The data-quality review used the promoted public catalog and assembled event feed, not raw ingestion counts as a proxy for public defects. No additional paid provider, crawl, automation, database mutation, or image-generation service was used.

## Implemented and verified

- Fair entrance: larger real-photo masthead and a more photographic Today promotion, using Mike D's existing 2024 Fair photographs. These are not evidence of the 2026 layout or current conditions. Ownership and derivative provenance remain documented in `docs/FAIR_DAY_PHOTOGRAPHY.md`. New Frederick photography must be Mike's or explicitly reusable with verified attribution/license; synthetic Frederick images are prohibited.
- Tickets: verified direct Etix links for regular admission and the Blue Ribbon bundle. The estimator explicitly says it is not a cart and does not transfer selections to Etix. A copyable ticket checklist carries the party, quantities, estimate, and source caveats. Browser verification confirms party selections survive reload in Radius.
- Price uncertainty: the reviewed FAQ's opening-Friday $8 offer does not match the current regular Etix page's $10 listing. No $8 checkout was verified. Both the direct admission panel and planner explain this conflict; the $8 offer links to official information, not a falsely equivalent checkout. The regular page limits purchases to eight admissions per order. No seller cart or purchase was created.
- Fair map: optional fresh county bus positions use the existing shared live feed. Requests start only after opt-in and stop on close. Markers require individual timestamps no older than two minutes and coordinates within the visible Fair arrival area. The UI distinguishes positions now from the selected Fair date and does not promise Fair service, a shuttle, an arrival time, or future service. An actual late-night public-feed check was available with zero vehicles; the positive marker test uses an explicitly synthetic fixture.
- Transit: refreshed the existing official static feed once. The generated artifacts contain 17 routes, 395 stops, 50 shape variants and 883 trips, generated September 9 with a service window ending October 9. Static service and live vehicle positions remain separate sources.
- Places: corrected Whistle Punk's restaurant classification and verified website; added concise primary-source descriptions for Whistle Punk and Beans in the Belfry and corrected the latter's website. Brunswick coffee search now has two legitimate matches, not the previous three.
- Events: conservatively collapse same-venue, same-time themed-prefix duplicates such as the two Comedy Pigs listings. Different times, venues, short titles, recurring or all-day records are protected by tests. Explicit musical production credits identify theater rather than generic music. Archive hydration also applies deduplication, with cache keys advanced.
- Reliability: fixed a reproduced search-to-place crash caused by an existing Wikimedia thumbnail host missing from the image allowlist. The new allowance is restricted to HTTPS commons thumbnails. Both phone and desktop journeys now pass.

## Data findings and limits

The local public catalog retains 1,570 places across 13 municipality labels. Static gates find no duplicate slugs, out-of-county public coordinates, invalid public Google IDs, or missing copy provenance. These checks do not independently certify every business or description.

Publishable photo coverage is 1,328 of 1,570 (84.6%). Decision-useful copy is 175 of 1,570 (11.1%), so coverage remains thin despite the two targeted improvements.

Current-hour coverage is **zero** within the seven-day policy. Regenerating the public catalog correctly withheld 346 expired schedules that had remained in the older artifact. Stored schedules exist for 74.1% of places but cannot justify current open-now claims. Paid refresh remains held; this is not resolved by this release. Historical positive Ask tests now use a clearly frozen test-only hours fixture from commit 370278, not fabricated production freshness.

The live assembled event endpoint returned 1,199 events with no source-health degradation at inspection. Raw ingestion contained more records and is not interchangeable with public inventory. No production event rows were edited.

## Validation

- Final full regression run before publication: 7,523 passed, two skipped; 961 test files passed and one skipped. The previous run's single failure expected an Etix purchase link for the now explicitly unverified $8 offer. Its expectation now asserts the official-information link and visible uncertainty.
- Fair browser checks: four passed, covering real-photo rendering at 390 and 1440 pixels, opt-in bus fetching/markers, and clipboard checklist.
- Full Fair handoff journey: passed, including retained party after reload, ticket readiness, travel, program, map and help.
- Search-to-place regression: two passed at phone and desktop widths.
- Broad UX/accessibility gate: 49 passed immediately; one map-startup navigation timed out on a cold development load, then passed its retry. This is not evidence that main-map startup performance is solved.
- Typecheck, ESLint, data-release validation and final production build: passed. The exact application candidate generated all 2,750 static pages successfully. Later edits only add mobile tests and this review.
- Additional mobile release checks: three passed, including all Fair tools at 320/375/390/430 pixels, reachable travel choices at short phone heights, and opt-in location with inaccurate-fix refusal.
- Additional map checks: four passed for no-WebGL fallback, 200 percent text, cooperative gestures/list access, and browser Back/Forward.
- Safari-engine emulated-touch ticket checks: two passed at 320x568 portrait and 844x390 landscape. Ticket readiness advances the primary action to travel, while the admission tile still reopens tickets; inputs and the 44-pixel checklist action remain reachable. The first test draft incorrectly tried to reopen the completed primary action; it was corrected to use the persistent admission tile.
- Style lint: 859 files scanned, zero new violations. Generated third-party Fair viewer assets are excluded from authored-source ESLint; authored code remains checked.
- Static data gates: 13 of 16 pass, zero critical failures. Remaining failures are hours freshness and two related copy-coverage measures.

Visual evidence: `output/playwright/finishing/fair-home-390.png` and `fair-home-1440.png`, inspected at their respective sizes. The real Fair MapLibre map was also inspected locally. The general Mapbox map lacks a local public token in this restored environment, so no claim of fully rendered general-map visual verification is made.

## Remaining work and release boundary

1. Owner approved merge/deployment in the task with “push everything live.” The candidate includes the prior broad connected-experience work as well as this finishing pass. Required CI gates must pass before merge; Vercel owns the single production build.
2. Decide whether to fund/resume the governed hours refresh, or continue withholding unsupported availability.
3. Recheck the official $8 Friday offer before promotion; do not advertise an unverified checkout price.
4. General-map styling/performance merits a separately bounded pass with a working renderer and production-equivalent measurements. This release improves the Fair map and restores prior map/navigation work; it is not a complete main-map redesign.
5. The exact Spark coding-model task remains unidentified. The Git commit titled “Spark foundation” is already in production and refers to the graphics library, not proof of missing coding-model work. The saved connected-experience candidate was recovered, but its model identity was not asserted.
6. Controlled search-index publication from the earlier implementation, real-device installed-app checks, and post-deployment smoke tests remain outside local verification.

No automatic Etix cart transfer has been implemented or promised. No new paid tools are required for this candidate.

## Approved release checklist

- Starting production deployment: `dpl_HwD1gBBtBxdZAkRXTkwHaPyoFhZE`, commit `303dde2d3c7168ef8f67ca16619e888f98ead6dc`, READY. Main was fetched and still matches that revision.
- Local staging substitute: the exact candidate passed a production build and the documented browser checks. Existing preview-build suppression remains intact to avoid extra build spend.
- Required remote gates: verify and style-lint. Do not bypass failed checks.
- Post-merge: verify the production alias and service-worker SHA, run `scripts/prod-audit.mjs`, inspect the public Fair, ticket handoff and mobile map, and refresh the canonical full-text search index with semantic embeddings explicitly disabled.
- Recovery: a new critical-route error, broken Fair entrance or ticket destination, or alias serving the wrong revision is a release failure. Diagnose before reporting success. If recovery requires rollback, identify the immutable previous deployment above; never create a second manual production build for the same SHA.
- Known pre-existing degradation is not a new rollback trigger: current-hours refresh remains on hold, and no unsupported open-now claims should be restored.
- No migration, new scheduled job, paid refresh, or paid embedding activation is part of this release.
