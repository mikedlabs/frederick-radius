# Agent C: Design System Forensics

Phase 0 of the premium redesign program. Date: 2026-06-12. Scope: measure the
drift between the intended design system (globals.css tokens plus design docs)
and what production code uses. Method: full read of `src/app/globals.css`
(1,974 lines), the design docs in `docs/`, git history, and regex censuses over
all 322 `.tsx` files in `src/`. Zero code changes were made. Every count below
includes the command that produced it.

---

## 1. Intended system

### 1.1 Token inventory (src/app/globals.css)

The file defines 123 custom properties. They split into a marketing set and an
app set. The dark `--background` / `--foreground` / violet / cyan / amber
tokens (about 20 properties) belong to the marketing shell (`.marketing-shell`,
/pitch) and are out of scope here.

The app system, "Brand Book No. 01 (May 2026)" per the file comments:

| Group | Count | Tokens |
| --- | --- | --- |
| Surface colors | 9 | `--app-bedrock` #0A0A0A, `--app-paper` #F4EFE6, `--app-paper-2` #ECE5D5, `--app-bg` #EEE6D4, `--app-bg-elevated-solid` #F8F2E6, `--app-bg-elevated` (93% mix), `--app-bg-sunken` #E3D8C2, `--app-border` #DBD2BF, `--app-border-strong` |
| Ink | 4 | `--app-ink` #16140E, `--app-ink-2` #423E34, `--app-ink-3` #5C5A50, `--app-ink-inverse` #EEE6D4 |
| Brand and accents | 7 | `--app-brand` #E14328 (Signal vermilion), `--app-brand-press` #B5300F, `--app-brand-2` #16352B (Spruce), `--app-accent` #C0871F (Almanac gold), `--app-cool` #20506A (Slate), `--app-cool-2` #4A7090, `--app-sage` #859076 |
| Status | 4 | `--app-positive` #1E6B3A, `--app-warning` #B26B00, `--app-danger` #B4231E, `--app-info` #2F5470 |
| Open-state semantic set | 7 | `--state-open(-bg)`, `--state-closing(-bg)`, `--state-closed(-bg)`, `--state-unknown` |
| Tint utilities | 14 | `--app-{brand,cool}-tint-{6,14,22}`, `--app-{positive,warning,danger}-tint-{6,14}`, `--app-ink-tint-{6,12}` |
| Brief-named aliases | 10 | `--paper(-2,-3)`, `--ink(-2,-3)`, `--clay(-deep,-soft)`, `--moss` |
| Radii | 4 | `--app-radius-sm` 9px, `-md` 16px, `-lg` 24px, `-xl` 32px |
| Shadow / depth | 14 | `--app-shadow-1/2/3`, `--app-elev-1/2/3/4`, `--app-hi`, `--app-edge`, `--app-lip`, `--app-deck-edge`, `--app-gloss`, `--app-paper-light`, `--app-brand-glow` |
| Motion | 6 | `--app-ease-out`, `--app-ease-spring`, `--app-ease-bounce`, `--app-dur-fast/med/slow` |
| Z-index | 13 | `--z-base` 0 through `--z-skip` 100, one named owner per layer (docs/Z_INDEX.md) |
| Spacing | 0 | No spacing tokens exist. The only spacing rule is a prose policy in docs/STYLE.md: use `space-y-2`, `space-y-3`, `space-y-6` and avoid 4 and 5. |

Reproduce: `grep -oE '^\s*--[a-z0-9-]+:' src/app/globals.css | tr -d ' :' | sort -u | wc -l`

### 1.2 Intended type system

globals.css ships a semantic scale of 8 fixed sizes plus 3 fluid display steps
and the eyebrow (lines 1326 to 1334, comment block at 1270 to 1292):

- `.text-caption` 10px, `.text-meta` 11px, `.text-meta-lg` 12px, `.text-body`
  13px, `.text-body-lg` 14px, `.text-title-sm` 15px, `.text-lead` 16px,
  `.text-title` 18px serif.
- `.display-1` (clamp 2.2rem to 3.6rem), `.display-2` (1.5 to 2.25rem),
  `.display-3` (1.25 to 1.5rem), `.eyebrow` 11px uppercase.
- Line heights are baked into the classes. The stated weight rule: 400 quiet,
  500 labels, 600 titles, 700 numerics only. The comment cites "~600 instances
  of text-[Npx]" and "624 uses" of semibold as the problem this scale replaces.

Fonts: three faces, loaded in `src/app/layout.tsx` via next/font with weights
400/500/600/700 (sans, display) and 400/500/600 (mono). `.font-serif` maps to
`var(--font-display)`.

### 1.3 Brand history: Fraunces, Creek blue, and three palette generations

The history is recoverable from git and the docs, and it shows the display
face changed twice in five days:

| Date | Change | Evidence |
| --- | --- | --- |
| May 2026 | Token audit generation: bg #F4EFE6, brand brick #A8462C, "Carroll Creek slate" #2F5470 (the "Creek blue" family), Newsreader named as the serif | docs/STYLE.md (still documents this generation) |
| 2026-06-03 | "Warm the canvas": paper moved toward almanac #E5D8BF | PR #415, commit 20c0934 |
| 2026-06-05 | Brand deck adoption: paper #E5D8BF to #EEE6D4, ink #1A1815 to #16140E, brick #A03A22 to Signal vermilion #E14328, Spruce #16352B, slate #2F5470 to #20506A. Fonts swapped Fraunces to Newsreader and Inter to Public Sans | PR #431, commit 5e76a25 |
| 2026-06-10 | Premium Overhaul Phases 0-2 swapped the fonts BACK: Newsreader to Fraunces, Public Sans to Inter, with the comment "resolves the documentation versus production contradiction" | PR #542, commit 280ebe5, src/app/layout.tsx lines 17 to 29 |

Reproduce: `git log --follow --oneline -- src/app/globals.css` and
`git show 5e76a25 -- src/app/layout.tsx`, `git show 280ebe5 -- src/app/layout.tsx`.

Consequences, all verifiable today:

1. **CLAUDE.md (updated June 9, PR #531) states "font-serif = Newsreader" and
   names Public Sans as the UI face. Production (June 10, PR #542) ships
   Fraunces and Inter.** The project's normative instruction file and the
   shipped code disagree about the display face.
2. docs/DESIGN_UX_AUDIT.md line 41 struck out "Fraunces" and corrected it to
   "Newsreader" as the shipped face. That correction is now itself stale.
3. docs/mapbox-field-guide-style.md instructs the Studio basemap to use
   Newsreader labels, and its palette table mirrors the May generation
   (#F4EFE6 land). `applyFrederickPalette.ts` paints the live basemap with 13
   hardcoded hexes from that older generation while the app ground is #EEE6D4.
4. docs/STYLE.md, the self-described "source of truth," documents the May
   palette (#F4EFE6 bg, #A8462C brand) one full generation behind globals.css.

There is no single document that matches production. Four documents describe
three different systems.

---

## 2. Production reality

All counts are over `src/**/*.tsx` (322 files) unless stated. Census date
2026-06-12, HEAD = 855b246.

### 2.1 Font sizes: intended 11, found 34

```
grep -rhoE 'text-\[[0-9.]+(px|rem|em)\]' src --include='*.tsx' | sort | uniq -c | sort -rn
grep -rhoE '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b' src --include='*.tsx' | sort | uniq -c
grep -rhoE 'fontSize:\s*"?[^,}"]+' src --include='*.tsx' | sort | uniq -c
```

- Arbitrary `text-[Npx]`: **27 unique sizes, 1,259 uses** (9 through 64px;
  every integer from 9 to 24 except 25 appears). Top: 11px x349, 12px x214,
  13px x169, 10px x167.
- Standard Tailwind steps: **13 unique, 416 uses** (xs x174, sm x107, plus 4xl
  through 9xl on marketing scenes).
- Inline `fontSize:`: about 70 uses, adding 10.5px, 12.5px, and a 76px clamp.
- Semantic scale adoption: **42 uses of the 8-step scale plus displays**
  (`text-body` 7, `text-meta` 6, `text-meta-lg` 12, `text-caption` 1,
  `text-body-lg` 1, `text-lead` 0, `text-title` 0, `text-title-sm` 0,
  `display-1/2/3` 15) plus 143 `.eyebrow`.

Merged, production renders **about 34 distinct static font sizes** plus 3
fluid clamps. The canonical scale shipped June 10 and has 42 adoptions against
roughly 1,745 bypassing declarations, an adoption rate of 2.4 percent.

### 2.2 Font weights: intended 4, found 5 (one unbacked)

```
grep -rhoE '\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b' src --include='*.tsx' | sort | uniq -c
grep -rhoE 'fontWeight:\s*"?[0-9]+' src --include='*.tsx' | sort | uniq -c
```

font-semibold **708**, font-medium 182, font-bold 155, font-light 33,
font-normal 5, plus 21 inline `fontWeight`. Two problems: semibold is 65
percent of all weight declarations (the monotony the weight rule targets grew
from the documented 624 to 708), and `font-light` requests weight 300, which
no loaded face supplies (layout.tsx loads 400 to 700). 31 of the 33
font-light uses are marketing scenes; 2 are app surfaces.

### 2.3 Line height and tracking: intended baked-in, found 13 and 16

```
grep -rhoE '\bleading-(none|tight|snug|normal|relaxed|loose|[0-9]+|\[[^]]+\])' src --include='*.tsx' | sort | uniq -c
grep -rhoE '\btracking-(tighter|tight|normal|wide|wider|widest|\[[^]]+\])' src --include='*.tsx' | sort | uniq -c
```

- Leading: **13 distinct values, 387 uses** (tight 135, snug 101, relaxed 96,
  none 39, plus 9 arbitrary). The scale's premise is that callers never set
  leading; 387 callers set it.
- Tracking: **16 distinct values, 568 uses** (tracking-tight 235, then a
  spread of 11 arbitrary em values: 0.04 through 0.22em). The intended system
  defines 8 tracking values inside classes; components freelance 11 more.

### 2.4 Color: 55 tokens intended, plus 117 raw hexes found

```
grep -rhoE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b' src --include='*.tsx' | tr 'A-F' 'a-f' | sort -u | wc -l   # 117
grep -rhoE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b' src --include='*.tsx' | wc -l                              # 453
grep -rhoE 'rgba?\([^)]+\)' src --include='*.tsx' | sort -u | wc -l                                          # 79 unique, 144 uses
grep -rho 'color-mix(' src --include='*.tsx' | wc -l                                                         # 303
grep -rhoE 'var\(--app-[a-z0-9-]+' src --include='*.tsx' | wc -l                                             # 4,172
grep -rcE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b' src --include='*.tsx' -r | grep -v ':0$' | sort -t: -k2 -rn  # offenders
```

- **Raw hex: 117 unique values, 453 occurrences** (111 unique, 410 occurrences
  after excluding `src/components/marketing`). The single most common
  hardcoded color in the app is **#A03A22 x49, the brand color that was
  retired on June 5**. Third is #2F5470 x33, the retired Creek slate. The
  current brand #E14328 is hardcoded 8 times. In other words, 49 elements
  silently skipped the rebrand and still paint last month's brand.
- **Worst offender files:** `src/components/map/AppMap.tsx` (68),
  `src/components/map/popups.tsx` (24), `src/components/radius/RadiusMap.tsx`
  (20), `src/components/today/SkyHero.tsx` (18),
  `src/components/plan/PlanBuilder.tsx` (13),
  `src/components/map/MapOverlays.tsx` (12), `src/app/api/og/route.tsx` (12).
- **rgba(): 79 unique, 144 uses.** **Inline color-mix(): 303 uses.** The tint
  tokens were created (per docs/STYLE.md) to retire "200+" inline color-mix
  calls; the count has since grown to 303.
- **Token adoption is real: 4,172 `var(--app-*)` reads across 249 of 322
  files.** The system is used heavily AND bypassed heavily at the same time.
- **Phantom tokens (referenced, never defined):** `--app-on-brand` (5 uses),
  `--app-negative` (5 uses), `--app-ink-tint-8` (1 use). All ride on inline
  fallbacks, and two fallbacks are off-palette: cancelled-event badges render
  `#C0392B` instead of `--app-danger` #B4231E, and a warning path falls back
  to `#B8860B` instead of `--app-warning` #B26B00. Verify with
  `grep -rn 'app-on-brand\|app-negative\|ink-tint-8' src`.
- **Data-layer hexes:** `src/data` plus `src/lib` `.ts` files hold 128 hex
  occurrences (50 unique). `src/data/categories.ts` alone carries 17 unique
  category accents including the retired #A03A22 (food) and the retired
  #A02929 danger. `src/data/intents.ts` hardcodes the same retired hexes for
  the six home-screen tiles.

### 2.5 Border radii: intended 4, found about 20

```
grep -rhoP 'rounded(?:-(?:t|b|l|r))?(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?(?![\w\[-])' src --include='*.tsx' | sort | uniq -c
grep -rhoE 'rounded(-[a-z]+)?-\[[^]]+\]' src --include='*.tsx' | sort | uniq -c
grep -rhoE 'borderRadius:\s*"?[^,}"]+' src --include='*.tsx' | sort | uniq -c
```

- Token-routed: 365 uses of `rounded-[var(--app-radius-*)]` (md 194, lg 145,
  xl 12, sm 9) plus 1 inline. This is the healthy path.
- Named Tailwind utilities: 528 `rounded-full` (pills, legitimate), then 21
  bare `rounded`, 19 `rounded-xl`, 18 `rounded-2xl`, 9 `rounded-3xl`, 7
  `rounded-lg`, 4 `rounded-md`, 2 `rounded-sm`: roughly 80 uses of radius
  steps that live outside the 9/16/24/32 token ladder.
- Raw arbitrary: 2px, 6px, 7px, 11px, 12px, 22px, 24px, one calc() (12 uses).
- Inline `borderRadius`: 9999, 999, 8, 2 (24 uses).

Distinct radius values in production: the 4 tokens plus full, plus about 15
foreign values. Intended 4, found about 20.

### 2.6 Shadows: intended 14 tokens, found 14 + 12 foreign recipes + 33 inline combos

```
grep -rhoE 'shadow-\[[^]]+\]' src --include='*.tsx' | sort | uniq -c
grep -rhoE 'boxShadow:\s*"[^"]+"' src --include='*.tsx' | sort | uniq -c
grep -rhoE '\b(tactile(-interactive|-lift|-feature|-ring|-glow-brand|-e[234])?|deck-card)\b' src --include='*.tsx' | sort | uniq -c
```

- The tactile system is well adopted: 264 class uses (`tactile` 126,
  `tactile-interactive` 105, lift 9, glow-brand 7, feature 6, e2/e3/e4 9,
  deck-card 2).
- Token-composed shadows also arrive as 160 inline `boxShadow:` strings in 33
  unique hand-assembled combinations (top:
  `"var(--app-elev-1), var(--app-edge), var(--app-hi)"` x29). The same recipe
  the `.tactile` class provides is retyped by hand across components, so one
  token change can produce 33 subtly different stacks.
- Foreign shadows: about 12 unique raw rgba() recipes (8 are marketing glows,
  4 are app surfaces) plus 6 named Tailwind classes (33 uses: `shadow` 12,
  `shadow-2xl` 8, `shadow-xl` 6, `shadow-lg` 5) that ignore the warm-ink
  shadow color entirely.

### 2.7 Spacing: 9 arbitrary uses (clean), but the named scale sprawls

```
grep -rhoE '\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[[^]]+\]' src --include='*.tsx' | sort | uniq -c
grep -rhoE '\bspace-y-[0-9.]+' src --include='*.tsx' | sort | uniq -c
```

- Arbitrary spacing is the one clean category: **9 uses**, and 4 of them are
  `env(safe-area-inset-*)` expressions that have no token alternative.
- The policy scale leaks instead: docs/STYLE.md mandates `space-y-2/3/6` only.
  Production uses **11 distinct space-y steps**; 255 of 416 uses (61 percent)
  conform. The banned `space-y-4` (30) and `space-y-5` (17) persist, plus
  off-policy 0.5/1/1.5/2.5/7 (113 uses). `gap-*` spans 14 distinct steps.

### 2.8 Z-index: 13 tokens, 56 token uses vs 78 raw uses

```
grep -rhoE '\bz-(\[[^]]+\]|[0-9]+)' src --include='*.tsx' | sort | uniq -c
grep -rho 'var(--z-' src --include='*.tsx' | wc -l
```

Token-routed: 24 `z-[var(--z-*)]` classes plus 32 inline `var(--z-` styles.
Raw: z-10 x47 and z-0 x5 (sanctioned for local in-card stacking per the token
comment), but also z-20 x12, z-50 x7, z-30 x1, and **z-[1000] x4**, which
violate the "never a raw z-[NNN]" rule and sit above `--z-skip` 100.

---

## 3. Type scale audit

### 3.1 Is the de facto scale modular?

No. The 34 found sizes include every integer pixel from 9 to 24, then 26, 27,
28, 30, 32, 34, 36, 40, 44, plus half-pixels 10.5 and 12.5 inline. No ratio
fits consecutive steps of 1px. This is accretion: each component picked the
pixel that looked right that day. The intended 8-step scale (10/11/12/13/14/
15/16/18) is itself near-linear rather than modular, but it is at least a
closed set. Production honors neither: 42 semantic-class adoptions against
about 1,745 ad-hoc size declarations.

### 3.2 Per-screen measurement against the 5-size ceiling

Method: union of `text-[Npx]`, named Tailwind sizes, semantic classes, and
inline `fontSize` per surface's source files (command pattern in section 2.1,
scoped to the files listed).

| Surface | Files measured | Distinct sizes | Ceiling | Verdict |
| --- | --- | --- | --- | --- |
| Home (/guide) | `src/app/(app)/guide/page.tsx`, `FunnelFlow.tsx`, `HiddenGemsRail.tsx`, `LiveDowntown.tsx` | **10** (11, 12, 13, 14, 15, 16, 18, 30, 36, display-2 clamp) | 5 | 2.0x over |
| Map sheet | `src/components/place/PlaceSheet.tsx` | **9** (9, 10, 11, 12, 13, 14, 18, 22, 24) | 5 | 1.8x over; the /map screen adds inline 15px from `MapOverlays.tsx`, lifting the composite to 10 |
| Place detail | `src/app/(app)/places/[slug]/page.tsx`, `PlaceHero.tsx`, `GoogleHours.tsx`, `KnownForCard.tsx`, `HoursBlock.tsx`, `BusinessExtrasCard.tsx` | **8** (10, 11, 12, 13, 14, 15, 18, display-2) | 5 | 1.6x over |

Faces: production uses exactly one display serif, one UI sans, one data mono
(226 `font-serif`, 22 `font-mono` class uses), which meets the premium target
structurally. The defect is that three normative sources disagree on WHICH
serif (section 1.3), and a 9px size exists (PlaceSheet) below the smallest
intended step.

The pattern across all three surfaces: the 10 to 15px band is where the
sprawl lives. Five sizes inside 6 pixels (10, 11, 12, 13, 14, 15) appear on
every surface, doing work that 2 sizes plus weight could do.

---

## 4. Color ratio audit

Premium target: about 80 percent neutral field, 15 percent structure, 5
percent accent, with the accent spent only on the primary action.

### 4.1 Home (/guide)

The neutral field holds: the cream ground plus translucent elevated lanes
cover roughly 75 to 80 percent of the viewport by area. The accent budget does
not hold. Above the fold the screen spends accent color on:

- The search pill: a vermilion-tinted icon chip AND a solid vermilion arrow
  button (`FunnelFlow.tsx:348,357`). This is the legitimate primary action,
  but it is already two accent hits in one control.
- Six intent tiles, each washed with a DIFFERENT accent hue at 14 percent plus
  a full-strength icon stamp (`FunnelFlow.tsx:745`, colors from
  `src/data/intents.ts`: #8B5A2B, #A03A22, #7E1F1F, #C99632, #1E6B3A,
  #7E2C6F, #A02929).
- The active nav tab: a brand gradient pill plus brand icon
  (`BottomNav.tsx:113-148`, `SideRail.tsx:98-133`).
- The TopBar brand dot (`TopBar.tsx:142`).

Counting painted non-text UI elements above the fold, roughly 10 of about 30
carry an accent. Estimated split: about 78 percent field, about 10 percent
structure, about 12 percent accent, with the accent split across 8 hues
instead of 1. The "one sharp accent" premise fails twice: too much accent, and
too many accents.

### 4.2 Map sheet (PlaceSheet)

Closer to target, roughly 80 / 12 / 8. The sheet body is neutral; accent
arrives via the category color on the icon stamp and two vermilion spends
listed below.

### 4.3 Every non-primary vermilion spend found

These are the places `--app-brand` (or brand-press) is spent on elements that
are not the screen's primary action, which dilutes the signal:

| Element | Location |
| --- | --- |
| Active nav tab pill, glow, and icon | `src/components/nav/BottomNav.tsx:113,115,148`; `SideRail.tsx:98,100,133` |
| TopBar status dot | `src/components/nav/TopBar.tsx:142` |
| Nearest-town marker in LocationChip | `src/components/nav/LocationChip.tsx:162` |
| County pulse and Amenities icons in MoreSheet | `src/components/nav/MoreSheet.tsx:62,65` |
| Result count badge (a count, not an action) | `src/components/guide/FunnelFlow.tsx:348` |
| "Clear filters" and "go back" inline links | `src/components/guide/FunnelFlow.tsx:555,563` |
| "See all" rail link (brand-press) | `src/components/guide/HiddenGemsRail.tsx:44` |
| Parking car icon inside the sheet | `src/components/place/PlaceSheet.tsx:471` |
| "See full page" footer link | `src/components/place/PlaceSheet.tsx:567` |
| Category fallback color (any uncategorized place renders brand) | `src/components/place/PlaceSheet.tsx:126` |
| Route accent: /today and /events re-tint whole routes brand | `src/components/nav/RouteAccent.tsx:26,32` (its own comment says brand "is for the single primary CTA") |
| Eyebrow ink is brand-mixed | `.fg-eyebrow`, globals.css:1853 |
| Brand `Pill` tone available to any chip row | `src/components/ui/Pill.tsx` |

Reproduce: `grep -rn 'app-brand' src/components --include='*.tsx' | grep -v 'brand-2'` (366 brand reads total).

---

## 5. Hardcoded value census (the Phase 4 zero baseline)

Scope: `src/components/` (253 `.tsx` files), the rebuild surface.

```
grep -rhoE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b' src/components --include='*.tsx' | wc -l          # 385
grep -rhoE '[a-z][a-z0-9-]*-\[[^]]+\]' src/components --include='*.tsx' | wc -l                     # 1,775
grep -rhoE '[a-z][a-z0-9-]*-\[[^]]+\]' src/components --include='*.tsx' | grep -c 'var(--'          # 484
grep -rho 'style={{' src/components --include='*.tsx' | wc -l                                       # 1,717
grep -rl 'style={{' src/components --include='*.tsx' | wc -l                                        # 202
```

| Category | Count |
| --- | --- |
| Raw hex color literals | **385** |
| Arbitrary Tailwind values, raw (no token inside) | **1,291** |
| Arbitrary Tailwind values that wrap a token (`rounded-[var(--app-radius-md)]` style) | 484 |
| Inline `style={{}}` objects | **1,717** (in 202 of 253 files, 80 percent) |
| **Baseline the rebuild must drive to zero** | **3,393 strictly hardcoded instances, 3,877 including the 484 token-bridging arbitraries that should become utilities** |

Worst inline-style files: `EventCard.tsx` 66, `PlanBuilder.tsx` 65,
`RadiusBuilder.tsx` 63, `AppMapDeck.tsx` 50, `PlaceSheet.tsx` 48,
`SearchOverlay.tsx` 42, `AppMap.tsx` 39, `PlaceCard.tsx` 38.

For context across all of `src/`: 453 raw hexes, 2,594 arbitrary values, 2,611
inline style objects.

---

## Drift summary table

| Category | Intended | Found | Drift |
| --- | --- | --- | --- |
| Font faces | 3 (Newsreader, Public Sans, JetBrains Mono per CLAUDE.md) | 3 loaded, but Fraunces and Inter (PR #542) | Right count, wrong faces vs the stated truth; 2 flips in 5 days |
| Font sizes | 8 fixed + 3 fluid + eyebrow (12) | 34 distinct static + clamps; scale adoption 42 uses vs ~1,745 bypasses | 2.8x the intended set |
| Sizes per screen | 5 ceiling | home 10, map sheet 9, place detail 8 | 1.6x to 2.0x over |
| Font weights | 4 (400/500/600/700) | 5 in use; 708 of 1,083 are semibold; 33 uses request unloaded 300 | Weight rule unenforced |
| Line heights | Baked into scale classes (callers set none) | 13 distinct caller-set values, 387 uses | Premise inverted |
| Tracking | 8 values inside classes | 16 distinct, 568 caller-set uses | 2x |
| Color tokens | 55 app color tokens | 4,172 token reads (249/322 files) PLUS 117 unique raw hexes (453 uses), 79 unique rgba, 303 inline color-mix; 3 phantom tokens | Deep adoption and deep leakage at once; top leaked hex is the retired brand (#A03A22 x49) |
| Radii | 4 tokens | ~20 distinct values; 366 token-routed vs ~115 foreign | 5x the intended set |
| Shadows | 14 tokens + tactile classes | 264 tactile uses, but 160 inline boxShadow in 33 hand-built combos + 12 foreign rgba recipes + 33 cool-grey Tailwind shadows | Tokens honored, delivery fragmented |
| Spacing | No tokens; 3-step space-y policy | 9 arbitrary uses (clean); 11 space-y steps, 61% policy conformance | Structural gap, mild leak |
| Z-index | 13 tokens, raw z banned for floats | 56 token uses vs 78 raw incl. z-[1000] x4 | Partial adoption |
| Hardcoded baseline (components) | 0 | 3,393 strict (3,877 incl. token-bridging) | The Phase 4 distance |

---

## Verdict: sound core, two structural gaps, and a governance failure

**The token system is sound but leaking, with two genuine structural
insufficiencies.** The evidence for soundness: 4,172 token reads across 77
percent of components, a coherent 4-step radius ladder honored 366 times, a
13-layer z-index ladder, a tactile depth system with 264 adoptions, and an
accessibility-tuned palette with pre-computed tints. Nobody needs to design a
new system; one already exists and most code can find it.

The leaks are quantified above: 453 raw hexes led by a brand color that was
retired five weeks into the file's life, 303 inline color-mix calls that the
tint tokens were built to absorb, a 34-size type reality against an 8-size
spec with 2.4 percent adoption, and 33 hand-assembled shadow combos restating
one class.

Two gaps are structural, not behavioral:

1. **The tokens are not Tailwind utilities.** Nothing maps `--app-ink-3` to a
   `text-ink-3` class, so every single token use costs either an inline style
   object (1,717 in components) or an arbitrary-value class (484
   token-bridging). The delivery mechanism guarantees the leak: the cheapest
   way to use the system correctly is also the pattern that produces 80
   percent of files carrying inline styles. docs/DESIGN_UX_AUDIT.md
   identified this; it remains unbuilt.
2. **No spacing or type tokens exist as enforceable values.** Spacing is a
   prose policy at 61 percent conformance, and the type scale is a set of CSS
   classes with no lint rule banning `text-[Npx]`, which is why 1,259
   arbitrary sizes survived the scale's introduction by two days.

The third failure is governance, and it is the most corrosive: CLAUDE.md,
docs/STYLE.md, docs/DESIGN_UX_AUDIT.md, and production code currently assert
three different display faces and two different palettes among them. The
display font changed twice in five days, each change justified as resolving a
contradiction with documentation that had itself drifted. Until one document
is made the single source of truth and the others are corrected or archived,
every future agent or contributor has even odds of "fixing" the system in the
wrong direction, exactly as PR #542 reversed PR #431.

Recommended Phase 1 order, from these numbers: (1) settle the font and write
it in one place; (2) bridge tokens into the Tailwind theme so utilities exist;
(3) sweep the 49 retired-brand hexes and the 3 phantom tokens (these are
rendering wrong colors today); (4) then begin the type-scale migration, which
is the largest count (1,745) but the lowest per-instance risk.
