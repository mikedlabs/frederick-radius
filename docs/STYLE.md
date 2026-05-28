# Design system — Frederick Radius

Last touched: May 2026 design-token audit. Three PRs landed at once:
**typography scale + fonts**, **color tokens**, **layout primitives**.

When you're touching a component, this is the source of truth. New
code picks from these tokens; old `text-[Npx]` and inline `color-mix`
calls get swept opportunistically as we revisit files.

---

## Typography

### Fonts (3, was 4)

| Variable          | Family            | Use                                    |
|-------------------|-------------------|----------------------------------------|
| `--font-sans`     | Public Sans       | Default body, every non-display string |
| `--font-serif`    | Newsreader        | Display + body italic / pull-quote     |
| `--font-mono`     | JetBrains Mono    | Metadata, tabular numerics, code       |

**Dropped: Instrument Serif.** Used in exactly one tagline on `/about`;
Newsreader's italic carries the editorial voice with one fewer font
fetch (saves ~50KB + a round-trip).

### Scale (8 canonical sizes)

Pick by **semantic role**, never by pixel. The line-height pairings
are baked in — don't set `leading-*` on these.

| Class            | Size | Line height | Use                                              |
|------------------|------|-------------|--------------------------------------------------|
| `.text-caption`  | 10   | 1.35        | timestamps, attribution tails                    |
| `.text-meta`     | 11   | 1.4         | non-uppercase helper text                        |
| `.text-body`     | 13   | 1.55        | default body in cards / drawer rows              |
| `.text-body-lg`  | 14   | 1.6         | page intro paragraphs, dense reading             |
| `.text-lead`     | 16   | 1.6         | pull-quotes, /about pitch body                   |
| `.text-title-sm` | 15   | 1.25        | small card title (`PlaceCard` tile variant)      |
| `.text-title`    | 18   | 1.2         | section title inside a card header (serif)       |
| `.display-3`     | 20–24 (clamp) | 1.15 | page subhead, sits between body and `.display-2` |
| `.display-2`     | 24–36 (clamp) | 1.1  | page hero subhead                                |
| `.display-1`     | 32–56 (clamp) | 1.04 | page hero headline                               |

Plus `.eyebrow` for uppercase 11px with `0.14em` tracking (already
canonical — kept).

### Color is NOT baked into typography classes

The same `.text-body` reads as ink, ink-2, or ink-3 depending on
context. Callers set color explicitly (Tailwind `color:` or `style`).

---

## Color

### Brand palette (paper-cream, unchanged)

| Token                | Hex      | Use                                      |
|----------------------|----------|------------------------------------------|
| `--app-bg`           | #F4EFE6  | Paper-cream ground, the canvas           |
| `--app-bg-elevated`  | #FBF8F1 (92% α) | Cards, popovers, drawers          |
| `--app-bg-sunken`    | #ECE5D5  | Tracks, nested cards                     |
| `--app-ink`          | #1A1815  | Headlines, important body                |
| `--app-ink-2`        | #4A4844  | Default body                             |
| `--app-ink-3`        | #6A6862  | Meta, captions (WCAG AA on bg/sunken)    |
| `--app-brand`        | #A8462C  | Frederick brick — the primary           |
| `--app-brand-2`      | #2E3B2C  | Catoctin green                           |
| `--app-accent`       | #C99632  | Almanac gold                             |
| `--app-cool`         | #2F5470  | Carroll Creek slate                      |
| `--app-sage`         | #859076  | Topo-line sage                           |

### Status colors (one changed)

| Token            | Hex      | Notes                                    |
|------------------|----------|------------------------------------------|
| `--app-positive` | #1E6B3A  |                                          |
| `--app-warning`  | #B26B00  |                                          |
| `--app-danger`   | **#B4231E** | **was #A02929** — too close to brand brown; now unmistakably stop-sign red |
| `--app-info`     | #2F5470  | Same as `--app-cool`                     |

### Tint utilities (NEW — replaces inline color-mix)

`--app-<color>-tint-<percent>` pre-mixes the color with transparent
so a tinted background doesn't need an inline `color-mix(in srgb, …)`
call. 200+ instances of those across the codebase; new code uses
these and old usage gets swept on touch.

Available:

- `--app-brand-tint-{6,14,22}`
- `--app-cool-tint-{6,14,22}`
- `--app-positive-tint-{6,14}`
- `--app-warning-tint-{6,14}`
- `--app-danger-tint-{6,14}`
- `--app-ink-tint-{6,12}`

### Dropped: dark mode CSS

The 50-line `html.dark { … }` block was dead CSS — no user-facing
toggle ever shipped. Stripped. When a real toggle lands, regen the
block; the paper-first identity is what gets shipped to phones in
dark mode for now.

---

## Layout

### Page primitives

`src/components/layout/Page.tsx` exposes three:

| Primitive       | Max width             | Use                                  |
|-----------------|-----------------------|--------------------------------------|
| `<PageColumn>`  | `max-w-screen-md` 768 | Default reading column (most routes) |
| `<PageWide>`    | `max-w-screen-lg` 1024| Dashboards, dense lists, calendars   |
| `<PageFull>`    | No max                | Full-bleed map, photo book           |

All three render with `space-y-6` (the canonical spine gap). Override
with `spacing` prop only when the page IS a tight stack.

### Spacing policy

Pick from **three** vertical-rhythm classes. Drop the rest.

| Class       | Use                                       |
|-------------|-------------------------------------------|
| `space-y-2` | Within a card / section internals         |
| `space-y-3` | Between rows in a list                    |
| `space-y-6` | Between page sections (the spine)         |

Avoid `space-y-4` and `space-y-5` — ambiguous middlings.

### Z-index scale (NEW)

Stop hardcoding `z-30 / z-40 / z-50`. Pick from the named scale:

| Token          | Value | Use                                       |
|----------------|-------|-------------------------------------------|
| `--z-base`     | 0     | Default flow                              |
| `--z-raised`   | 10    | Sticky cards, popovers, in-page overlays  |
| `--z-sticky`   | 30    | TopBar, sticky section headers            |
| `--z-nav`      | 40    | BottomNav floating pill                   |
| `--z-overlay`  | 50    | Modal backdrops, drawer backdrops, sheets |
| `--z-toast`    | 70    | Sonner toaster — always on top            |

Use as `style={{ zIndex: "var(--z-sticky)" }}`. Tailwind arbitrary
values would also work (`z-[var(--z-sticky)]`) but the inline style
is clearer.

---

## What's still on the table

- **Mass typography sweep** — 600+ `text-[Npx]` instances → new scale
  classes. Doing in batches as we touch files; not a single megacommit.
- **Color-mix sweep** — ~200 inline calls → tint utilities. Same
  approach.
- **globals.css split** — at 1500+ lines. Split into `tokens.css` /
  `base.css` / `components.css` / `vendor.css` when the file grows
  again.
