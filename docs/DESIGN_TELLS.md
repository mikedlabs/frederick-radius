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

## Decisions (resolved 2026-07, owner call)

1. **Aurora / PageBloom → replaced with a static warm wash.** The four animated
   screen-blended orbs are gone; `PageBloom` now renders one still gradient wash
   (per-variant, section-accent-tinted) plus the grain. Keeps "whitespace reads
   warm, not flat paper"; removes the scroll-FPS cost and the aurora/blob tell.
   Reduced-motion users already saw static, so this just gives it to everyone.
   Dead `aurora-orb` keyframes/classes removed from `globals.css` (grain kept).
2. **Type → docs aligned to shipped truth.** The app ships **Fraunces** (display)
   + **Inter** (UI) + **JetBrains Mono**; CLAUDE.md now says so. Fraunces stays
   (characterful). Inter is kept as a deliberate, plain UI face paired with the
   display face — recorded here so the scanner's `generic-font` hit is understood,
   not a mistake. Revisit only if a UI face with more character is wanted later.
3. **/pitch deck → kept as a separate marketing world.** The investor/marketing
   deck deliberately uses a cinematic dark-gradient look for a different audience,
   scoped in CLAUDE.md (`.marketing-shell`). Its violet/neon HIGH hits in the
   scanner are therefore *expected and accepted*, not the field-guide app leaking.
   If the deck is ever folded into the product surface, de-vibe it then.

## The standing checklist (run before shipping a UI or copy pass)

- [ ] No violet/indigo/purple as an accent; no gradient-filled text; no unprompted glow.
- [ ] Color + type anchored to `--app-*` tokens and the brand, not library defaults.
- [ ] Icons are lucide (or none), never emoji. Radii come from the `--app-radius-*` scale by role.
- [ ] Motion communicates something and is `prefers-reduced-motion`-safe.
- [ ] Copy says what the thing does; no hype words; no em dashes; counts are supporting detail.
- [ ] `npm run scan:devibe` reviewed; any new HIGH hit is either fixed or `unslop-ignore`'d with a reason.
