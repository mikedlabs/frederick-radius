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
