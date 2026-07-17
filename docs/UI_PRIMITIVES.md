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

### `Row` / `RowList` / `IconTile` — dense directory rows
`src/components/ui/Row.tsx`. The antidote to "directory of big cards
that goes on forever." A `RowList` is one elevated, rounded container
with hairline dividers; each `Row` is a ~56px scannable line
(leading icon/thumb + title + subtitle + trailing meta + chevron).
Server-component safe. For generic directory data (parks, trails,
amenities) — use `PlaceCard variant="row"` for place data with photos.

```tsx
<RowList>
  {parks.map((p) => (
    <Row key={p.id} href={`/map?focus=${p.lat},${p.lng}`}
         leading={<IconTile icon={Trees} tone="#2E3B2C" />}
         title={p.name} subtitle={`${kind} · ${p.address}`} meta={`${p.acres} ac`} />
  ))}
</RowList>
```
Pair with `CollapsibleSection` to collapse long lists by group (largest
group `defaultOpen`, rest tucked away, choice persisted).

### `BottomSheet` — the shared progressive-detail shell
`src/components/ui/BottomSheet.tsx` (app-like pass, phase 2). ONE
dismissal grammar for every sheet: spring up, drag-down / backdrop-tap /
ESC to dismiss, focus trap + restore, body scroll lock. Content comes in
via a render prop that receives `dismiss`; pair with the exported
`SheetHandle` for the labeled Close row.

```tsx
<BottomSheet present={Boolean(item)} onClose={clear} ariaLabel={item?.name ?? "Details"}>
  {(dismiss) => item && <MyContent item={item} onClose={dismiss} />}
</BottomSheet>
```
- `PlaceSheet` and `EventSheet` are the two canonical consumers — build
  the NEXT sheet on this shell, never a new modal stack.
- Event side: `EventSheetProvider` (mounted in the app layout) +
  `EventSheetBoundary` wire whole surfaces by event delegation — cards
  keep their real `/events/[slug]` anchors; a plain left-click opens the
  sheet, modified clicks and unknown slugs fall through to navigation.
  `fetchMissing` mode (used by /today, /live-music) opens on a skeleton
  and fetches `/api/events/[slug]/summary` so lean pages ship zero extra
  event data. Sheets FRONT-RUN pages; they never replace them (canonical
  URLs, JSON-LD, and SEO stay on the real pages).

### Other canonical pieces (already existed — keep using)
`Surface`/`Card`, `Chip` (tonal display pill, non-interactive),
`CollapsibleSection` (hide-when-not-needed group wrapper),
`SectionHeading`, `EmptyState`, the `.text-*`/`.display-*` type scale,
`.deck-card`. The weight rule: 400 quiet · 500 labels · 600 titles ·
700 numerics only.

### Directory density — done
`parks` (10,680px → 1,682px) and `trails` (~1,673px) rebuilt from
big map-thumbnail card grids to dense `Row` + collapsed-by-town
`CollapsibleSection`. These were the two true "card dump" pages; the
other long surfaces (parking, amenities, transit, places) are
editorial guides or already use compact rows — left as-is by design.

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
