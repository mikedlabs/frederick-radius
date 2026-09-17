# Fair aerial and return-guide preview

This was developed as the isolated `codex/fair-aerial-preview-20260909` follow-up. After reviewing the direction, the owner asked to push everything, so it is being added to PR 1681 behind the same required release checks. It is not a verified production deployment until those checks, merge, and hosting build finish. Preview at `/moments/great-frederick-fair-2026#fair-map` on port 3018.

## Visible changes

- Real 2025 Maryland aerial under the existing reviewed Fair geometry and markers. A clear-map toggle remains available; an unavailable image leaves the map usable.
- Entry and essentials are the initial view, with the existing arrival, program, animal, and building views preserved.
- Mobile controls share a compact row. Camera framing updates after the actual canvas size is applied, avoiding a restored small-screen view collapsing all essentials into one cluster.
- Existing map search, place details, saved stops, issue reports, live county bus toggle, and accessible task list remain available. No invented temporary booth locations, indoor routing, or Fair-specific live bus service.
- Product heading uses Public Sans. Home emphasizes gate/admission/parking values and existing date-specific promotions.
- Keep Guide offers browser bookmark instructions, a copyable Fair URL, and the existing Home Screen guide. It does not claim to create a browser bookmark or transfer browser-local My Day plans.

## Aerial source and limits

Source: State of Maryland MD iMAP Six Inch Imagery ImageServer, `https://mdgeodata.md.gov/imagery/rest/services/SixInch/SixInchImagery/ImageServer`. The current service description identifies Frederick in its 2025 imagery collection. This is licensed public geodata, not AI imagery and not a claim of Creative Commons licensing.

The original catalog entry, service metadata, redistribution terms, geographic extent, export request, and SHA-256 are preserved in `public/data/fair/aerial/`. The catalog metadata permits free distribution subject to retaining the metadata and acknowledging derived products. The older catalog description and current service description are both preserved, not rewritten to agree. The downloader is an explicit manual operation, never a build-time fetch.

The self-hosted 2560-square JPEG is 1,881,518 bytes. It adds no new imagery subscription or external runtime tile service. It is dated 2025; temporary 2026 rides, booths, closures, and accessibility conditions are not inferred from the photo. Existing reviewed sources remain authoritative for individual pins. This is not a verified offline-map implementation.

## Review boundary

Phone screenshots and regression tests are stored under `output/playwright/visual-journey/`. The initial visual review caught overlapping controls and an over-wide opening view that ordinary hit-target checks missed. The updated opening-view assertion also requires useful marker separation on a 390px phone.

Local checks passed: 7,530 unit tests with two skipped; all 23 Fair map accessibility/interaction journeys; all 14 Fair release/finishing journeys, including ticket checklist and opt-in live transit behavior; the complete `test:ux` command including the 50-page WCAG/render gate and safe interaction crawler; changed-file ESLint; TypeScript; and whitespace checks. The new map was visually inspected on a 390px phone and desktop. These are local checks, not a production deployment or an offline-field test.

The owner's subsequent request supersedes the earlier isolation-only release scope. Publication is authorized, but the required hosted checks still apply to the combined final commit. An automatic-merge queue is not proof that the production alias has updated.
