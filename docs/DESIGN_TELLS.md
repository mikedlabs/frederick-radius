# Design tells audit — does Frederick Radius look AI-generated?

Adapted from [JCarterJohnson/vibecoded-design-tells](https://github.com/JCarterJohnson/vibecoded-design-tells),
a study of what people actually flag as "this was vibe-coded." We committed its
scanner as `scripts/devibe_scan.py` and run it with `npm run scan:devibe`.

**Headline: the field-guide app is clean. The tells cluster in two places** — the
`/pitch` marketing deck (a deliberately separate world) and a few generic UI
primitives that leaked out of an early scaffold. This doc is the triage plus a
standing checklist so future UI/copy passes self-check.

## How to read the scanner

```
npm run scan:devibe                       # full report
python3 scripts/devibe_scan.py src --severity high
python3 scripts/devibe_scan.py src --json # CI (exit code = # of HIGH findings)
```

A regex scanner over-reports. The number that matters is **where** the hits land,
not the raw count. Mark a genuinely deliberate line with an `unslop-ignore`
comment and the scanner skips it — use this sparingly, only for real decisions.

## Baseline (2026-07, first run: 42 high / 460 medium)

### Where we already pass (by design)

- **No AI-purple, no gradient text, no neon glow in the app.** Palette is Signal
  vermilion + paper cream + Spruce + almanac gold. Headlines are solid-ink serif.
- **No emoji-as-icons** in the app (lucide throughout). No centered-hero +
  three-cards skeleton. No bento grid. No glassmorphism in the field-guide chrome.
- **Em dashes are already banned** in user-facing copy (`cleanFeedText` + the
  moments spec gate). That is one of the loudest *text* tells, already closed.
- Our specific cream `#EEE6D4` is not a stock "tasteful default" hex, and vermilion
  (not sage) is the bold accent — so the cream + serif look is anchored, not defaulted.

### Real findings, triaged

| Finding | Where | Verdict |
|---|---|---|
| AI-purple gradients, gradient text, neon glow (most HIGH hits) | `src/components/marketing/**` (the `/pitch` deck) | **Separate world.** CLAUDE.md scopes `/pitch` to its own dark marketing palette. It is, however, the textbook vibecoded stack. See "Open decision: /pitch". |
| `ui/gradient-text.tsx`, `ui/animated-button.tsx`, `ui/glass-card.tsx` | imported by marketing **and** `src/components/map/*` | **Scaffold leak.** Generic shadcn-ish primitives with purple/neon/glass defaults, used in the map overlay. Re-theme to `--app-*` tokens or replace with our own primitives. |
| Aurora background (`PageBloom`, 35 pages) | `src/components/ui/PageBloom.tsx` + `globals.css` aurora-orb | **Act on it.** Flagged as tell #9 (aurora/blob/mesh) *and* by our own perf audit (animated blurred orbs halve scroll FPS). See "Open decision: aurora". |
| Generic font: `Inter` for UI | `src/app/layout.tsx` | **Real tell + doc drift.** Ships Fraunces (display) + **Inter** (UI); CLAUDE.md still claims Newsreader/Public Sans. Fraunces is a defensible characterful choice; Inter is the "safe" one. See "Open decision: type". |
| `rounded-full` everywhere (353), fade-in/whileInView (93) | app-wide | **Mostly false positives.** Our pills are intentional mono micro-labels; motion is largely `prefers-reduced-motion`-gated. Low signal. Not worth chasing; `unslop-ignore` only if we CI-gate. |

## Open decisions (need an owner call, not an auto-fix)

1. **Aurora / PageBloom.** Recommend replacing the four animated screen-blended
   orbs with a single subtle *static* warm wash (keeps "whitespace reads warm, not
   flat paper"; kills the scroll-FPS cost and softens the aurora read). Reduced-motion
   users already get static, so this is the treatment the team already accepted,
   for everyone. Preview before shipping — it touches 35 pages via one component.
2. **Type.** Either update CLAUDE.md to the shipped truth (Fraunces + Inter + Mono)
   or swap Inter for a UI face with more character (Public Sans, as the docs claim,
   or another). Keep Fraunces. Resolve the doc-vs-code drift either way.
3. **/pitch deck.** Decide whether the investor/marketing deck should keep its
   cinematic-gradient look (a separate audience, arguably fine) or get de-vibed to
   match the field-guide restraint. If it stays, that is a *choice* — record it here
   so the scanner's HIGH count is understood, not alarming.

## The standing checklist (run before shipping a UI or copy pass)

- [ ] No violet/indigo/purple as an accent; no gradient-filled text; no unprompted glow.
- [ ] Color + type anchored to `--app-*` tokens and the brand, not library defaults.
- [ ] Icons are lucide (or none), never emoji. Radii come from the `--app-radius-*` scale by role.
- [ ] Motion communicates something and is `prefers-reduced-motion`-safe.
- [ ] Copy says what the thing does; no hype words; no em dashes; counts are supporting detail.
- [ ] `npm run scan:devibe` reviewed; any new HIGH hit is either fixed or `unslop-ignore`'d with a reason.
