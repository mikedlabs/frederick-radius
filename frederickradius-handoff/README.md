# FrederickRadius Handoff Package

**Source:** Live audit and design work, June 12, 2026. Every fact in these documents was verified against the production site at 4:11 PM ET that day.
**Purpose:** Give Claude Code complete context on the issues, the decisions, the specs, and the gates, so sessions execute instead of re-auditing.

## What is in here

| Path | What it is | Who reads it |
|---|---|---|
| `CLAUDE-ADDITIONS.md` | Operating rules, locked decisions, budgets, dependency kit, gates | Append to the repo's CLAUDE.md, loaded every session |
| `SESSIONS.md` | The runbook: sessions 0 through 10 with paste-ready prompts and gates | Mike runs these one at a time |
| `docs/01-subtraction-brief.md` | The deletion contract: kill, merge, demote lists with acceptance criteria | Claude Code, sessions 1 to 4 |
| `docs/02-pattern-spec.md` | Behavioral specs for the five interaction patterns | Claude Code, sessions 2 to 4 |
| `docs/03-signature-spec.md` | The signature system, clock theming, image rules, motion rules | Claude Code, session 5 |
| `docs/04-missing-layers.md` | Strategy: measurement, digest, data ops, identity, PWA, distribution | Claude Code, sessions 0 and 6 to 10 |
| `docs/05-site-capture.md` | Verified ground truth from the live audit: counts, payloads, duplications | Claude Code, any session, instead of re-auditing |
| `docs/reference/*.html` | Working vanilla JS reference implementations of every pattern and signature demo | Claude Code, when implementing; open in a browser to see behavior |
| `tests/clutter.spec.ts` | The Playwright regression gate | CI and every session's exit check |
| `scripts/budget.sh` | The clutter budget measurement | Run at the end of every session |

## Install

1. Drop this folder at the repo root.
2. Append `CLAUDE-ADDITIONS.md` to the existing `CLAUDE.md`. If conflicts exist, the additions win; they encode newer decisions.
3. Move `tests/clutter.spec.ts` into the repo's Playwright test directory and `scripts/budget.sh` into `scripts/`. Leave `docs/` where it is.
4. Confirm the three locked decisions in the CLAUDE.md additions. They ship with recommended values; change them now or never.
5. Run Session 0 from `SESSIONS.md` before anything else.

## The kickoff prompt

Paste this as the first message in Claude Code:

```
Read frederickradius-handoff/README.md and install the package per its
Install section: append CLAUDE-ADDITIONS.md to CLAUDE.md, place the test
and script files, keep docs in place. Then read docs/05-site-capture.md
and SESSIONS.md fully. Do not redesign or re-audit anything; the audit is
done and captured. Run scripts/budget.sh against production and record
the output as the baseline in a new file docs/BASELINE.md, then run
npx playwright test tests/clutter.spec.ts and append the failure summary
to BASELINE.md (failures are expected; they are the point). Then stop
and report what is installed and what Session 0 will do. Do not start
Session 0 until I say go.
```

## One rule above all

A session that ends without its gate passing gets reverted, not merged. The gates are the entire difference between this package and the four audit documents that preceded it.
