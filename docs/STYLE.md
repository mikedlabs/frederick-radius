# Design system — Frederick Radius

Current foundation: Frederick Radius Brand System 1.2, July 22, 2026. The full identity, logo, voice,
photography, social, and governance rules live in
[`docs/brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md). This file documents the
implementation-oriented type, color, layout, and component scales.

When you're touching a component, this is the source of truth. New
code picks from these tokens; old `text-[Npx]` and inline `color-mix`
calls get swept opportunistically as we revisit files.

---

## Typography

### Fonts

| Variable          | Family            | Use                                    |
|-------------------|-------------------|----------------------------------------|
| `--font-sans`     | Public Sans Variable | Product titles, body, navigation, labels, controls |
| `--font-serif`    | Public Sans Variable | Compatibility alias for older interface components |
| `--font-display`  | Libre Caslon Display | Wordmark and rare editorial or campaign moments |
| `--font-mono`     | Public Sans Variable | Times, distances, counts, tabular data |

The product uses two families. Libre Caslon Display is Regular only; never
simulate a bold or italic display cut. Public Sans uses its variable upright
and italic files and handles technical data with tabular numerals, so a third
mono family is unnecessary. Legacy `.font-serif` components intentionally
compute to Public Sans. Use `.font-brand` for the wordmark and
`.font-editorial` only for a deliberate editorial hero.

Map canvas labels use the cartographic face supplied by Mapbox. That exception
is limited to labels drawn inside the map canvas; every Radius map control,
sheet, popup, and list uses Public Sans.

### Role-based scale

Pick by **semantic role**, never by pixel. The line-height pairings
are baked in — don't set `leading-*` on these.

| Class            | Size | Line height | Use                                              |
|------------------|------|-------------|--------------------------------------------------|
| `.text-caption`  | 11   | 1.4         | short timestamps and attribution only            |
| `.text-meta`     | 12   | 1.45        | short metadata and helper text                   |
| `.text-meta-lg`  | 13   | 1.5         | prominent metadata and compact explanations      |
| `.text-body`     | 15   | 1.55        | compact card and drawer copy                     |
| `.text-body-lg`  | 16   | 1.6         | normal reading copy and page introductions       |
| `.text-lead`     | 18   | 1.55        | pull quotes and editorial introductions          |
| `.text-title-sm` | 16   | 1.25        | compact Public Sans item title                   |
| `.text-title`    | 20   | 1.15        | Public Sans section title inside a card header   |
| `.display-3`     | 22–26 (clamp) | 1.12 | page subhead, between body and `.display-2`  |
| `.display-2`     | 24–36 (clamp) | 1.1  | page hero subhead                                |
| `.display-1`     | 35–58 (clamp) | 1.02 | page hero headline                               |

Normal paragraph text on a phone should be 15 to 16 px. Eleven to 13 px is
reserved for short supporting data, never instructions or a multi-sentence
explanation. Product headings use Public Sans. Libre Caslon Display begins at
18 px and appears only where the wordmark or a deliberately editorial moment
earns it.

Plus `.eyebrow` for uppercase 11px with `0.1em` tracking (already
canonical — kept).

### Color is NOT baked into typography classes

The same `.text-body` reads as ink, ink-2, or ink-3 depending on
context. Callers set color explicitly (Tailwind `color:` or `style`).

---

## Color

### Brand palette

| Token                | Hex      | Use                                      |
|----------------------|----------|------------------------------------------|
| `--app-bg`           | #F4EEE2  | Cream ground, the normal canvas          |
| `--app-bg-elevated-solid` | #FBF8F0 | Cards, popovers, drawers            |
| `--app-bg-sunken`    | #EAE1D1  | Tracks, nested cards                     |
| `--app-ink`          | #221C15  | Headlines, important body                |
| `--app-ink-2`        | #5A5348  | Default body                             |
| `--app-ink-3`        | #6C6357  | Meta and captions with AA contrast       |
| `--app-brand`        | #B5462B  | Brick, identity and primary action       |
| `--app-brand-2`      | #315A43  | Catoctin Forest, terrain/outdoor accent   |
| `--app-amber`        | #C58A32  | Live/caution/sunlight or Beer selection/flagship fill with Ink |
| `--app-amber-text`   | #925E16  | Text-safe Ochre Amber on Cream and Beer controls |
| `--app-accent`       | #7E2C6F  | Limited arts/editorial Plum              |
| `--app-cool`         | #285D73  | Creek, civic/map/transit/data accent      |
| `--app-civic`        | #285D73  | Creek alias for official-source context  |
| `--app-sage`         | #859076  | Topo-line sage                           |

### Status colors (one changed)

| Token            | Hex      | Notes                                    |
|------------------|----------|------------------------------------------|
| `--app-positive` | #315A43  | Small positive or open state             |
| `--app-warning`  | #925E16  | Text-safe Ochre warning                  |
| `--app-danger`   | **#B4231E** | **was #A02929** — too close to brand brown; now unmistakably stop-sign red |
| `--app-info`     | #285D73  | Supporting information                   |

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
- `--app-ink-tint-{6,8,12}`

### Dropped: dark mode CSS

The 50-line `html.dark { … }` block was dead CSS — no user-facing
toggle ever shipped. Stripped. When a real toggle lands, regen the
block; the paper-first identity is what gets shipped to phones in
dark mode for now.

---

## Surface and shape

The visual model is a printed field guide. Most information sits directly on
the Cream canvas and is organized with typography, spacing, and ruled edges.
Do not solve every grouping problem with another floating card.

### Surface roles

| Role | Treatment | Use |
|---|---|---|
| Paper field | Cream canvas, no shadow | Page background and normal reading flow |
| Ruled section | Top, bottom, or side rule with spacing | Lists, answer sources, launchers, and editorial groupings |
| Card | Elevated solid paper, 10px radius, quiet edge | One bounded item that must remain intact or move as a unit |
| Panel | Solid paper, 14px radius | Dense local controls or a contained workspace |
| Sheet | Solid paper, 18px radius at its exposed corners | Mobile drawers, menus, and overlays that own a temporary layer |

Use elevation only when the surface is actually above another surface. Menus,
sheets, and temporary overlays need depth. Normal rows and page sections do
not. The existing `tactile*` names are compatibility hooks, not permission to
add gloss, lift, or glow to routine content.

### Radius policy

| Token | Value | Intended role |
|---|---:|---|
| `--app-radius-sm` | 6px | Buttons, inputs, utility controls, and small markers |
| `--app-radius-md` | 10px | Cards and grouped content |
| `--app-radius-lg` | 14px | Panels and compact drawers |
| `--app-radius-xl` | 18px | Large mobile sheets and rare feature surfaces |

The practical ranges are 6 to 8 pixels for controls, 10 to 12 pixels for
cards, and roughly 16 pixels for sheets. Use the closest named token instead of
inventing a one-off value.

A full capsule is a semantic shape. Reserve it for status, a selected toggle,
or a compact filter. Ordinary calls to action, navigation items, source rows,
content cards, and search results do not become pills. A true circle is still
correct for geometry that is inherently circular, such as a map location
button, avatar, dot, or the round portion of the Radius mark.

### Decoration and image fallbacks

- The Radius ripple, a registration rule, a real map line, or a real Frederick
  photograph can carry identity. Use one at a time when it helps hierarchy.
- Do not add routine glows, animated gradient rims, glass blur, or floating
  ambient blobs. A feature state may use one solid registration rule.
- Do not create fake visual variety with seeded gradients, randomized icon
  angles, artificial textures, or giant initials that resemble photography.
- A missing image is a data state. Label it honestly and use one stable brand
  plate until a licensed or owner-supplied photograph is available.

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
| `--z-nav`      | 40    | BottomNav and SideRail                    |
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
