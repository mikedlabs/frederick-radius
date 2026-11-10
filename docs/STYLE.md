# Design system — Frederick Radius

Current foundation: Frederick Radius Brand System 1.4, October 16, 2026. The full identity, logo, voice,
photography, social, and governance rules live in
[`docs/brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md). This file documents the
implementation-oriented type, color, layout, and component scales.

This file is an implementation summary, not the source of truth. Token
values come from `src/lib/brand.ts` and the `--app-*` tokens in
`src/app/globals.css`, and identity decisions come from
`docs/brand/BRAND_GUIDE.md`. If this file disagrees with either one, the
code and the brand guide win and this file needs a correction. New code
picks from these tokens. Migrate an old `text-[Npx]` or inline `color-mix`
call only when the task is that migration, or when the same line is already
changing for the task. Each PR carries one concern.

---

## Typography

### Fonts

| Variable          | Family            | Use                                    |
|-------------------|-------------------|----------------------------------------|
| `--font-sans`     | System sans (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`) | Product titles, body, navigation, labels, controls |
| `--font-serif`    | System sans | Compatibility alias for older interface components |
| `--font-display`  | Libre Caslon Display | Wordmark and rare editorial or campaign moments, used through `.font-brand` or `.font-editorial` |
| `--font-mono`, `--font-data` | System sans (tabular numerals come from the `.font-mono` and `.font-data` classes) | Times, distances, counts, tabular data |

Product UI uses the system sans already on the device. Public Sans is not
loaded for product text. It remains the print and export text family, and its
italic file loads on demand only for the revealed field note
(`"Public Sans Radius Italic"` in `globals.css`). Libre Caslon Display is
Regular only; never simulate a bold or italic display cut. Technical data uses
the same system sans with tabular numerals through `.font-mono` or
`.font-data`, so a separate mono family is unnecessary. Legacy `.font-serif`
components intentionally compute to system sans. Use `.font-brand` for the
wordmark and `.font-editorial` only for a deliberate editorial hero. Do not
download a new family or rename packaged Public Sans as a system font.

Map canvas labels use the cartographic face supplied by Mapbox. That exception
is limited to labels drawn inside the map canvas; every Radius map control,
sheet, popup, and list uses system sans.

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
| `.text-title-sm` | 16   | 1.25        | compact system sans item title                   |
| `.text-title`    | 20   | 1.15        | system sans section title inside a card header   |
| `.display-3`     | 22–26 (clamp) | 1.12 | page subhead, between body and `.display-2`  |
| `.display-2`     | 24–36 (clamp) | 1.1  | page hero subhead                                |
| `.display-1`     | 35–58 (clamp) | 1.02 | page hero headline                               |

Normal paragraph text on a phone should be 15 to 16 px. Eleven to 13 px is
reserved for short supporting data, never instructions or a multi-sentence
explanation. Product headings use system sans. Libre Caslon Display begins at
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

| Token | Light | Dark appearance | Use |
|---|---|---|---|
| `--app-bg` | #FFFFFF | #1C1C19 | White ground, the normal canvas |
| `--app-bg-elevated-solid` | #FFFFFF | #292925 | Cards, popovers, drawers |
| `--app-bg-sunken` | #F4F4F3 | #242420 | Soft gray inset surfaces, tracks, nested cards |
| `--app-border` | #E1E1DD | #464640 | Decorative rules and card edges |
| `--app-control-border` | #818178 | #A5A59A | Control boundaries that must meet 3:1 contrast |
| `--app-ink` | #22221F | #F7F7F4 | Charcoal. Headlines and important body |
| `--app-ink-2` | #62625C | #C1C1B8 | Default body and secondary copy |
| `--app-ink-3` | #62625C | #C1C1B8 | Meta and captions with AA contrast |
| `--app-brand` | #C34335 | same | Deep Coral, identity and primary action fill |
| `--app-brand-press` | #A8352A | same | Pressed Deep Coral |
| `--app-link` | #A8352A | #FFAAA0 | Links, selected actions and focus cues. Light coral fills need dark text |
| `--app-brand-2` | #315A43 | same | Catoctin Forest, terrain and outdoor accent |
| `--app-amber` | #C58A32 | same | Live, caution, sunlight, or Beer selection and flagship fill with Ink |
| `--app-amber-text` | #925E16 | same | Text-safe Ochre Amber on White and in Beer controls |
| `--app-accent` | #7E2C6F | same | Limited arts and editorial Plum |
| `--app-cool` | #285D73 | same | Creek, civic, map, transit and data accent |
| `--app-civic` | #285D73 | same | Creek alias for official-source context |
| `--app-sage` | #859076 | same | Topo-line sage |

#### Text-role tokens

The brand and semantic fills above stay the same in dark appearance, where
several of them are too dim to read as text. Use these when the color is text
or an icon on a theme surface. In light appearance each one equals its fill.

| Token | Light | Dark appearance |
|---|---|---|
| `--app-brand-text` | `--app-brand` | `--app-link` (#FFAAA0) |
| `--app-cool-text` | `--app-cool` | `--app-cool` mixed 45% into `--app-ink` |
| `--app-accent-text` | `--app-accent` | `--app-accent` mixed 45% into `--app-ink` |
| `--app-forest-text` | `--app-brand-2` | `--app-brand-2` mixed 45% into `--app-ink` |

`--app-paper-light`, the top highlight on raised light surfaces, is `none` in
dark appearance.

### Status colors (one changed)

| Token            | Hex      | Notes                                    |
|------------------|----------|------------------------------------------|
| `--app-positive` | #315A43  | Small positive or open state             |
| `--app-warning`  | #925E16  | Text-safe Ochre warning                  |
| `--app-danger`   | **#B4231E** | **was #A02929** — too close to brand brown; now unmistakably stop-sign red |
| `--app-info`     | #285D73  | Supporting information                   |

### Tint utilities

`--app-<color>-tint-<percent>` pre-mixes the color with transparent
so a tinted background doesn't need an inline `color-mix(in srgb, …)`
call. Several hundred of those remain across the codebase; new code uses
these.

Available:

- `--app-brand-tint-{6,14,22}`
- `--app-cool-tint-{6,14,22}`
- `--app-positive-tint-{6,14}`
- `--app-warning-tint-{6,14}`
- `--app-danger-tint-{6,14}`
- `--app-ink-tint-{6,8,12}`

### Dark appearance

Dark appearance is an explicit saved choice, not a response to the device
setting. The app opens light by default. The header `AppearanceControl`
(`src/components/nav/AppearanceControl.tsx`) calls `applyAppearance` in
`src/lib/appearance.ts`, which sets `data-appearance` on `<html>` and saves
the choice in `localStorage` under `fr:appearance:v1`. The
`:root[data-appearance="dark"]` block in `globals.css` overrides the surface,
ink, border, link and state tokens, and the Tailwind `dark:` variant is bound
to the same attribute. `globals.css` has no `html.dark` class and no
`prefers-color-scheme` rule. Use `--app-*` tokens so a component follows both
appearances, and review new UI in both.

---

## Surface and shape

The visual model is a printed field guide. Most information sits directly on
the page canvas (`--app-bg`, White in light appearance) and is organized with
typography, spacing, and ruled edges.
Do not solve every grouping problem with another floating card.

### Surface roles

| Role | Treatment | Use |
|---|---|---|
| Page ground | Page canvas (`--app-bg`), no shadow | Page background and normal reading flow |
| Ruled section | Top, bottom, or side rule with spacing | Lists, answer sources, launchers, and editorial groupings |
| Card | `--app-bg-elevated-solid`, `--app-radius-md` or `--app-radius-lg`, quiet edge | One bounded item that must remain intact or move as a unit |
| Panel | `--app-bg-elevated-solid`, `--app-radius-lg` | Dense local controls or a contained workspace |
| Sheet | `--app-bg-elevated-solid`, `--app-radius-lg` (the shared `BottomSheet`) or a literal 24px (the shared `BottomDrawer`, the same value as `--app-radius-xl`) at its exposed corners | Mobile drawers, menus, and overlays that own a temporary layer |

The pixel values for each token are listed once, in the Radius policy table
below.

Use elevation only when the surface is actually above another surface. Menus,
sheets, and temporary overlays need depth. Normal rows and page sections do
not. The existing `tactile*` names are compatibility hooks, not permission to
add gloss, lift, or glow to routine content.

### Radius policy

| Token | Value | Intended role |
|---|---:|---|
| `--app-radius-sm` | 8px | Small utility controls, icon tiles, and small markers |
| `--app-radius-md` | 12px | Buttons (the shared `Button` primitive), most inputs, cards, and grouped content |
| `--app-radius-lg` | 18px | Panels, larger cards, and compact drawers (the shared `BottomSheet`) |
| `--app-radius-xl` | 24px | Large mobile sheets and rare feature surfaces |

Use the named token instead of a pixel value, so a token change reaches every
surface. The values live in `:root` in `src/app/globals.css`. If this table
disagrees with that file, the file is correct.

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

Routes under `src/app/(app)` already render inside `AppMain`
(`src/components/nav/AppMain.tsx`), which supplies the centered reading column
(`max-w-screen-md`, widening to `max-w-screen-lg` at `lg`). `/map` (the
`full-bleed` mode) and the Fair day routes (the `dedicated-fair` mode) do not
get that column. A new route does not need another width wrapper.

`src/components/layout/Page.tsx` also exports three optional wrappers. Today
only `/archive` and `/deals` use one (`PageWide`).

| Primitive       | Max width             | Use                                  |
|-----------------|-----------------------|--------------------------------------|
| `<PageColumn>`  | 768                   | A reading column outside the app shell |
| `<PageWide>`    | 768, then 1024 at `lg`, then 1280 at `xl` | Dashboards, dense lists, calendars |
| `<PageFull>`    | No max                | Full-bleed map, photo book           |

All three default to `space-y-6`. Pass the `spacing` prop only when the page
is a tight stack.

### Spacing policy

Pick from **three** vertical-rhythm classes. Drop the rest.

| Class       | Use                                       |
|-------------|-------------------------------------------|
| `space-y-2` | Within a card / section internals         |
| `space-y-3` | Between rows in a list                    |
| `space-y-6` | Between page sections (the spine)         |

Avoid `space-y-4` and `space-y-5` — ambiguous middlings.

### Z-index scale

Floating UI picks a named layer token. The full ladder, its ordering
decisions and the CI guard are documented once in
[`docs/Z_INDEX.md`](Z_INDEX.md), and the values live in `:root` in
`src/app/globals.css`. This file does not repeat the table. Local stacking
inside a component, such as a badge over its own photo, stays a plain `z-0`,
`z-10`, `z-20` or `z-30`.

---

## What's still on the table

- **Typography sweep.** About 3,480 `text-[Npx]` uses remain in `src`
  (counted 2026-11-10), and the role classes have few consumers. This is a
  dedicated migration with its own PRs, not something to fold into unrelated
  work.
- **Color-mix sweep.** About 550 `color-mix(` calls remain in `.ts` and `.tsx`
  files (counted 2026-11-10). The same approach applies.
- **globals.css split.** The file is about 9,300 lines. A split into
  `tokens.css`, `base.css`, `components.css` and `vendor.css` is still open
  and needs its own PR.
