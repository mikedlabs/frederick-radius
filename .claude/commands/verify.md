---
description: Run the repo's full verification gate (tsc, eslint on changed files, vitest) and report honestly
---

Run this repo's verification gate and report the real result. Do not summarize
optimistically: if something is red, say so and paste the failing output.

Context, pre-computed:

- Branch: !`git branch --show-current`
- Changed files: !`git diff --name-only HEAD; git diff --cached --name-only`
- Untracked: !`git ls-files --others --exclude-standard | head -20`

Steps, in order. Run them all even if an early one fails, so the report is complete.

1. `npx tsc --noEmit` — must be 0 errors.
2. `npx eslint <the changed .ts/.tsx files above>` — must be clean.
3. `npx vitest run` — must be all green.

Then check for the traps this repo has actually hit:

4. **Did the working tree pick up data churn?** Run `git status --short src/data/`.
   `src/data/places-client.json` and `places-client-hours.json` get rewritten by
   `predev` whenever a dev server starts, and on stale hours they legitimately
   come back with 0 verified schedules. That is the freshness policy, not
   corruption. If they are dirty and you did not intend a data change,
   `git checkout --` them; never sweep them into an unrelated commit.
5. **Flaky under load:** `src/lib/loaders/daypartPicks.spec.ts` has been seen to
   fail in a full run (~18s) and pass in isolation. If it is the only failure,
   re-run it alone before calling it a regression.

Report: a one-line verdict per gate, the exact numbers (error counts, test
counts), and — if anything is red — whether it is a real regression or
pre-existing. Compare against origin/main if you are unsure.
