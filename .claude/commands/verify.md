---
description: Run the repo's verification gate (typecheck, eslint on changed files, vitest, node tests, and the style-lint guards for UI changes) and report honestly
---

Run this repo's verification gate and report the real result. Do not summarize
optimistically: if something is red, say so and paste the failing output.

Context, pre-computed:

- Branch: !`git branch --show-current`
- Changed files: !`git diff --name-only HEAD; git diff --cached --name-only`
- Untracked: !`git ls-files --others --exclude-standard | head -20`

Steps, in order. They mirror CLAUDE.md "Verification norms". Run them all even
if an early one fails, so the report is complete.

1. `npm run typecheck`: must be 0 errors. The script carries the 4096 MB heap
   flag that a cold `tsc` needs, so do not call bare `npx tsc --noEmit`.
2. `npx eslint <the changed .ts/.tsx files above>`: must be clean.
3. `npx vitest run`: must be all green.
4. If copy, data or helper code changed: `npm run test:node` and
   `npm run test:helpers`. These `node --test` files (for example
   `tests/copy-quality.test.ts`) never run under vitest. `npm run test:all`
   runs steps 3 and 4 together, as CI does.
5. If UI changed: `npm run style:lint && npm run lint:colors &&
   npm run lint:zindex && npm run lint:type-scale && npm run lint:place-photo`.
   This is exactly the required CI style-lint job.

Then check for the traps this repo has actually hit:

6. **Is `src/data/` dirty?** Run `git status --short src/data/`. `predev` only
   validates the committed release (`data:release:check` writes nothing), so
   dirty place files mean an explicit rebuild ran (`npm run build:client-places`
   or `npm run dev:refresh-data`). On stale hours a rebuild legitimately emits 0
   verified schedules (7-day policy, `src/lib/hours-freshness.ts`); that is the
   freshness policy, not corruption. If the change was not meant to touch data,
   leave those files out of the commit; never sweep them into an unrelated one.
7. **Flaky under load:** `src/lib/loaders/daypartPicks.spec.ts` has been seen to
   fail in a full run (~18s) and pass in isolation. If it is the only failure,
   re-run it alone before calling it a regression.
8. **Browser checks:** `npm run test:ux` and `npm run test:storybook` need a
   browser. In a sandbox or worktree, follow "Running browser checks in a
   sandbox or worktree" in `docs/VISUAL_CONTRACT.md`. If none can run, say so
   in the report rather than implying they passed.

Report: a one-line verdict per gate, the exact numbers (error counts, test
counts), and, if anything is red, whether it is a real regression or
pre-existing. Compare against origin/main if you are unsure. CI `verify` and
`style-lint` are required, so a red there is real until shown otherwise.
