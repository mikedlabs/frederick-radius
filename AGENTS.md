# Frederick Radius — agent guide

**The agent guide for this repo is [`CLAUDE.md`](./CLAUDE.md). Read that.**

This file exists only because several tools look for `AGENTS.md` by convention.
It deliberately holds no rules of its own, so there is exactly one source of
truth and the two can never drift.

That drift already happened once: this file was a copy of an older `CLAUDE.md`
and kept asserting a design system the app had replaced — Fraunces, Inter, and
JetBrains Mono, with a "Creek blue" palette. The shipped type is **Libre Caslon
Display** (wordmark and rare editorial moments) and **Public Sans** (everything
else: titles, body, nav, controls, labels, times, distances, tabular numerals),
defined in `src/app/fonts.ts`. Any agent that trusted this file was designing
against a typeface stack that no longer exists.

If you are about to add a rule here, add it to `CLAUDE.md` instead.

## Base44 dev environment

- **Run:** `docker compose -f docker-compose.base44.yml up -d` (Node 22, bind-mounted source, `next dev` on port 3000).
- **No external secrets required to boot.** Core pages (Today, Map, Events, Saved, places, categories, towns) render from committed JSON/TS data in `src/data/`. Supabase, Mapbox, and DATABASE_URL are only needed for auth/saved/follows, interactive maps, and hybrid search — all fail closed when unset.
- **Preview origin:** `next.config.ts` appends `3000-$BASE44_PUBLIC_HOST_SUFFIX` to `allowedDevOrigins` so the preview proxy hostname is accepted for dev assets/HMR.
- **Env precedence:** `.env.base44-defaults` (placeholders, first) → `/run/base44/app.env` (platform secrets, last, always wins).
- **Dev-only streaming error:** `controller[kState].transformAlgorithm is not a function` appears in dev logs but does not affect rendered pages (200 + correct HTML).
