# UI Primitives & the Cohesion Rollout

> The app already had a good design system — it just wasn't adopted. The
> canonical `FilterChip` existed but was used in 3 files while the same
> toggle-pill was hand-rolled ~40 times with five slightly different
> stylings. This is the standard + the checklist to finish adopting it
> everywhere ("adopt once → everywhere", from the UX audit).

## The canonical interactive primitives

### `Pill` — standalone toggle / intent chip
`src/components/ui/Pill.tsx`. One primitive for every "tap to narrow /
pivot" control.

```tsx
<Pill tone="brand" active={on} onClick={toggle} icon={Zap} count={3}>Music</Pill>
<Pill tone="ink" size="sm" href="/today?t=tonight" active={mode==="tonight"}>Tonight</Pill>
```
- **tones:** `brand` (selected facet) · `cool` (town/place lane) · `ink`
  (the "when?" lane) · `prominent` (brand→cool gradient + lift, hero
  intent chips).
- **`href`** renders a Next `<Link>` with an automatic pending spinner
  (so a slow route swap never feels "stuck"); otherwise a `<button>`
  with `onClick` + haptics.
- **`bare`** — for chip rows inside a shared elevated/glass container
  (transparent inactive, no per-chip elevation), e.g. the map time strip.
- **`icon`**, **`count`** (tone-aware badge), **`size`** (`sm`/`md`).

### `Segmented` — joined-segment tablist
`src/components/ui/Segmented.tsx`. One primitive for "pick one of N
modes" (the events view toggle, map Radius/Browse).

```tsx
<Segmented value={view} onChange={setView} labelsOn="sm" items={[
  { key: "list", label: "List", icon: ListIcon },
  { key: "map",  label: "Map",  icon: MapIcon, href: "/map" },
]} />
```
- `value`+`onChange` (button segments) **or** per-item `href` (link
  segments, with pending spinner).
- `labelsOn="sm"` hides labels below the small breakpoint (icon-only on
  tight rows).

### Other canonical pieces (already existed — keep using)
`Surface`/`Card`, `Chip` (tonal display pill, non-interactive),
`SectionHeading`, `EmptyState`, the `.text-*`/`.display-*` type scale,
`.deck-card`. The weight rule: 400 quiet · 500 labels · 600 titles ·
700 numerics only.

## Rollout status

**Done (verified: tsc + lint clean):**
- `Pill` + `Segmented` created.
- `event/EventsExplorer` — QUICK chips, 4-view toggle, type/town facets.
- `today/TimeToggle` — the "when?" control.
- `map/MapModeToggle` — Radius/Browse.
- `map/MapTimeChips` — time strip (bare); Open-now toggle left bespoke.
- `municipality/TownStrip` — sibling-town nav.

**Remaining hand-rolled pill/toggle sites (convert opportunistically as
each surface is touched; skip where a bespoke style is load-bearing):**
- Events cluster: `LensBar`, `EventsByTown`, `MunicipalEvents`,
  `WeekStrip`/`MonthGrid` (calendar grids — likely keep bespoke).
- Today cluster: `TodayActions`, `TodayTabs`, `MoodTiles`,
  `HomeMuniChip`, `HourlyDisclosure`, `PartnerAppsRow`, `FromAboveCta`,
  `CivicAlerts`, `BetaIntroCard`, `TodayFilters`.
- Now/Pulse: `now/RightNowStrip`, `pulse/CollapsibleDashSection`.
- Place: `place/PlaceSheet`, `FollowButton`, `MyRadiusButton`.
- Map: `map/AppMap`, `AppMapDeck`.
- Nav: `nav/BottomNav`, `TopBar`, `SideRail` (nav has its own
  active-state needs — review before converting).
- Misc: `search/SearchOverlay`, `settings/*`, `plan/PlanBuilder`,
  `discover/LocationAutocomplete`, `live-data/MetricCard`,
  `pwa/InstallPrompt`, `municipality/StayDeepLinks`.

### Conversion rule of thumb
Convert when the control is a standard toggle/intent pill or a mode
tablist. **Don't** force-convert when a per-instance style is doing real
work (a positive-tone outline toggle, a control that floats over the map
with a custom backdrop, nav active states). Cohesion is shared
vocabulary where it fits — not one mold for everything.
