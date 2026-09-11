# Fair release, September 9

The owner authorized publishing the current visual/discovery candidate on September 9. This release includes the previously recovered connected-discovery work, the Fair finishing pass, the real-photo visual pass, and direct Fair program discovery.

## Required security maintenance

The previous PR 1681 verification failed at the production dependency audit. The bounded release fix pins the minimum patched versions:

- MapLibre GL JS 6.4.1, for GHSA-jrc7-96c5-q579.
- Next.js 16.3.3, for the current Next.js advisories including GHSA-2xp9-vwfh-vxw4. Its ESLint configuration is aligned to 16.3.3.
- sharp 0.35.4, for GHSA-rgj7-g3m4-5g8c.

The lockfile was regenerated with npm 10, as required by the repository. The self-hosted MapLibre worker and shared module were copied from the matching 6.4.1 distribution and the version-alignment test passes. The production audit now exits successfully with no high or critical findings; four low-severity AI SDK findings remain. No blanket audit fix, major-version upgrade, security-check bypass, migration, or paid-service change is part of this release.

## Release evidence

The patched local candidate passed the production build (2,750 generated pages), 7,524 unit tests with two skipped, all 50 production-mode UX/accessibility checks including main-map readiness, 46 component-preview checks, the Node/helper suites, and style lint. Full ESLint completed with zero errors and eight framework-migration warnings. The generated Next.js addition to AGENTS.md was removed so this release preserves the repository's single-source CLAUDE.md guide.

Before this release, the verified production alias pointed to deployment `dpl_HwD1gBBtBxdZAkRXTkwHaPyoFhZE`, commit `303dde2d3c7168ef8f67ca16619e888f98ead6dc`. The previous-hour runtime-error query returned no errors.

Publish through the existing PR and the normal main-branch deployment pipeline. Confirm the immutable deployed commit and the Fair Program, save/return, and official ticket links on production. Do not manually redeploy the same SHA.

## Recovery

### Browser-gate corrections

The hosted run at `17c88739` passed its dependency, unit, build, and component gates but caught a pending Fair map handoff surviving a mode change and passive Today recovery consuming the explicit-refresh allowance. The narrow follow-up cancels unfinished map handoffs when leaving Map and uses the ordinary bounded event endpoint for passive recovery without changing server rate limits.

Release tests now target the main-content Find launcher instead of its retired header control, disambiguate a map peek from its result row, and allow only an aborted read-only place-hydration GET in the explicit map-to-place return journey. Completed server failures and exact return-state assertions remain blocking. Local verification of this follow-up passed: 7,524 unit tests (two skipped), production build, 50 UX checks, all 43 production release journeys, and both dependency-chaos/worker-upgrade checks. Changed-file ESLint and whitespace checks are clean. Hosted verification and the production alias must still be checked before calling it live.

The aerial-map and Keep Guide work was initially isolated for visual review. The owner subsequently approved pushing everything, so the tested addition is now included in this PR. See `FAIR_AERIAL_PREVIEW_2026_09_09.md` for the imagery provenance, local verification, and remaining hosted-release boundary.

Stop promotion if required checks fail. If a critical visitor journey breaks after publication, identify and verify the deployment being rolled back before acting. The previous deployment contains the dependencies being patched, so reverting to it is an emergency containment choice, not a permanent resolution. Prefer a narrow forward fix when safe.

## Next usability experiment, not part of this release

Test a compact schedule view with time, title, location, and Save visible in each row, and details on demand. Do not use overlapping cards that conceal event titles or reduce effective tap targets. Prioritize planning information before the Fair and saved stops, upcoming events, and nearby essentials during the visit. This priority is a hypothesis, not a measured usage ranking. Keep schedule chronology clear and never infer missing end times, location, accessibility, or availability.
