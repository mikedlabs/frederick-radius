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
<Pill tone="brand" active={on} onClick={toggle} icon={<Zap className="h-3.5 w-3.5" aria-hidden />} count={3}>Music</Pill>
<Pill tone="ink" size="sm" href="/today?t=tonight" active={mode==="tonight"}>Tonight</Pill>
```
- **tones:** `brand` (selected facet) · `cool` (town/place lane) · `ink`
  (the "when?" lane) · `prominent` (currently the same solid fill as
  `brand`, with no gradient; no product surface uses it today).
- **`href`** renders a Next `<Link>`. While its navigation is pending the
  pill shows an inset ring, and a spinner replaces the icon when an
  `icon` was passed. Without `href` it renders a `<button>` with
  `aria-pressed`, `onClick` and haptics.
- **`bare`** is for chip rows inside a shared elevated container.
  Inactive chips are transparent with no border of their own. No
  production surface uses it today.
- **`icon`** takes a rendered element such as
  `<Zap className="h-3.5 w-3.5" aria-hidden />`, not the component
  itself, because a server component cannot pass a function to this
  client component. **`count`** is a tone-aware badge. **`size`** is
  `sm` or `md`.

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
    <Row key={p.id} href={`/map?at=${p.lat},${p.lng}`}
         leading={<IconTile icon={Trees} tone="var(--app-brand-2)" />}
         title={p.name} subtitle={`${kind} · ${p.address}`} meta={`${p.acres} ac`} />
  ))}
</RowList>
```
Pair with `CollapsibleSection` to collapse long lists by group (largest
group `defaultOpen`, rest tucked away, choice persisted).

### `BottomSheet` — the shared progressive-detail shell
`src/components/ui/BottomSheet.tsx` (app-like pass, phase 2). ONE
dismissal grammar for every sheet built on it: spring up, drag-down / backdrop-tap /
ESC to dismiss, focus trap + restore, body scroll lock. Content comes in
via a render prop that receives `dismiss`; pair with the exported
`SheetHandle` for the labeled Close row.

```tsx
<BottomSheet present={Boolean(item)} onClose={clear} ariaLabel={item?.name ?? "Details"}>
  {(dismiss) => item && <MyContent item={item} onClose={dismiss} />}
</BottomSheet>
```
- The app has two sheet shells in production. Do not add a third, and do
  not move a surface from one shell to the other without an owner
  request.
  - `BottomSheet` (`src/components/ui/BottomSheet.tsx`, framer-motion)
    is the progressive-detail shell described above. It takes a render
    prop, pairs with `SheetHandle`, and accepts `historyLayerId` so the
    browser Back button can close it. `PlaceSheet`, `EventSheet`,
    `TransitStopPreview`, `ContactsDirectory` and the Right Now filter
    sheet use it directly. `Sheet` (`src/components/ui/Sheet.tsx`) is a
    thin title, subtitle and footer adapter over it, used by Ask,
    Feedback and Pulse.
  - `BottomDrawer` (`src/components/ui/BottomDrawer.tsx`, vaul) takes a
    `title` and either a `trigger` or a controlled `open` and
    `onOpenChange`. A controlled drawer that passes `historyLayerId`
    closes in place on the browser Back button. Leave the id off only
    when the route itself owns history. Beer, Fair, Food trucks, Plan,
    the map selection surfaces and `InterceptedDrawer` use it.
  - When you extend an existing surface, keep the shell it already uses.
    The docs record no rule for choosing a shell on a new surface, and
    existing usage does not split cleanly (`BeerSheet` shows one beer in
    a `BottomDrawer`, and the Right Now filters use `BottomSheet`).
    `docs/BACKLOG.md` lists the two shells as open sprawl. Both close
    on the browser Back button through `historyLayerId`. Confirm the
    shell for a new surface with the owner.
  - Do not hand-build a third sheet, a `role="dialog"` container, a
    focus trap, or a grab handle that does not drag. On `BottomSheet`
    the whole handle row drags and the content does not, so scrolling
    always wins inside the sheet.
  - Lock page scroll with `useScrollLock(active)` from
    `src/hooks/useScrollLock.ts` (or `acquireScrollLock()` from
    `src/lib/scroll-lock.ts` outside React effects). The document
    scrolls on `html`, so setting `document.body.style.overflow` does
    nothing here.
- Event side: `EventSheetProvider` (mounted in the app layout) +
  `EventSheetBoundary` wire whole surfaces by event delegation — cards
  keep their real `/events/[slug]` anchors; a plain left-click opens the
  sheet, modified clicks and unknown slugs fall through to navigation.
  `fetchMissing` mode (used by /today, /live-music) opens on a skeleton
  and fetches `/api/events/[slug]/summary` so lean pages ship zero extra
  event data. Sheets FRONT-RUN pages; they never replace them (canonical
  URLs, JSON-LD, and SEO stay on the real pages).

### Transient feedback: Sonner through `AppToaster` and `notify`

`src/components/ui/AppToaster.tsx` is the one Sonner configuration,
mounted once in the root layout and reused by stories. It follows the
saved appearance, styles every Sonner part with `--app-*` tokens, and
sits at `--z-toast`. Raise toasts through `src/lib/feedback/notify.ts`:

```ts
notifySaved({ label: place.name, onUndo, item: { type: "place", id } });
notifyRemoved({ label: place.name, onUndo, item: { type: "place", id } });
notifyError({ title: "That did not save.", description, onRetry });
```
- A reversible action offers Undo for 6 seconds. An error stays 8
  seconds and offers a retry when one exists.
- Toasts for one item share an id, so toggling it replaces its toast
  instead of stacking another.
- Do not write a flash strip, a status chip, or a timer-driven message
  by hand. The anchored locate message on the map is the one documented
  exception, because it must stay beside the control it describes.
- Sonner's defaults are a recognizable look of their own. Check any new
  toast variant in dark appearance.

### Other canonical pieces (already existed — keep using)
`Button` (`src/components/ui/Button.tsx`, the canonical action, with
`primary`, `secondary` and `quiet` variants), `Chip` (tonal display
pill, non-interactive),
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

**Adopted today (checked against imports on 2026-11-10):**
- In product code, `Pill` is imported by `municipality/TownStrip`,
  `fair/FairVendorExplorer` and `ui/FilterChip`. The internal styleguide
  page also renders it.
- `FilterChip` wraps `Pill` and is used by `place/PlaceList`,
  `radius/RadiusBuilder` and `saved/SavedList`.
- `Segmented`, `today/TimeToggle`, `map/MapModeToggle` and
  `map/MapTimeChips` were deleted. The map Radius/Browse toggle was
  removed by owner call, so do not rebuild it.
- The Events filter controls moved from `event/EventsExplorer` to
  `event/EventsBoardDock`, which does not use `Pill` yet.

**Remaining hand-written toggle sites (convert opportunistically as
each surface is touched; skip where a bespoke style is load-bearing):**

The components this checklist used to name (`LensBar`, `TodayTabs`,
`MoodTiles`, `RightNowStrip` and others) have been deleted. On
2026-11-10 these files held the most hand-written `aria-pressed` toggles
and did not import `Pill`:
- Map: `map/MapDock`, `map/MapEdgeTools`.
- Events: `event/EventsBoardDock`.
- Fair and Beer: `fair/FairDayWorkspace`, `fair/FairGroundsMapInner`,
  `fair/FairBoothExplorer`, `beer/BeerIndex`.
- Other: `archive/ArchiveLens`, `settings/PreferencesPanel`,
  `plan/PlanBuilder`, `deals/DealsBrowser`, `nav/LocationChip`.

Run `grep -rc "aria-pressed" src/components` for the current list before
planning a conversion. The nav components (`nav/BottomNav`,
`nav/TopBar`, `nav/SideRail`) have their own active-state needs, so
review before converting them.

### Conversion rule of thumb
Convert when the control is a standard toggle/intent pill or a mode
tablist. **Don't** force-convert when a per-instance style is doing real
work (a positive-tone outline toggle, a control that floats over the map
with a custom backdrop, nav active states). Cohesion is shared
vocabulary where it fits — not one mold for everything.
