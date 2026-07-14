# Frederick Radius — Design & UX Review

Reviewer: Claude (design-review command, 5 phases)
Date: 2026-07-14
Method: rendered-app audit against the shipped brand (`src/app/globals.css`
tokens, `CLAUDE.md`, `docs/VOICE.md`, `docs/DESIGN_TELLS.md`). Evidence is
Playwright screenshots at 375 / 768 / 1440 (`design-review/screenshots/`,
50 PNGs) plus axe-core contrast measurements and source citations.

Environment caveat: captures are from the local dev server (`localhost:3010`).
Dev has no Mapbox token (blank basemap on /map, /nearby, transit) and external
feeds rate-limit (Eventbrite 429, some iCal 503). Those are dev-only noise and
are excluded from findings. Everything below reproduces from source or from a
surface that does not depend on the missing token.

---

## Executive summary

Frederick Radius already reads like what it aims to be: a well-made field
guide. The token system is real and used with discipline, keyboard focus is
handled correctly, layout stability and load are excellent in dev (CLS
0–0.025, LCP < 2.5s), and the copy holds the calm-local-expert voice. This is
a strong baseline, not a rescue job. There are **no P0s** — nothing is broken,
blocking, or off-brand in a way a visitor would call a defect.

The review found **one systemic P1** and a cluster of **P2 consistency debt**
that, fixed together, would move the app from "clearly good" to "obviously
crafted."

The P1 is contrast. The brand vermilion used as **text** on the cream ground
measures **3.24:1** — below the WCAG AA floor of 4.5:1 for normal-size text.
This is not a one-off: small vermilion eyebrows, labels, times, and status
lines use `color: var(--app-brand)` in at least a dozen components. The fix is
already half-built — the token `--app-brand-press #B5300F` exists for exactly
this and measures **4.80:1** (passes). The work is to route text usages to it
while leaving `--app-brand` for fills, icons, and decoration (where the 3:1
graphical-object threshold is met).

The P2 cluster is consistency debt that a field guide feels acutely because
typography, not chrome, is doing the hierarchy work:

1. **Type-scale sprawl.** The app uses **32 distinct pixel font sizes**
   (8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16,
   17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 44 …). Half-step
   neighbors (12 vs 12.5, 13 vs 13.5) are indistinguishable on screen but
   multiply maintenance surface and let hierarchy drift. A field guide should
   run on a tight, named scale.
2. **A decorative "category accent" palette living outside the token system.**
   The same rainbow (food terracotta `#A03A22`, civic slate `#2F5470`, arts
   plum `#7E2C6F`, amber `#C99632` …) is re-typed as raw hex in at least five
   files. Some values are near-but-not-equal to real tokens (`#2F5470` vs
   `--app-cool #20506A`), which is drift waiting to happen and can't be
   contrast-checked centrally.
3. **Sub-44px tap targets** on a few secondary controls (the events
   list/calendar view switch), against the project's own ≥44px rule.
4. **Card drift across surfaces** — place cards on /search and /nearby don't
   share one component, so spacing and metadata differ for the same object.

None of this is visible as "ugliness" — it's the kind of debt that keeps a
good app from feeling inevitable. The fix plan below is mostly mechanical and
low-risk, front-loaded on the one accessibility issue that actually matters.

### What is already right (keep, don't churn)

- **Focus-visible works.** Keyboard Tab shows a clear vermilion ring on the
  top search pill and on the beta CTA (`state-today-tab-focus.png`,
  `state-beta-cta-focus.png`). No change needed.
- **Token discipline is real.** `var(--app-*)` is used pervasively for UI
  color; raw hex in app UI is the exception, not the rule.
- **Performance is excellent in dev.** CLS 0–0.025, LCP < 2.5s across
  captured routes.
- **Voice holds.** Sentence-case, no em dashes, verb-first chips, honest
  empty states (`EmptyState.tsx`). This matches `docs/VOICE.md`.

---

## Scorecard (1–10)

| Area | Score | One-line |
|---|---:|---|
| 1. Visual hierarchy & layout | 8 | Typography carries hierarchy well; a few dense surfaces could breathe. |
| 2. Typography (scale & rhythm) | 6 | Right typefaces, right intent, but 32 ad-hoc sizes undercut the system. |
| 3. Color & contrast | 5 | Palette is beautiful; small vermilion **text** fails AA (3.24:1). Systemic. |
| 4. Spacing & density | 8 | Field-guide density is deliberate and mostly well-judged. |
| 5. Component consistency | 6 | Card patterns diverge across /search vs /nearby; accent palette forked. |
| 6. Interaction & states | 8 | Focus, empty, error, loading states are handled; a few tap targets small. |
| 7. Motion | 8 | Reveal-on-scroll and durations respect reduced-motion; restrained. |
| 8. Accessibility (non-contrast) | 7 | Good semantics and live regions; contrast is the gap (scored in 3). |
| 9. Responsive (375/768/1440) | 8 | Holds across breakpoints; no horizontal scroll or overlap observed. |
| 10. Copy & voice | 9 | Calm, plain, on-brand. The clearest-executed part of the app. |

Weighted read: a genuinely good app (avg ~7.3) with one accessibility issue
worth treating as the headline and a tidy-up pass behind it.

---

## Findings by severity

Each finding: **what** · **where** (file:line + route/viewport/screenshot) ·
**why it matters** · **fix**.

### P1 — should fix before wider launch

**P1-1 · Small vermilion text on cream fails WCAG AA (systemic).**
- **Where:** `color: var(--app-brand)` used as a text color in, among others:
  - `src/components/place/FieldNotesCard.tsx:76` (10px mono eyebrow)
  - `src/components/municipality/TownAlmanac.tsx:72` (10px mono eyebrow)
  - `src/components/event/SeriesCard.tsx:43` (10px bold uppercase)
  - `src/components/ask/AskFrederick.tsx:74` (11px semibold uppercase)
  - `src/components/event/EventsMapInner.tsx:138` (11px semibold)
  - `src/components/proto/TimeLens.tsx:138` (12px mono time)
  - `src/components/feedback/FeedbackWidget.tsx:249` (13px status text)
  - Additional matches in `SortDropdown.tsx:155`, `EmptyState.tsx:43`,
    `SeriesCard.tsx:150`, `EventAgenda.tsx:109`, `AskFrederick.tsx:144`.
  - Also the beta CTA label: white on `--app-brand` ≈ 4.17:1
    (`BetaEmailField.tsx:82–90`, `beta-375-fold.png`) — a 13px semibold label,
    which is "normal" text for WCAG, so it too misses 4.5:1.
- **Why:** `--app-brand #E14328` on `--app-bg #EBE2CD` = **3.24:1** (measured;
  matches axe-core). AA needs **4.5:1** for normal text. These are all small
  text. It reads fine to most sighted users but fails a real bar and is the
  one thing an accessibility audit will flag first. (Icons/graphics in
  `--app-brand` are fine — the 3:1 graphical-object threshold is met; this is
  strictly a **text** finding.)
- **Fix:** route text usages of `--app-brand` to the existing
  `--app-brand-press #B5300F` (**4.80:1**, passes). Leave `--app-brand` for
  fills, icon strokes, borders, rings, and 18.66px-bold / 24px+ display text.
  For the beta button, either darken the fill to `--app-brand-press` or keep
  the fill and confirm the label is bumped to large/bold. This is mechanical
  and testable — add an axe assertion so it can't regress.

### P2 — consistency & polish

**P2-1 · Type scale sprawl (32 distinct sizes).**
- **Where:** app-wide. Counts from inline `text-[Npx]`: 11px×415, 12px×274,
  13px×250, 10px×220, 14px×148, 15px×80, 12.5px×64, 10.5px×51, 16px×42 … down
  to one-offs at 8px, 8.5px, 9.5px, 13.5px, 15.5px, 40px.
- **Why:** the field-guide aesthetic leans on type, not boxes, to signal
  hierarchy (`CLAUDE.md`, `docs/DESIGN_TELLS.md`). Thirty-two sizes — many
  separated by half a pixel — means the hierarchy is improvised per file
  rather than expressed through a shared scale. It also makes every future
  tweak a hunt.
- **Fix:** define a named scale (proposal below) of ~8 steps and collapse
  half-step neighbors onto it (12.5→12 or 13; 10.5→10 or 11). Do it as a
  find-and-map pass, surface by surface, verifying screenshots — not a global
  sed. No visual regression is the acceptance bar.

**P2-2 · Category-accent palette hardcoded outside tokens.**
- **Where:** the same decorative accents re-typed as raw hex in
  `src/components/event/WeekendVibes.tsx:33–39`,
  `src/components/plan/PlanBuilder.tsx:75–99`,
  `src/components/settings/PreferencesPanel.tsx:61–68`,
  `src/components/ui/CategoryGraphic.tsx:49–54`, and (map layers)
  `src/components/transit/TransitMap.tsx:259,322,352,368`.
- **Why:** the food terracotta `#A03A22` is typed four separate times; civic
  slate `#2F5470` appears in three files and is *close to but not equal to*
  `--app-cool #20506A` — exactly the drift the token system exists to prevent.
  Because these live in component files, they can't be tuned or
  contrast-checked centrally.
- **Nuance / honest exception:** the **TransitMap** values are Mapbox GL layer
  paint. GL layers are evaluated outside the DOM and cannot read CSS custom
  properties, so raw hex there is legitimate — the only ask is to make those
  literals *match* the token values (or a shared JS constant) so the map is not
  subtly off-brand versus the rest of the app.
- **Fix:** add a `--app-cat-*` token set (or a single typed `CATEGORY_ACCENTS`
  map in `src/data/categories.ts`) and import it everywhere, including a JS
  mirror for the map layers. One source of truth, contrast-checkable.

**P2-3 · Sub-44px tap targets on the events view switch.**
- **Where:** `src/app/(app)/events/(list)/calendar/page.tsx:46–52` — the
  "List view" link is `px-3 py-1.5 text-xs` (≈30px tall). The mirror
  "Calendar" control on the events list header is the same size.
  (`events-375-fold.png`.)
- **Why:** the project rule is ≥44px effective tap target (`CLAUDE.md`).
  These secondary switches miss it; on a phone they're a fiddly hit.
- **Fix:** apply `.tap-44` (globals.css) or bump padding so the effective
  target is ≥44px without changing the visual size. Low-risk, already the
  house pattern.

**P2-4 · Place cards drift across surfaces.**
- **Where:** /search results vs /nearby results (`search-375-full.png` vs
  `nearby-375-full.png`). Same object type, different card treatment —
  spacing, which metadata shows, and icon usage differ. On /search, every
  place result uses the generic `MapPin` icon regardless of category
  (`src/app/(app)/search/page.tsx`), so the icon carries no information.
- **Why:** the same thing should look the same everywhere; divergence reads as
  two half-finished designs rather than one system. The always-`MapPin` icon
  is visual noise pretending to be signal.
- **Fix:** converge on one place-card component (or one shared card body) used
  by both surfaces; either give the icon real meaning (category glyph) or drop
  it. Medium effort — worth scoping before doing.

### P3 — minor / nice-to-have

**P3-1 · Half-pixel and sub-10px type at the very bottom of the scale.**
- **Where:** `text-[8px]`, `text-[8.5px]`, `text-[9px]`, `text-[9.5px]`
  usages (e.g. dense mono labels).
- **Why:** 8px text is below comfortable legibility even for mono metadata.
- **Fix:** floor decorative mono labels at 9–10px; fold into P2-1's scale.

**P3-2 · Confirm the beta success live-region wording length.**
- **Where:** `src/components/beta/BetaEmailField.tsx:52` — "Sent. Check your
  email for your access code, then come on in." is on-voice and correct; only
  flagging that it's a longish single status string. No change required; noted
  for completeness.

---

## Token-consolidation proposal

Two additions to `src/app/globals.css`, both additive (no existing token
touched, so the marketing `.marketing-shell` palette is untouched):

**1. A named, tight type scale.** Introduce CSS custom properties so text
sizes reference intent, not magic pixels:

```
--fs-eyebrow: 10px;   /* mono/uppercase labels */
--fs-meta:    11px;   /* dense metadata, counts */
--fs-body-sm: 12px;
--fs-body:    13px;   /* default UI body */
--fs-body-lg: 15px;
--fs-title-sm:18px;
--fs-title:   22px;
--fs-display: 30px;   /* Fraunces headers */
```

Adopt surface by surface; collapse the 32 ad-hoc sizes onto these ~8 steps.
The goal is not a global rewrite in one PR — it's stopping the sprawl and
migrating high-traffic surfaces (/today, /events, /search, place detail)
first.

**2. Category accents as tokens.** Promote the forked decorative palette to
one source:

```
--app-cat-food:     #A03A22;  /* verify AA if ever used as text */
--app-cat-civic:    #2F5470;  /* reconcile with --app-cool #20506A */
--app-cat-arts:     #7E2C6F;
--app-cat-outdoors: #1E6B3A;
--app-cat-family:   #C99632;
--app-cat-music:    #7E2C6F;
```

…with a JS mirror (`CATEGORY_ACCENTS` in `src/data/categories.ts`) for the
Mapbox layers that can't read CSS vars. Every component imports one of these;
no component types a category hex again.

**3. Contrast policy for `--app-brand`.** Document the rule already implied by
the fix: `--app-brand` = fills / icons / borders / large-bold display only;
`--app-brand-press` = any small or normal-weight **text**. Encode it as an
axe assertion in the test suite so it can't regress.

---

## Prioritized fix plan

Sized S (≲1hr) / M (a few hrs) / L (scoped session). Ordered by
value-over-risk.

| # | Fix | Sev | Size | Risk | Notes |
|---|---|---|---|---|---|
| 1 | Route small vermilion **text** → `--app-brand-press`; add axe assertion | P1 | M | Low | The one that matters. Mechanical + a guard test. |
| 2 | `.tap-44` the events list/calendar view switch | P2 | S | Low | House pattern already exists. |
| 3 | Tokenize category accents (`--app-cat-*` + JS mirror); reconcile `#2F5470`→`--app-cool` | P2 | M | Low | Kills 5-file hex duplication + drift. |
| 4 | Introduce named type scale; migrate /today, /events, /search, place detail | P2 | L | Med | Screenshot-verified, surface by surface. No global sed. |
| 5 | Converge /search and /nearby place cards; fix the meaningless `MapPin` | P2 | M | Med | Scope first — decide one card contract. |
| 6 | Floor sub-10px mono labels at 9–10px | P3 | S | Low | Folds into #4. |

Recommended first PR: **#1 + #2** together — highest value, lowest risk, both
small and independently verifiable. Then #3. Then #4 as its own focused pass.
#5 needs a design decision before code.

---

## Method appendix

- **Screens:** `design-review/screenshots/` — `{beta,today,map,events,search,`
  `nearby,pulse,place}-{375,768,1440}-{fold,full}.png`, plus
  `state-today-tab-focus.png` and `state-beta-cta-focus.png`.
- **Contrast:** axe-core injected in-page; key ratios recomputed by hand
  (`--app-brand` on `--app-bg` = 3.24:1; `--app-brand-press` = 4.80:1;
  white on `--app-brand` ≈ 4.17:1) to confirm the tool.
- **Type-scale counts:** ripgrep over `src/app` + `src/components` for
  `text-[Npx]`, de-duplicated.
- **Not counted as findings:** dev-only blank Mapbox basemap, dev feed
  rate-limits (Eventbrite 429 / iCal 503). Not reproducible in prod.
