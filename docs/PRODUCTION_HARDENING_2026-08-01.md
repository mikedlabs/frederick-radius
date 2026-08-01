# Production hardening release — 2026-08-01

This release closes the remaining production findings from the Frederick Radius master audit and latest-build review.

## User-facing changes

- Today keeps the town-aware open-place answer visible and shows the active scope on narrow screens.
- The Return Bridge offers an accurate path back to Radius after a save or return visit, with install, share, copy-link, QR, and Home Screen guidance appropriate to the current browser.
- Compass, Saved, and Settings retain permanent access to the return tools.

## Event-detail reliability

- Visitor event-detail requests no longer assemble the countywide unified event board.
- Visitor event-detail requests may use seed data, durable identities, ingested rows, and committed venue snapshots, but they cannot start the live provider fanout.
- A current or future dated link that has not reached durable storage uses the existing Radius recovery state rather than a generic timeout or false 404.
- Durable event archiving runs twice per hour, immediately after a scheduled event-cache warm.

## Spatial place mirror

- The PostGIS mirror checks the full deploy-time catalog but only writes rows whose public fields, coordinates, or lifecycle state changed.
- Sync responses distinguish rows checked from rows changed.
- A failed reconciliation reports safe mismatch counts without exposing place payloads.
- Existing last-known-good map and nearby behavior remains available when a refresh fails.

## Return Bridge review closure

- Reselecting the current town no longer creates a false saved-value signal.
- Resetting preferences withdraws an unshown home-area signal.
- A failed authenticated unfollow no longer clears the place signal; cleanup occurs only after a successful delete leaves the latest shared store empty.
- An in-session transit-bus save still qualifies when durable browser storage is blocked.
- A real saved value supersedes a pending social or return timer, so the offer reflects what the person actually did.
- Focused regression coverage locks the offer priority, home-area change, authenticated follow cleanup, and blocked-storage transit behavior.

## Automation

- The long-lived `data-snapshots` branch again contains the Vercel ignored-build helper, so generated snapshot commits do not create false preview-build failures.
- Temporary release-patch tooling was removed before review; only product code, tests, configuration, and this release record remain.

## Verification completed before protected CI

- focused event resolver, live-event, spatial mirror, cron-route, Return Bridge, follow-toggle, and transit-save regression tests
- TypeScript
- ESLint on every changed reliability and Return Bridge file
- full production build, including repository data gates and static generation

The protected pull request must still pass the repository's normal CI, style, browser-chaos, deployment, and production verification checks before merge.
