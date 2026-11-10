# Z-index layer scale

One named owner per layer, so floating UI never fights for the top of the
screen by accident. Defined once in `src/app/globals.css` (`:root`), consumed
everywhere as `z-[var(--z-…)]` (Tailwind arbitrary value) or
`style={{ zIndex: "var(--z-…)" }}`.

**The rule:** any `fixed`/`absolute` element that floats over the page MUST
pick a token from this ladder. Never invent a raw `z-[NNN]` or a bare
`z-40`/`z-50` on overlay-style UI.

## The ladder (low → high)

| Token | Value | Owner |
|---|---|---|
| `--z-base` | 0 | default page flow |
| `--z-raised` | 10 | in-flow raised: sticky cards, local overlays |
| `--z-map-control` | 20 | map in-canvas status / alert / error / directions / empty-state |
| `--z-map-drawer` | 25 | reserved. Nothing consumes it today |
| `--z-sticky` | 30 | TopBar, sticky section headers, map top filter chips |
| `--z-nav` | 40 | BottomNav, SideRail |
| `--z-fab` | 42 | floating action button / compose dock |
| `--z-dropdown` | 45 | menus / popovers anchored to a trigger |
| `--z-prompt` | 48 | install prompt, pull-to-refresh (above chrome, **below** overlays) |
| `--z-overlay` | 50 | modal/drawer backdrops + sheets + search — **owns the screen** |
| `--z-toast` | 70 | toasts. `AppToaster` (`src/components/ui/AppToaster.tsx`) sets it on the Sonner toaster, so toasts sit above sheets and below the lightbox |
| `--z-lightbox` | 80 | media lightbox |
| `--z-skip` | 100 | skip-to-content link (above every tokenized layer) |

### Key ordering decisions
- **Sheets/search/modals own the screen.** `--z-overlay` (50) sits above
  `--z-prompt` (48): if a user opens search, a place sheet, a bottom drawer,
  or a modal, install prompts and pull-to-refresh do **not** float over it.
- **Map surfaces stack around `--z-sticky`.** In-canvas status, alert and
  reset controls use `--z-map-control` (20). The map list view
  (`.map-list`) sits one step below the top filter chips at
  `calc(var(--z-sticky) - 1)`. The pin peek card (`.map-peek`) shares
  `--z-sticky` (30) with the chips, and the map control panel (`.dock-pane`)
  sits at `calc(var(--z-sticky) + 2)`. The shipped map code orders surfaces
  inside one layer with a small `calc()` offset from a named token, and the
  guard does not flag that form.
- **Prompts are peers of the chrome, not of modals.** Install prompt + PTR at
  48 sit above nav/FAB/dropdowns but below any real overlay.

## What is NOT on this scale (leave it alone)
Local stacking *inside* a component — a badge over its own photo, a number
bubble, a sticky list header within its own scroll container — stays a plain
low `z-0` / `z-10` / `z-20` / `z-30`. Those don't compete for the top of the screen, so
they're intentionally excluded. Don't migrate them.

The **marketing / vision surface** (`src/components/marketing/**`)
has its own cinematic stacking and is out of scope.

## Guard
`npm run lint:zindex` (`scripts/check-zindex.mjs`) runs in the required
`style-lint` CI job. It scans `.ts` and `.tsx` files under `src`, except
`src/components/marketing/`. Its exclusion list also names
`src/components/map/index.tsx` and `src/components/map/map-component.tsx`,
but neither file exists, so those entries skip nothing. It fails on an arbitrary numeric `z-[NNN]`, on a
bare `z-40`, `z-50`, `z-60`, `z-70`, `z-80`, `z-90` or `z-100`, and on an
inline numeric `zIndex` of 40 or more. It does not flag `z-0`, `z-10`, `z-20`
or `z-30`, and it accepts both token forms, `z-[var(--z-…)]` and
`zIndex: "var(--z-…)"`. It does not scan CSS files, so a raw `z-index` in
`src/app/globals.css` or a CSS module is not caught. Check those by hand and
use `var(--z-…)` there too.
