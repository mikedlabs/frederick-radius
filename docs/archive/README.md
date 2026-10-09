# Archive

Everything under `docs/archive/` is history, not instructions. These files
are kept for the decision trail and because pull requests cite them. They no
longer describe the current app, and an approval gate or "do NOT" inside them
binds no one.

For current rules, read:

- [`../../CLAUDE.md`](../../CLAUDE.md), the working rules and the tiebreaker
  when docs disagree.
- [`../VISUAL_FIRST.md`](../VISUAL_FIRST.md), for imagery, first screens and
  the current build order.

If something in here contradicts the current docs, the current docs win.

## The status-line rule

Every audit, review or plan in this repository should start with one status
line, in one of three forms. When you touch an older doc that lacks one, add
it.

- `Snapshot YYYY-MM-DD` for a dated record that will not be updated.
- `Living, reviewed YYYY-MM-DD` for a doc someone keeps current.
- `Superseded by X` for a doc that another doc replaced.

Every finding carries FIXED, OPEN or SUPERSEDED. A finding that keeps coming
back becomes a check (a lint, a spec or a ratchet) instead of another
paragraph. When a doc is superseded, move it here under the month it was
written and put this banner on its first line:

> Superseded. Current: CLAUDE.md and docs/VISUAL_FIRST.md. History, not instructions.

Name a more specific replacement in the banner when one exists. Dated records
under `docs/audits/` and `docs/reviews/` stay where they are and follow the
same status-line rule.

## Archived 2026-10-08

These moved out of the repository root and `docs/` during the October 2026
docs audit. Each file opens with a banner naming what replaced it.

| File | Was | Replaced by |
| --- | --- | --- |
| `2026-05/REVIEW-2026-05-30.md` | Engineering review | CLAUDE.md; its advice to make Postgres the catalog is overruled by the "Data pipeline" section |
| `2026-05/DATA-STRATEGY-2026-05-30.md` | Data sourcing and cleaning strategy | CLAUDE.md, "Data pipeline" |
| `2026-06/AUDIT.md` | Living state audit with June route names | CLAUDE.md; open items in `docs/BACKLOG.md` |
| `2026-06/ROADMAP.md` | Phases and the differentiation roadmap | The "Build order" in `docs/VISUAL_FIRST.md` |
| `2026-06/DECISIONS.md` | Premium overhaul decision log | CLAUDE.md |
| `2026-06/PREMIUM-AUDIT.md` | Premium overhaul Phase 0 audit | CLAUDE.md and `docs/VISUAL_FIRST.md` |
| `2026-06/UX_REDO.md` | The June layer plan | The "Build order" in `docs/VISUAL_FIRST.md`; its trust gate is now `docs/DATA_CONFIDENCE_GATE.md` |
| `2026-06/VISION.md` | Product vision | `docs/NORTH_STAR.md` and `docs/VISUAL_FIRST.md` |
| `2026-06/AUDIT-2026-06-30.md` | Site audit report | `docs/brand/BRAND_GUIDE.md` and `docs/VISUAL_FIRST.md` |
| `2026-06/BACKLOG-shipped-2026-06.md` | Shipped sections of `docs/BACKLOG.md` | `docs/BACKLOG.md` |
| `2026-07/MAP_AUDIT.md` | Map overhaul audit | `docs/MAPLIBRE_SURFACES.md`, which carries its "do not re-fix" list |
| `2026-07/REVIEW-2026-07-08.md` | Live site review | CLAUDE.md and `docs/VISUAL_FIRST.md` |
| `2026-07/EXPERIENCE_REVIEW.md` | Ten-dimension experience review | `docs/brand/BRAND_GUIDE.md` and `docs/VISUAL_FIRST.md`; open items in `docs/BACKLOG.md` |
| `2026-07/DESIGN-POLISH.md` | Generated polish roadmap | `docs/brand/BRAND_GUIDE.md` and `docs/VISUAL_FIRST.md` |
| `2026-07/DESIGN_REVIEW.md` | Design and UX review | `docs/brand/BRAND_GUIDE.md` and `docs/VISUAL_FIRST.md` |
| `2026-07/DESIGN_REVIEW_CODEX.md` | Design and UX review with a Phase 4 approval gate | `docs/brand/BRAND_GUIDE.md` and `docs/VISUAL_FIRST.md`; the gate is void |
| `2026-07/MOBILE_AUDIT_2026-07.md` | Partial mobile audit | `docs/VISUAL_FIRST.md`; open items in `docs/BACKLOG.md` |
| `2026-07/UX_REDESIGN_2026-07.md` | Reconciled July redesign plan, with a dated status on each item | CLAUDE.md and `docs/VISUAL_FIRST.md`; open items in `docs/BACKLOG.md` |

The root `PLAN.md` was deleted on 2026-10-08 instead of archived. Nothing
linked to it, almost all of it had shipped, and its writing rules already live
in `scripts/style-lint.ts` and `docs/VOICE.md`. Its rule about keeping shared
links alive with a redirect when a route or slug changes now sits in the root
`README.md`. Git history keeps the rest.

## Pre-overhaul files

These describe the app before the May 26, 2026 architecture overhaul (PRs
#250 to #265).

| File | Was | Retired because |
| --- | --- | --- |
| `AUDIT-phase0-2026-05-16.md` | Phase 0 data integrity audit | Pre-overhaul. Its successor, `2026-06/AUDIT.md`, is archived too |
| `DECISIONS-pre-overhaul.md` | 415-line decision log | Many decisions superseded by the overhaul. Worth reading for context but not authoritative |
| `VISUAL-pre-overhaul.md` | Brand book v1 visual guide | Pre-Brand Book No. 01 paper-mode (May 2026) |
| `STYLE-pre-overhaul.md` | Voice + copy style guide | Voice Guide v1 partially superseded; `docs/VOICE.md` is current |
| `INTEGRATIONS-pre-overhaul.md` | Live feed integration notes | Stale on what's wired vs scaffolded; see `docs/FEEDS_SETUP.md` |
| `PIPELINE_PLAN-pre-overhaul.md` | Data pipeline plan | Data work is done; left for archeology |
| `AGENTS-pre-overhaul.md` | Pre-overhaul agent notes | Operational guidance now lives in CLAUDE.md or inline comments |
| `north-star-pre-overhaul.md` | Product vision doc | Vision still holds; route table inside is stale |
| `phase1-plan-original.md` | Original Phase 1 plan | Completed |
| `backend-architecture-pre-overhaul.md` | Backend architecture notes | Mostly still accurate; defer to current loaders / integrations folders for canonical structure |
