---
description: Run the local verification gate (typecheck, eslint on changed files, unit tests) and report honestly
---

Run this repo's verification gate and report the real result. Do not summarize
optimistically: if something is red, say so and paste the failing output.

Context, pre-computed:

- Branch: !`git branch --show-current`
- Changed files: !`git diff --name-only HEAD; git diff --cached --name-only`
- Untracked: !`git ls-files --others --exclude-standard | head -20`

Steps, in order. Run them all even if an early one fails, so the report is complete.

1. `npm run typecheck` must report 0 errors. This is the command CI runs.
2. `npx eslint <the changed .ts/.tsx files above>` must be clean.
3. Run the three suites that make up `npm run test:all` as separate commands,
   because `test:all` chains them with `&&` and stops at the first failing
   suite: `npm run test` (Vitest), `npm run test:node` (`tests/*.test.ts`) and
   `npm run test:helpers` (`scripts/lib/*.test.mjs` and `tests/*.test.mjs`).
   All three must be green. CI runs `npm run test:all`, so each one counts.

This is the local gate. CI's required `verify` check also runs the dependency
and repository audits, committed transit data validation, the build, the
Storybook component tests and the browser tests. On an automated data PR it
skips most of those and runs the data-artifact validation instead. The required
`style-lint` check runs only `style:lint`, `lint:colors` and `lint:zindex`.
Check both results on the PR.

Then check for the traps this repo has actually hit:

4. **Did the working tree pick up data churn?** Run `git status --short src/data/`.
   `src/data/places-client.json` and `places-client-hours.json` are rewritten by
   a data build (`npm run build:client-places` or `npm run dev:refresh-data`),
   not by `predev` or a plain `npm run dev`. On stale hours a rebuild can
   legitimately come back with 0 verified schedules. That is the freshness
   policy, not corruption. If they are dirty and you did not intend a data change,
   `git checkout --` them; never sweep them into an unrelated commit.
5. **Flaky under load:** `src/lib/loaders/daypartPicks.spec.ts` has been seen to
   fail in a full run (~18s) and pass in isolation. If it is the only failure,
   re-run it alone before calling it a regression.

Report: a one-line verdict per gate, the exact numbers (error counts, test
counts), and — if anything is red — whether it is a real regression or
pre-existing. Compare against origin/main if you are unsure.
