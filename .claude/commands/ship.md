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

1. **Verify before committing** with the gate in CLAUDE.md "Verification
   norms" (run `/verify` for the full report):
   - Every commit: `npm run typecheck`, `npx eslint <changed>` and
     `npx vitest run`, plus `npm run test:node` and `npm run test:helpers`
     after copy, data or helper changes.
   - UI changes: `npm run style:lint && npm run lint:colors &&
     npm run lint:zindex && npm run lint:type-scale && npm run lint:place-photo`.

   CI `verify` and `style-lint` are required; a red is real until shown
   otherwise.

2. **Stage explicitly. Never `git add -A`.** Subagents leave scratch files in
   this tree, and an explicit data rebuild (`npm run build:client-places` or
   `npm run dev:refresh-data`) rewrites tracked files under `src/data/`.
   `git add -A` bundles them into the wrong PR. Add the exact paths you
   changed, then re-read `git status` to confirm nothing else came along.

3. **Branch from CURRENT origin/main.** Fetch first, because deploy-wait scripts
   often leave the checkout on a stale branch. If this branch is far behind, say
   so rather than opening a PR against a stale base.

4. **One concern per PR.** If the diff spans unrelated concerns, split it.

5. **The message explains WHY**, not what. State the problem, the evidence
   (measured numbers, not adjectives), the fix, and what you verified. Cite the
   audit or finding ID it closes. No em dashes in user-facing copy anywhere in
   the change itself (lint-enforced); `docs/VOICE.md` governs every string.

6. End the commit message with:
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
   and PR bodies with:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Confirm the plan with me before pushing or opening the PR, because pushing is
outward-facing. After merge, prod deploys automatically in ~3-4 minutes; verify
on prod with `scripts/prod-audit.mjs` (with `EXPECTED_SHA`) plus a check
specific to this change, and remember stale ISR entries persist briefly, so
test a never-seen URL.
