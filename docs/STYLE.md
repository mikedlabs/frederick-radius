# Design system for Frederick Radius

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
are baked in, so don't set `leading-*` on these.

| Class            | Size | Line height | Use                                              |
|------------------|------|-------------|--------------------------------------------------|
| `.text-caption`  | 11   | 1.4         | short timestamps and attribution only            |
| `.text-meta`     | 12   | 1.45        | short metadata and helper text                   |
| `.text-meta-lg`  | 13   | 1.5         | prominent metadata and compact explanations      |
| `.text-body`     | 15   | 1.55        | compact card and drawer copy                     |
| `.text-body-lg`  | 16   | 1.6         | normal reading copy and page introductions       |
| `.text-lead`     | 18   | 1.55        | pull quotes and editorial introductions          |
| `.text-title-sm` | 16   | 1.25        | compact system sans item title                   |
| `.text-title`    | 20   | 1.15        | system sans section title                        |
| `.display-3`     | 22–26 (clamp) | 1.12 | page subhead, between body and `.display-2`  |
| `.display-2`     | 24–36 (clamp) | 1.1  | page hero subhead                                |
| `.display-1`     | 35–58 (clamp) | 1.02 | page hero headline                               |

Normal paragraph text on a phone should be 15 to 16 px. Eleven to 13 px is
reserved for short supporting data, never instructions or a multi-sentence
explanation. Product headings use system sans. Libre Caslon Display begins at
18 px and appears only where the wordmark or a deliberately editorial moment
earns it.

Plus `.eyebrow` for uppercase 11px with `0.1em` tracking.

### List and section roles (November 10, 2026)

The interface update approved on November 10, 2026 fixes three list roles.
A row title is 17px at weight 600 in `--app-ink`. A row meta line is 14px in
`--app-ink-2` or `--app-ink-3`. A section label is 13px uppercase at weight
600 with `0.1em` tracking in `--app-ink-3`, as `PlaceSectionLabel` draws it.
Page titles are heavy system sans (weight 700 to 800). Type carries the
hierarchy, so a heading does not need a tick, box, or tinted band.

### Color is NOT baked into typography classes

The same `.text-body` reads as ink, ink-2, or ink-3 depending on
context. Callers set color explicitly (Tailwind `color:` or `style`).

---

## Color

### Brand palette

| Token | Light | Dark appearance | Use |
|---|---|---|---|
| `--app-bg` | #FFFFFF | #1C1C19 | White ground, the normal canvas |
| `--app-bg-elevated-solid` | #FFFFFF | #292925 | Sheets, popovers, drawers |
| `--app-bg-sunken` | #F4F4F3 | #242420 | Soft gray inset surfaces, tracks, hover and pressed grounds |
| `--app-border` | #E1E1DD | #464640 | Hairline rules between rows and sections |
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
| `--app-danger`   | **#B4231E** | **was #A02929**, too close to brand brown; now unmistakably stop-sign red |
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

The interface update approved on November 10, 2026 ("Plain tool, with the
coral plate") sets the shape rules below. The canonical statement is the
Interface shape section of [`docs/brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md).

Content is rows on the page canvas (`--app-bg`, White in light appearance),
separated by a 1px hairline (`--app-border`) or by space. Typography and
spacing carry the hierarchy. Do not solve a grouping problem with a card. A
rounded, bordered card around ordinary content is a regression.

### Surface roles

| Role | Treatment | Use |
|---|---|---|
| Page ground | Page canvas (`--app-bg`), no shadow | Page background and normal reading flow |
| Row | No box. A 1px `--app-border` hairline below, or space | Every list item: places, events, results, tools, settings, sources |
| Ruled section | A hairline and a 13px section label, or a `SectionHeading` | A group of rows, an answer's sources, a detail page section |
| Field | `--app-bg`, a 1px `--app-control-border` edge, `--app-radius-md` | Text inputs, selects, and the `SortDropdown` trigger |
| Floating layer over the map | `--app-bg-elevated-solid`, a hairline edge, `--app-radius-lg` (or `--app-radius-md` for a compact control), and `--app-shadow-3` only where it must separate from the map imagery | Map controls, map status, and map panels that sit on the canvas |
| Menu | `--app-bg-elevated-solid`, a hairline edge, `--app-radius-md`, `--app-shadow-3` | A popover anchored to its trigger |
| Sheet | `--app-bg-elevated-solid`, `--app-radius-lg` at the exposed top corners | `BottomSheet` and `BottomDrawer`, which own a temporary layer |

A bordered surface is right only when it is a control boundary (a field) or a
real layer above the page (a menu, a sheet, or a panel over the map). It is
never right for an ordinary list item, a section, or an informational tag.

The pixel values for each token are listed once, in the Radius policy table
below.

### Shadow and elevation

A shadow means a layer is actually above another surface. Ordinary rows and
page sections stay flat. The tokens enforce this:

| Token | Value | Use |
|---|---|---|
| `--app-shadow-1`, `--app-shadow-2` | Transparent (`0 0 0 0 transparent`) | Compatibility only. Content does not float |
| `--app-elev-1`, `--app-elev-2` | Transparent | Compatibility only |
| `--app-shadow-3` | A soft two-part shadow | Menus, popovers, and `BottomSheet` |
| `--app-elev-3`, `--app-elev-4` | Deeper layer shadows | `BottomDrawer` and other overlays that own the screen |

The transparent tiers resolve to an invisible value rather than `none`, so
they stay valid inside a comma list. Do not raise them, and do not add a new
shadow to make a row, card, or button lift. The existing `tactile*` names are
compatibility hooks, not permission to add gloss, lift, or glow.

### Radius policy

| Token | Value | Intended role |
|---|---:|---|
| `--app-radius-sm` | 4px | Small markers, focus outlines inside rows, and the coral time block on Events |
| `--app-radius-md` | 6px | Fields, buttons (the shared `Button` primitive), menus, and row thumbnails |
| `--app-radius-lg` | 8px | Sheets and drawers (`BottomSheet`, `BottomDrawer`) and floating panels over the map |
| `--app-radius-xl` | 10px | A rare larger feature surface |

Use the named token instead of a pixel value, so a token change reaches every
surface. The values live in `:root` in `src/app/globals.css`. If this table
disagrees with that file, the file is correct.

A full capsule is a semantic shape. It survives only on compact filter chips
(`Pill`, `FilterChip`), status badges, and toggle switches. Ordinary calls to
action, navigation items, rows, source lines, search results, and
informational tags do not become capsules. An informational tag, such as what
a place is known for, is plain text (see `PlaceDotList`). A true circle is
still correct for geometry that is inherently circular, such as a map
location button, avatar, dot, or the round portion of the Radius mark.

### Chrome

The top bar uses unboxed ink icons with no tile, ring, or fill behind them.
The bottom tab bar and `MobileActionBar` are flat bars attached to the screen
edge: the page ground with one top hairline, no floating offset, radius, or
shadow. The active tab carries a 2px Deep Coral rule.

### The one bold block

A page may hold one solid Deep Coral block. On Today it is the coral name
plate over the lead photograph. On Events it is the lead event's time block
(`EventRow` with `lead`). No other coral field appears on the page except the
single filled coral action the view already has, such as Directions in a
place page's `MobileActionBar`. A selected filter chip is an ink fill, not
coral. White text on a coral fill sits on `--app-brand-press` with
`--app-on-brand`.

### Text colors on a theme ground

Coral text uses `--app-link` or `--app-brand-text`. Creek text uses
`--app-cool-text`, and Catoctin Forest text uses `--app-forest-text`. Never
set `--app-brand-press`, `--app-brand`, or `--app-cool` as a text color; they
fail contrast in dark appearance.

### Decoration and image fallbacks

- The Radius ripple, a registration rule, a real map line, or a real Frederick
  photograph can carry identity. Use one at a time when it helps hierarchy.
- Do not add routine glows, animated gradient rims, glass blur, or floating
  ambient blobs. A feature state may use one solid registration rule.
- Do not create fake visual variety with seeded gradients, randomized icon
  angles, artificial textures, or giant initials that resemble photography.
- A missing image is a data state. In a row, show a thumbnail only when a
  real photograph exists. A row without one keeps the same media slot width,
  so titles stay aligned down the list, and shows its category glyph in
  `--app-ink-3` at about 24px, level with the title's first line. The glyph
  has no background, border, tint, or radius. Do not use a gray tile or a
  coral-tinted tile in any list.

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
| `space-y-2` | Within a section's internals              |
| `space-y-3` | Between loose blocks that are not rows    |
| `space-y-6` | Between page sections (the spine)         |

A list of rows takes no gap at all. Rule it instead: a `border-t` on the list
and a `border-b` hairline on each row (`RowList` does this), so the rows read
as one ruled block.

Avoid `space-y-4` and `space-y-5`, which are ambiguous middle values.

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
