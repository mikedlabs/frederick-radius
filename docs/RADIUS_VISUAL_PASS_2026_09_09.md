# Radius visual pass, September 9

This is a local design candidate, not a production deployment.

## Implemented

- Fair Program uses a compact navigation header, a photo-led selected-day Grandstand feature and ruled event rows with stronger title hierarchy. Search, date selection, filters, details and saving remain intact.
- My Day puts the saved itinerary before an expanded preparation checklist. The checklist remains available in a compact disclosure. Saved program items have direct detail and map actions; changed source items retain review warnings.
- Today uses Mike D's existing Carroll Creek photograph and gives the Fair campaign a larger natural-color photograph. Town selection and countywide context remain explicit. This is not a redesign of every Radius screen.
- The primary admission action uses the verified regular-admission Etix checkout. The unverified opening-Friday discount is no longer the headline admission price. The optional calculator still explains reviewed discounts and checkout uncertainty.
- The live-bus map control has a compact large-text presentation. Status stays above the persistent navigation, can be dismissed and does not claim Fair service. The shared transit request times out after ten seconds and can recover on its next poll.

## Photography

No new images were downloaded or generated. Fair images reuse the three owner-approved photographs documented in `FAIR_DAY_PHOTOGRAPHY.md`; they depict 2024 atmosphere, not 2026 conditions or a particular performer. Today reuses `public/images/seasons/summer/SUMMER CARROL CREEK.jpg` from the existing owner-supplied Seasons collection, whose import pipeline is recorded in `scripts/optimize-seasonal-photos.ts`. Images use natural color, crop and neutral text scrims.

## Review boundary

Browser regression coverage includes saving a program item, restoring it after reload and opening its reviewed map location at 320, 390, 430 and 1440 pixels. Screenshots are in `output/playwright/visual-journey/`. Component stories include Program and My Day. This pass does not change production data, add subscriptions, resolve the separate dependency-security release gate, implement public map submissions, or claim complete native-device testing.

## Validation checkpoint

- Full unit suite: 7,524 passed, 2 skipped.
- Component previews: 46 passed across 11 files.
- Fair browser suite: 42 of 44 passed together; both map-initialization timeouts passed when rerun alone, without other suites competing for the local server. All six new visual-journey checks passed, including the expanded-text bus-status panel.
- TypeScript, changed implementation-file ESLint, whitespace validation and style lint passed; style lint found no new violations across 859 files.
- The general 50-check UX sweep did not complete. The main Radius map missed its local readiness budget and the sweep was stopped to reduce concurrent load. Do not represent this as a clean sitewide release gate. No new production build, commit, push or deployment was performed for this visual candidate.
