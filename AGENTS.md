# AGENTS.md — Multi-Agent Coordination File

This file is read by both **Antigravity** (long-horizon planning, research, data integrations)
and **Claude Code** (fast inline edits, UI components, debugging) before starting work.

Always check this file first. Update it when you start or finish a task.

---

## 🔴 Currently In Progress
_Update this section when starting work. Clear it when done._

| Agent | Working On | Files Touched | Started |
|-------|-----------|---------------|---------|
| — | — | — | — |

---

## ✅ Division of Labor

### Antigravity handles:
- Data integrations (`src/lib/integrations/`)
- New API research and implementation
- Multi-file coordinated changes
- Architecture decisions and implementation plans
- Git commits at end of each session

### Claude Code handles:
- Fast UI component edits
- Debugging specific TypeScript/lint errors
- One-file quick fixes
- Running scripts, tests, and builds
- Styling and layout tweaks

---

## 🚫 Do Not Touch Simultaneously
_Files currently "owned" by one agent — wait for them to commit first._

_(empty — safe to edit)_

---

## 📋 Shared Task Queue
_Mike drops tasks here. Agents pull from it._

### Next Up
- [ ] MARC Train next departures widget (Antigravity — GTFS static parse)
- [ ] EPA UV Index on Now page (Antigravity)
- [ ] Thin blurb fix for 886 placeholder descriptions (TBD — partial: isJunkBlurb in src/lib/quality/ already drops scrape-junk blurbs at the boundary, shipped Jul 10; remaining work is enriching thin-but-real ones)

### Backlog
- [ ] Eventbrite venue-targeted event search (Antigravity — note: the ORGANIZER registry is live as of Jul 10: src/data/eventbrite-organizers.ts + EVENTBRITE_TOKEN set in prod; venue-targeted search is additive on top)
- [ ] Google Pollen API (Antigravity — Maps Platform key already available)
- [ ] Frederick County Agenda Center RSS → civic card (Antigravity)
- [ ] FCPS academic calendar iCal on /events (Antigravity — the keyed feed is already registered in src/lib/integrations/feed-registry.ts; it lights up when FCPS_FEED_URL is set)
- [ ] Building permits feed on news rail (Antigravity)
- [ ] FEMA flood zone overlay on the /map surface (Antigravity)

---

## 🔑 Key Rules

1. **Commit before switching agents.** Never leave uncommitted work when handing off.
2. **Check `git log --oneline -5` before starting.** Know what the other agent just did.
3. **Claim a file before editing it.** Add it to the "Do Not Touch Simultaneously" section above.
4. **One agent at a time per file.** If in doubt, ask Mike.
5. **Tests must pass before committing.** Per CLAUDE.md the gate is all three: `npx tsc --noEmit`, `npx eslint <changed files>`, `npx vitest run`.

---

## 🗺️ Where Things Live

| Domain | Path | Owner |
|--------|------|-------|
| Event feeds | `src/lib/integrations/ical-live.ts` | Antigravity |
| Data integrations | `src/lib/integrations/*.ts` | Antigravity |
| News sources | `src/data/local-news-sources.ts` | Antigravity |
| UI components | `src/components/**` | Claude Code |
| App pages | `src/app/**` | Either (claim it first) |
| Scripts | `scripts/**` | Antigravity |
| Data files | `src/data/*.ts` | Antigravity |
| Styles | `src/app/globals.css` | Claude Code |
