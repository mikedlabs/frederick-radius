# Shell-Hardening Pass — July 2026

Owner brief (2026-07-11): the identity is strong and must be preserved; this
is a **consistency + shell-hardening** pass, not a redesign. Principle:
**keep the character, remove the friction.** Every claim below was grounded
against live code by a 7-agent audit (verify-before-asserting). Status is what
the CODE actually does, not the brief's assumption.

## Preserve (do not "simplify")
Today weather briefing + Ask Radius · Browse drawer · Place Field Notes ·
Event photography · Saved's "Blank for now" empty state · two-step onboarding ·
the locally-written voice · warm-paper base · wallet/guilloché on collectibles.

## Definition of done
No fixed-element overlap at 390/768/1024/1440 · map fills the viewport ·
dialogs/sheets pass keyboard-only · text + control boundaries meet contrast ·
important mobile targets ≥44px · transitions never blank/double-fade · every
page has one primary job + one predictable way back.

## Grounded findings → ship order

Already-fixed (audit corrected the brief — no work):
- Z-index token ladder exists and is used consistently (globals.css:158-170).
- Button-primitive contrast already uses brand-press (Pill/Segmented/FilterChip).
- The shared `Sheet` primitive already traps focus + aria-modal.
- "Beta false-zero" is the documented CountUp animation on /beta pulse stats
  (server-rendered value), not a loading flash. No signup counter flashes.

### PR1 — Map viewport reclaims desktop space (P2) · DEFERRED (harder than S)
Three unbranched mobile-nav reserves eat the desktop map:
`--app-bottomnav-reserve:84px` + a bare `-48px` in `--app-browse-map-height`
(globals.css:192-196), and `<main>` `paddingBottom: calc(6rem + safe-area)`
(AppMain.tsx:32-34) — all clearance for the floating bottom nav that is
`lg:hidden` (SideRail replaces it on desktop).

ATTEMPTED 2026-07-11, reverted. The token override
(`@media(min-width:1024px){ --app-bottomnav-reserve:0; --app-map-extra-reserve:5px }`
+ full-bleed AppMain padding-bottom 0) made the LOADED desktop canvas fill
exactly (measured: canvas top 61, band/overflow 5px→0). BUT the map's loading
SKELETON container sits ~56px LOWER than the loaded canvas (skeleton
`.relative.px-0` top 117 vs loaded `.mapboxgl-canvas` top 61), so raising the
height to fill the loaded state pushed the skeleton to overflow ~56px → a
scroll-then-snap on every cold map load. A single 100dvh calc can't satisfy
both positions. REAL FIX: align the skeleton to the loaded-map position (find
the ~56px of in-flow chrome above the skeleton in BrowseMapArea / the Suspense
fallback at map/page.tsx:370-378), OR refactor the map area to fill remaining
height via flexbox instead of a fixed calc. Needs the preview Mapbox to load
reliably to verify. Not a blind token tweak.

### PR2 — Contrast (P4) · S–M · low
- Nav active label/icon: `--app-brand` (#E14328 ~3.3:1 on cream, fails AA) →
  `--app-brand-press` (#B5300F ~5:1). BottomNav.tsx:148, SideRail.tsx:133.
- MobileActionBar primary cell: brand → brand-press (MobileActionBar.tsx:78).
- Small brand TEXT (events/[slug]:715 10px badge) → brand-press. Leave
  aria-hidden decorative icons on --app-brand.
- New `--app-control-border` (≥3:1 on paper) for form inputs (SearchInput etc);
  keep --app-border for decorative card edges.

### PR3 — Single navigation transition (P5) · S · low
Both View Transitions (next.config viewTransition + globals.css:1197-1217) AND
a `.route-fade` template (template.tsx:17 + globals.css:1219-1228) fire per nav
= two stacked opacity ramps. Keep View Transitions (composited, reduced-motion
gated, carries the place-photo shared-element morph); delete the route-fade
template + CSS.

### PR4 — A11y quick wins (P3 findings 1,2,5) · S · low
- Skip link `#main` sits on the outer shell div ABOVE the TopBar
  (layout.tsx:269); move id+tabIndex onto the real `<main>` (AppMain.tsx:26).
- Collapsed dock panes keep a focusable `Done` button (max-height:0, not inert)
  — add `inert` when `pane===null` on `.eb-pane` (EventsBoardDock.tsx:518) and
  `.dock-pane` (MapDock.tsx:500).
- <44px targets: `.eb-lensseg button` (34px wide, globals.css:3769-3781) +
  dropdown menu rows → ≥44px.

### PR5 — PWA prompts (P1 findings 2,3 partial) · S · low
- Update toast has only "Refresh", duration Infinity, no dismiss and re-fires
  on focus — add a Later/closeButton (ServiceWorkerRegister.tsx:54-63).
- InstallPrompt uses bare `bottom-20` with NO safe-area inset
  (InstallPrompt.tsx:29) — add env(safe-area-inset-bottom).

### PR6 — Hierarchy polish (P6) · S bundle
Settings duplicate Back (drop page-level, keep TopBar) · weather↔Ask spacing
(mt on TodayAsk) · WelcomeFlow "No accounts, no tracking" → device-local truth ·
desktop Events hero cap (EventCard.tsx:274 lg aspect/max-h) · mobile eb-dock
resting-height trim · reading-column centering (AppMain lg:pl-24 shifts the
mx-auto box ~48px right — separate centering from rail clearance; med-risk,
verify SideRail).

### PR7 — Modal focus traps (P3 finding 3) · M · med
PlaceSheet + PhotoLightbox set aria-modal but have no Tab-cycle trap or inert
background. Factor `useFocusTrap` out of Sheet.tsx:112-133; PhotoLightbox also
needs focus-in on open.

### PR8 — Map category glyphs (P6 finding 8) · M · low
sports + community (+ golf/ice-cream/worship) fall to the generic pin —
add BUCKET entries + drawIcon cases in categoryMarkers.ts:32-69.

### PR9+ — CSS architecture (big Ls, own PRs)
- Extract route CSS from the 4257-line globals.css into co-located modules:
  `.dock-*`+`.map-*` (~828 lines), `.eb-*` (~382), `.sw-*`/`.sv-*` (~517),
  `.pulse-*` (~265), `.bt-*` — leave tokens + shared primitives.
- Semantic type scale in @theme; codemod the ~1,891 `text-[Npx]` (priority: the
  ~292 sub-11px labels) to tokens, preserving exact px.
- One continuous animation per surface (park secondary keyframes at final frame;
  /pulse + /today run 4-6 at once today, all reduced-motion gated).

### Menu keyboard (P3 finding 4) — decide
role=menu on LocationChip/SortDropdown without arrow-key roving tabindex.
Either implement the APG menu pattern or downgrade the role to an honest
button-group. Owner/scope call.
