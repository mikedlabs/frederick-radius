# CLAUDE.md

Claude Code reads this file automatically at the start of a session. The
multi-agent coordination rules live in AGENTS.md (shared with Antigravity).
Read it before starting work, and follow it.

@AGENTS.md

## Hard rules (also enforced by CI now)

- Before committing: `npx tsc --noEmit` and `npm test` must pass. The
  `ci.yml` workflow runs typecheck, lint, unit tests, and a build on
  every PR, so a red check means do not merge.
- Claim a file in AGENTS.md before editing it. One agent per file.
- Commit before handing off to the other agent.
