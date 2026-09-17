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
| `--z-map-drawer` | 25 | map in-view drawer (above map status → never covered) |
| `--z-sticky` | 30 | TopBar, sticky section headers, map top filter chips |
| `--z-nav` | 40 | BottomNav, SideRail |
| `--z-fab` | 42 | floating action button / compose dock |
| `--z-dropdown` | 45 | menus / popovers anchored to a trigger |
| `--z-prompt` | 48 | install prompt, pull-to-refresh (above chrome, **below** overlays) |
| `--z-overlay` | 50 | modal/drawer backdrops + sheets + search — **owns the screen** |
| `--z-toast` | 70 | sonner toaster |
| `--z-lightbox` | 80 | media lightbox (above toast) |
| `--z-skip` | 100 | skip-to-content link (reachable above everything) |

### Key ordering decisions
- **Sheets/search/modals own the screen.** `--z-overlay` (50) sits above
  `--z-prompt` (48): if a user opens search, a place sheet, a bottom drawer,
  or a modal, install prompts and pull-to-refresh do **not** float over it.
- **The map drawer beats the map's own status chips.** `--z-map-drawer` (25)
  is above `--z-map-control` (20) so a geo pill / directions chip / demo card
  never covers the in-view results drawer (the fix for the §7 "road & alerts
  overlay covers UI" collision). The map's *top* filter chips ride
  `--z-sticky` (30) and stay above the drawer (they're top-anchored).
- **Prompts are peers of the chrome, not of modals.** Install prompt + PTR at
  48 sit above nav/FAB/dropdowns but below any real overlay.

## What is NOT on this scale (leave it alone)
Local stacking *inside* a component — a badge over its own photo, a number
bubble, a sticky list header within its own scroll container — stays a plain
low `z-0` / `z-10` / `z-20`. Those don't compete for the top of the screen, so
they're intentionally excluded. Don't migrate them.

The **marketing / vision surface** (`src/components/marketing/**`)
has its own cinematic stacking and is out of scope.

## Guard
`npm run lint:zindex` (`scripts/check-zindex.mjs`) flags new arbitrary
`z-[NNN]` and bare `z-40`+ on app-shell UI so the mess can't creep back. Add a
new floating element? Give it a token from the table above — the guard expects
`z-[var(--z-…)]`.
