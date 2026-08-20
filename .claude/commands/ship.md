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

1. **Verify before committing.** `npx tsc --noEmit`, `npx eslint <changed>`, and
   `npx vitest run` must pass. CI's `verify` / `style-lint` are pre-existing
   infra reds (account-level Actions limits), so the local run is the gate.

2. **Stage explicitly. Never `git add -A`.** Exploration agents and dev servers
   write files into this tree — `predev` rewrites `src/data/places-client.json`
   and `places-client-hours.json` on every dev start, and subagents leave scratch
   files. `git add -A` bundles them into the wrong PR. Add the exact paths you
   changed, then re-read `git status` to confirm nothing else came along.

3. **Branch from CURRENT origin/main.** Fetch first — deploy-wait scripts often
   leave the checkout on a stale branch. If this branch is far behind, say so
   rather than opening a PR against a stale base.

4. **One concern per PR.** If the diff spans unrelated concerns, split it.

5. **The message explains WHY**, not what. State the problem, the evidence
   (measured numbers, not adjectives), the fix, and what you verified. Cite the
   audit or finding ID it closes. No em dashes in user-facing copy anywhere in
   the change itself (lint-enforced); `docs/VOICE.md` governs every string.

6. End the commit message with:
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
   and PR bodies with:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Confirm the plan with me before pushing or opening the PR — pushing is
outward-facing. After merge, prod deploys automatically in ~3-4 minutes; verify
on prod with `scripts/prod-audit.mjs` plus a check specific to this change, and
remember stale ISR entries persist briefly, so test a never-seen URL.
