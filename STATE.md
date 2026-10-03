# Frederick Radius — State of the App

**Last walked:** 2026-09-21. **This is the single source of truth for the
current state of the app and the order of work.** It supersedes the older
trio ([`AUDIT.md`](./AUDIT.md), [`ROADMAP.md`](./ROADMAP.md),
[`UX_REDO.md`](./UX_REDO.md)), which are now historical and kept only for
their reasoning. When state changes, update this file. When a rule about
how we work changes, update [`CLAUDE.md`](./CLAUDE.md) instead.

## The doc hierarchy (read in this order)

1. [`CLAUDE.md`](./CLAUDE.md) — the operating rules: design system,
   pipeline laws, verification norms, branch and PR conventions. Always wins.
2. [`docs/NORTH_STAR.md`](./docs/NORTH_STAR.md) — the *why* and the
   interaction laws. The product is an answer engine, not a directory.
3. This file (`STATE.md`) — the honest current state and the sequenced
   plan. The *what* and the *when*.

Everything else in `docs/` is a working document for one surface or one
investigation. If a working doc disagrees with these three, these three win.

## Why this file exists

The older trio drifted out of date and started sending work in the wrong
direction: it still used retired route names (`/now`, `/browse`,
`/saved`), listed findings that have since shipped (the `next/image`
adoption, the `/today` `searchParams` force-dynamic issue, the "0 search
documents" note), and referenced a design stack the app replaced. Stale
strategy docs are not harmless. They cause agents to redo finished work
and argue against the live app. One dated file, corrected when reality
changes, is the fix.

## Current reality (2026-09-21)

Honest read of the live app. Three markers: solid, partial, gap.

### Native feel — solid (installed PWA, roughly 7.5/10)

- Solid: web app manifest and shortcuts ([`src/app/manifest.ts`](src/app/manifest.ts)),
  a real install funnel ([`src/components/pwa/InstallPrompt.tsx`](src/components/pwa/InstallPrompt.tsx),
  [`src/hooks/useInstallPrompt.ts`](src/hooks/useInstallPrompt.ts)), a
  deploy-safe service worker keyed to the commit SHA with a controlled
  update toast ([`src/app/sw.js/route.ts`](src/app/sw.js/route.ts)),
  Vaul bottom sheets, haptics ([`src/lib/haptics.ts`](src/lib/haptics.ts)),
  safe-area handling, iOS splash screens, and a full web-push stack
  ([`src/lib/push.ts`](src/lib/push.ts), [`src/app/api/push/`](src/app/api/push)).
- Partial: View Transitions run only on tab nav and the Fair map, not
  app-wide. Offline is narrow (the `/offline` shell plus a warmed Fair
  page and an IndexedDB summary), not a browsable cache.
- Gap: several push products are built but dormant and unscheduled
  (`saved-reminders`, `rain-tomorrow`, `first-saturday` under
  [`src/app/api/cron/`](src/app/api/cron)); they lack `vercel.json`
  schedules and dedicated opt-in toggles. A true native iOS app is paused
  per [`docs/architecture/ADR-003-iphone-distribution.md`](docs/architecture/ADR-003-iphone-distribution.md).

### Intelligence and Ask — grounded and deterministic; models off by default

- Solid: Ask answers without any model, from search plus rules plus live
  civic feeds ([`src/lib/ask/answer.ts`](src/lib/ask/answer.ts),
  [`src/app/api/ask/route.ts`](src/app/api/ask/route.ts)). Every common
  intent has a deterministic path. The isochrone "living radius" reach
  engine is real ([`src/components/radius/RadiusBuilder.tsx`](src/components/radius/RadiusBuilder.tsx),
  [`src/app/api/isochrone/route.ts`](src/app/api/isochrone/route.ts)).
- Partial: the living radius only exists behind `/map?mode=radius`, with
  no UI entry point. Hybrid semantic search
  ([`src/lib/ask/hybrid-search.ts`](src/lib/ask/hybrid-search.ts)) runs
  only inside the optional multi-step agent, not on the default Ask path.
- Gap: the LLM (`ASK_AI_RUNTIME_ENABLED`) and the multi-step agent
  (`ASK_RADIUS_AGENT`) are off by default. The search corpus is documented
  in `CLAUDE.md` as too thin for vectors to help. The
  civic "recycling / hours by address" moat from `NORTH_STAR.md` is not
  built; only town-level prose exists
  ([`src/data/municipal-civic.json`](src/data/municipal-civic.json)).

### Design system — real, but adoption is inconsistent

- Solid: the brand contract ([`src/lib/brand.ts`](src/lib/brand.ts)),
  `--app-*` tokens ([`src/app/globals.css`](src/app/globals.css)), a
  canonical `Button`, `Pill`, `Chip`, and sheet stack, and CI guards for
  color, z-index, and voice ([`scripts/check-colors.mjs`](scripts/check-colors.mjs),
  [`scripts/check-zindex.mjs`](scripts/check-zindex.mjs),
  [`scripts/style-lint.ts`](scripts/style-lint.ts)).
- Partial: there is no single `Surface`/`Card` primitive; surfaces are
  hand-rolled recipes plus `MagicCard`. `EmptyState` exists but is barely
  used on public routes (Saved and admin ship local copies). The Pill
  rollout in [`docs/UI_PRIMITIVES.md`](docs/UI_PRIMITIVES.md) is unfinished.
- Gap: roughly 3,469 `text-[Npx]` hits across 385 files with almost no use
  of the semantic type scale; `/beer` still rides a raw-hex allowlist;
  map, Fair, and transit are effectively hand-styled sub-systems.

### Reliability and performance — mature gates, two real gaps

- Solid: a data-release manifest and quality gates
  ([`scripts/data-release.mjs`](scripts/data-release.mjs),
  [`scripts/data-quality-gates.ts`](scripts/data-quality-gates.ts)),
  nightly tripwires ([`src/lib/quality/tripwires.ts`](src/lib/quality/tripwires.ts)),
  a deep test suite (58 e2e specs plus broad unit coverage), Sentry, and a
  strong security posture (CSP, admin Basic Auth in
  [`src/proxy.ts`](src/proxy.ts), env kill switches and daily caps).
- Gap: [`src/data/places-client.json`](src/data/places-client.json) is a
  single 2.2 MB client download. Performance and HTML-size budgets exist
  ([`scripts/lighthouse-audit.ts`](scripts/lighthouse-audit.ts)) but run
  only on manual dispatch, not on every PR. Trust and source chips are
  absent from the map and category surfaces.
  [`docs/SPEED-FINDINGS.md`](docs/SPEED-FINDINGS.md) is partly stale after
  the `/today` and `/events` restructures and needs re-measuring.

## The sequenced plan (concentration, not addition)

The order matters: each phase makes the next cheaper. Phase 0 first,
because nothing compounds while the workflow is noisy.

- **Phase 0 — Workflow reset and ground truth (now).** This file plus the
  branch and PR conventions in `CLAUDE.md`. Triage the open PRs (below),
  stop running two agents on one surface, and keep a single backlog.
- **Phase 1 — Design-system cohesion.** A lint guard against new
  `text-[Npx]` and a codemod of the worst files; one `Surface`/`Card`
  primitive; an `EmptyState` sweep; finish the Pill rollout; tokenize
  `/beer`; a map and Fair craft pass.
- **Phase 2 — Native-feel polish and native track.** App-wide View
  Transitions; ship the dormant push products with real opt-in and
  schedules; broaden offline; a time-boxed native spike (Capacitor vs a
  SwiftUI shell) that ends in an updated ADR-003, kept isolated from PWA work.
- **Phase 3 — Signature intelligence and the moat.** Address-keyed civic
  answers with source and freshness (the retention moat); promote the
  living radius toward first-class within the interaction contract; unify
  Ask retrieval and enrich the search corpus before enabling runtime AI.
- **Phase 4 — Performance and reliability.** Shrink the 2.2 MB payload;
  gate perf and HTML-size budgets in PR CI; make trust and source chips
  consistent on map and category surfaces; refresh `SPEED-FINDINGS.md`.

Definition of done for "world-class": the top intents (restaurant
tonight, movies, recycling, parking, what is open, events) each resolve in
two taps or fewer with a cited, fresh answer, on surfaces that read as
composed rather than hand-styled.

## Open PR triage (owner actions, snapshot 2026-09-21)

There were 26 open PRs at this snapshot, with direct collisions from
running multiple agents on the same surface. These are owner decisions;
the tooling here does not merge or close them. Recommended dispositions:

- Reconcile duplicates. `#1716` (codex) and `#1714` (cursor) are both the
  Radius P0/P1 remediation. `#1713` (codex, Today layout) and `#1715`
  (cursor, mobile hierarchy and empty states) overlap on the same surface.
  Keep one of each pair, fold in anything unique, close the other.
- Rebase or close stale drafts from July: `#1437`, `#1442`, `#1444`.
- Flush the data-bot PRs through the release gate on a cadence rather than
  letting them sit: `#1701`, `#1580`, `#1544`, `#1506`, `#1504`.
- Land or close the reliability and NAS work one at a time: `#1671`,
  `#1672`, `#1655`, `#1563`, `#1605`, `#1577`, `#1626`, `#1610`.
- Merge dependency bumps after CI: `#1710`, `#1691`.
- Fair-seasonal work (`#1711`, `#1703`) is lower priority once the Fair has
  passed; close if superseded by the merged Fair map.

## Superseded and historical root docs

These remain in the tree for their reasoning but no longer describe the
live app. Do not plan from them; plan from this file.

- [`AUDIT.md`](./AUDIT.md), [`ROADMAP.md`](./ROADMAP.md),
  [`UX_REDO.md`](./UX_REDO.md) — the original trio (mid-2026).
- [`PREMIUM-AUDIT.md`](./PREMIUM-AUDIT.md),
  [`REVIEW-2026-05-30.md`](./REVIEW-2026-05-30.md),
  [`VISION.md`](./VISION.md), [`DECISIONS.md`](./DECISIONS.md) — earlier
  point-in-time reviews and decisions.
