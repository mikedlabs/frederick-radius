---
description: Commit, push, and open a PR following this repo's conventions (verify first, stage explicitly)
argument-hint: [short description of the change]
---

Ship the current work as a PR: $ARGUMENTS

Pre-computed:

- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Staged diff: !`git diff --cached --stat`
- Unstaged diff: !`git diff --stat`
- Commits vs origin/main: !`git log --oneline origin/main..HEAD | cat`

Rules this repo has learned the hard way:

1. **Verify before committing.** Run `npm run typecheck`, `npx eslint <changed>`,
   and `npm run test:all` locally. CI's `verify` and `style-lint` checks are
   required by the `Main production safety` ruleset and block the merge when
   red, so a clean local run is necessary but does not replace them. On an
   ordinary PR, CI `verify` also runs the audit, transit data, build,
   Storybook and browser steps in `.github/workflows/ci.yml`, which the local
   gate does not cover. Its data-artifact validation step runs only on
   automated data PRs. Check those results on the PR before merging.

2. **Stage explicitly. Never `git add -A`.** Exploration agents and data builds
   write files into this tree. `npm run build:client-places` and
   `npm run dev:refresh-data` rewrite `src/data/places-client.json` and
   `places-client-hours.json`, and subagents leave scratch files. A plain
   `npm run dev` does not rewrite place data, because `predev` now validates
   the committed release and builds the fair photo viewer into a gitignored
   folder. `git add -A` bundles them into the wrong PR. Add the exact paths you
   changed, then re-read `git status` to confirm nothing else came along.

3. **Branch from CURRENT origin/main.** Fetch first — deploy-wait scripts often
   leave the checkout on a stale branch. If this branch is far behind, say so
   rather than opening a PR against a stale base.

4. **One concern per PR.** If the diff spans unrelated concerns, split it.

5. **The message explains WHY**, not what. State the problem, the evidence
   (measured numbers, not adjectives), the fix, and what you verified. Cite the
   audit or finding ID it closes. No em dashes in user-facing copy anywhere in
   the change itself (lint-enforced); `docs/VOICE.md` governs every string.

6. End the commit message with the `Co-Authored-By` line that this session's
   attribution instruction provides, because it names the model that is
   actually running. If the session provides none, use
   `Co-Authored-By: Claude <noreply@anthropic.com>` and do not name a model.
   End PR bodies with:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Confirm the plan with me before pushing or opening the PR — pushing is
outward-facing. After merge, prod deploys automatically in ~3-4 minutes; verify
on prod with `scripts/prod-audit.mjs` plus a check specific to this change, and
remember stale ISR entries persist briefly, so test a never-seen URL.
