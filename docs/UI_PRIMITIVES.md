# UI Primitives & the Cohesion Rollout

> The app already had a good design system, but it was not adopted. The
> canonical `FilterChip` existed but was used in 3 files while the same
> toggle pill was hand-rolled about 40 times with five slightly different
> stylings. This is the standard and the checklist to finish adopting it
> everywhere ("adopt once, then everywhere", from the UX audit).

## The shape these primitives follow (November 10, 2026)

The owner approved the "Plain tool, with the coral plate" interface on
November 10, 2026. The canonical rules are in the Interface shape section of
[`docs/brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md), and the surface, radius
and shadow tables are in [`docs/STYLE.md`](STYLE.md). Content is rows on the
page ground separated by a hairline or by space. Fields and buttons use the
6px `--app-radius-md`. A full capsule survives only on compact filter chips,
status badges and toggle switches. Type carries the hierarchy. A page has one
solid Deep Coral block and, at most, its one filled coral action. A selected
filter chip is filled ink (background `--app-ink`, text `--app-bg`), never
coral. Coral text uses `--app-link` or `--app-brand-text`, Creek text uses
`--app-cool-text`, and forest text uses `--app-forest-text`; the fill tokens
`--app-brand`, `--app-brand-press` and `--app-cool` are never text colors.
Libre Caslon Display is the wordmark and a rare editorial signature on a few
specialty guide pages. It never appears on Today, Map, Events, Saved, Find,
Tools, Settings, Ask, place pages or event pages, where every title is heavy
system sans. A row shows
a thumbnail only when a real photograph exists; otherwise it keeps the media
slot and shows a plain `--app-ink-3` glyph with no tile behind it. A rounded,
bordered card around ordinary content is a regression. The primitives below
already draw this shape, so reuse them before writing new markup.

## The canonical interactive primitives

### `SectionHeading`: the strong title above a group of rows
`src/components/ui/SectionHeading.tsx`. A bold system sans title (20px at
`lg`, 16px at `sm`), an optional quiet tabular count, one hairline that fills
the remaining width, and an optional trailing action (`href` for a "See all"
link, `onCtaClick` for a button, or any `trailing` control). It has no accent
tick, box or tinted band; the title and the rule carry the break. The action
text mixes the route accent (`--section-accent`, else `--app-brand`) toward
ink, and a context can override it with `--app-heading-action`.

```tsx
<SectionHeading title="Open now" count={12} href="/places?open=1" />
```
- Use it for a titled group of results on a list page.
- Do not use it for the small uppercase label between sections of a detail
  page; that is `PlaceSectionLabel`. Do not wrap it in a card or add a
  colored tick.

### `PlaceSectionLabel` and `PlaceDotList`: detail page labels and facts
`src/components/place/PlaceSectionLabel.tsx`. `PlaceSectionLabel` is the
13px uppercase system sans label with `0.1em` tracking in `--app-ink-3`,
rendered as `h2`, `h3` or `p`. The page draws one hairline between sections,
so the label never brings its own rule, tick or box. Its class string is
exported as `PLACE_SECTION_LABEL_CLASS` for a label that must be built by
hand. `PlaceDotList` renders informational items (what a place is known for,
who it suits) as one line of 15px ink text separated by middle dots. Each dot
is bound to the item before it, so a wrapped line never starts with one.

- Use the label for each section of a place page and for any detail page
  that follows the same ruled layout.
- Use `PlaceDotList` whenever a set of facts would otherwise be drawn as
  tags. Facts are not controls, so they are never capsules.
- Do not use the label as a list heading with an action; that is
  `SectionHeading`.

### `Pill`: the compact filter chip
`src/components/ui/Pill.tsx`. The one capsule-shaped control, for a "tap to
narrow or pivot" choice. An unselected chip is a hairline
`--app-control-border` outline on the page ground. A selected filter chip is
filled ink (background `--app-ink`, text `--app-bg`), never coral, so coral
stays reserved for the page's one bold block and one filled action. The box is a real 44px minimum in both
dimensions, so it survives a clipped scrolling rail.

```tsx
<Pill active={on} onClick={toggle} icon={<Zap className="h-3.5 w-3.5" aria-hidden />} count={3}>Music</Pill>
<Pill size="sm" href="/today?t=tonight" active={mode==="tonight"}>Tonight</Pill>
```
- **tones:** `ink` is the default and the selected state for every filter
  chip. `cool` is a Creek fill for a town or place lane. `brand` is a press
  coral fill for a caller that deliberately needs it. Never use `brand` on a
  filter chip, because it would add a second coral field to the page.
- **`href`** renders a Next `<Link>` with `aria-current`. While its
  navigation is pending, a spinner replaces the icon when an `icon` was
  passed. Without `href` it renders a `<button>` with `aria-pressed`,
  `onClick` and haptics.
- **`bare`** drops the outline for chip rows inside a shared container. No
  production surface uses it today.
- **`icon`** takes a rendered element such as
  `<Zap className="h-3.5 w-3.5" aria-hidden />`, not the component itself,
  because a server component cannot pass a function to this client
  component. **`count`** is a tone-aware badge. **`size`** is `sm` or `md`.
- Do not use `Pill` for an ordinary action, navigation, a row, or an
  informational tag. Those are `Button`, a text link, a `Row`, or plain
  text.

### `FilterChip`: a single-select facet
`src/components/ui/FilterChip.tsx`. A thin wrapper over `Pill` at
`size="sm"` with the default ink tone: an outline when off, an ink fill when
on, and an optional count so a person sees how much each choice holds before
tapping. Use it in facet rows (cuisine, saved lists, the Radius builder). Do
not use it as a tab bar or as a navigation link.

### `Button`: the canonical action
`src/components/ui/Button.tsx`. Flat, with the 6px `--app-radius-md` corner,
a 44px minimum height at every size, and no gloss, lip, glow or lift. Pass
`href` for a Next link; otherwise it renders a real `<button>` with
`loading`, `disabled` and `aria-pressed`. It forwards
`data-decision-action`.

- **`primary`** is the one filled coral action a view may have: white
  (`--app-on-brand`) on `--app-brand-press`. Use it at most once per view.
- **`secondary`** is an outlined control on the page ground with a
  `--app-control-border` edge. This is the normal second action.
- **`quiet`** is text with a sunken hover ground.
- Do not make a button a capsule, and do not hand-build a coral fill with
  `--app-brand`.

### `SortDropdown`: a single-select menu
`src/components/ui/SortDropdown.tsx`. A field-shaped trigger (6px corner,
`--app-control-border` edge) that opens a menu of sort choices. The menu is
an opaque `--app-bg-elevated-solid` popover with a hairline edge, the 6px
corner and `--app-shadow-3`, because it really sits above the page. The
current choice is ink on the sunken ground with a check, not a coral tint.
Escape, an outside press and tabbing away close it. State belongs to the
caller.

- Use it in a list page toolbar beside a count or a layout toggle.
- For one choice from a long list inside a form, a native `<select>` is
  simpler. Stop and ask before writing new `menu` or `listbox` markup.

### `EmptyState`: an honest empty result
`src/components/ui/EmptyState.tsx`. Plain text on the page ground under one
hairline: a 17px semibold title with a small inline icon, an optional 14px
body, one outlined 6px action, and an optional underlined secondary text
link. `tone` colors only the icon (`quiet`, `brand` through
`--app-brand-text`, or `positive` through `--app-forest-text`). There is no
box, halo or gradient.

- The title is a complete sentence that says what is true ("Nothing on the
  calendar for tonight.").
- Do not add a second button, and do not put the empty state in a card.

### `Row` / `RowList` / `IconTile`: dense directory rows
`src/components/ui/Row.tsx`. A `RowList` is a run of ruled rows on the page
ground, closed by one hairline above and below (`border-y` on the list), with
a `border-b` hairline on each row except the last and no rounded container or
lift. Each `Row` is at least 56px tall, with a leading slot, a 17px semibold
title, a 14px subtitle, a quiet tabular `meta`, and a chevron (or an external
glyph) when it links somewhere. It is server-component safe. Use it for
generic directory data (parks, trails, amenities, contacts). Use
`PlaceCard variant="row"` for place data with photos and hours, and
`EventRow` for events.

```tsx
<RowList>
  {parks.map((p) => (
    <Row key={p.id} href={`/map?at=${p.lat},${p.lng}`}
         leading={<Trees className="h-6 w-6" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />}
         title={p.name} subtitle={`${kind} · ${p.address}`} meta={`${p.acres} ac`} />
  ))}
</RowList>
```
- The leading slot holds a real photograph thumbnail when one exists, and
  otherwise a plain category glyph in `--app-ink-3` at about 24px with no
  background. Keep the slot the same width down the list so titles align.
- `IconTile` is a plain glyph slot: the category icon in `--app-ink-3` with
  no tile, tint, border or radius behind it. Never draw a gray or tinted tile
  or a letter monogram in a row's leading slot.
- Pair it with `CollapsibleSection` to collapse long lists by group (the
  largest group `defaultOpen`, the rest tucked away, the choice persisted).
- Do not add a gap between rows or wrap a row in a card; the hairline is
  the separator.

### `EventRow`: one event in any list
`src/components/event/EventRow.tsx`. The shared event row: a left time
column (the start clock with a smaller meridiem, then the date unless the
group heading already states the day), the facts (an optional category,
live or status eyebrow, the title as the event link, the venue, and a timing
note such as "Until 9:00 PM"), and an optional right-hand thumbnail placed by
the row grid (or the muted category glyph in that slot). It carries the
decision telemetry attributes
(`data-decision-*`) and the stable `data-event-*` hooks that earlier card
contracts used.

- **`lead`** turns the time column into the solid Deep Coral block, the one
  bold field on Events. Set it on one row per page at most. Every other row
  keeps an ink time column.
- **`media`** is passed only when an approved photograph or publisher
  artwork exists, with `mediaKind` (`photo`, `artwork` or `none`) and an
  optional `mediaCredit` that follows the facts outside the event link. It
  renders as a 64px square at the right of the row (56px below 360px).
- **`glyph`** takes the event's category slug. A row with no approved
  picture keeps the 64px media slot and shows the muted `--app-ink-3`
  category glyph there at 24px, with no tile, tint or border, so titles line
  up down the list. The lead row and banner rows never show it. Below 360px
  wide the glyph is hidden and its slot goes back to the title. `EventCard`
  passes `glyph: event.category` on every list row.
- **`banner`** places a full-width picture above the facts for a pictured
  lead.
- The other props are the facts (`slug`, `title`, `weekday`, `month`, `day`,
  `startTime`, `timing`, `category`, `where`, `extra`), state (`live`,
  `status` with `statusColor`, `cancelled`), `showDate` (false when the group
  heading already states the day; the date stays available to screen
  readers), `action` (a control such as Save that keeps its own tap target
  above the row link), `headingLevel` (`3` under a group heading, `2` for a
  lead directly under the page title), and the telemetry hooks `position`,
  `surface`, `layout` and `poster`.
- Use it on Today, Events, Saved and the map list. Do not rebuild an event
  card, and do not give a second row the coral block.

### `BottomSheet`: the shared progressive-detail shell
`src/components/ui/BottomSheet.tsx` (app-like pass, phase 2). ONE
dismissal grammar for every sheet built on it: spring up, drag down, tap the
backdrop or press Escape to dismiss, with a focus trap and restore and a
body scroll lock. Content comes in via a render prop that receives
`dismiss`; pair with the exported `SheetHandle` for the labeled Close row.
A sheet is a real layer above the page, so it keeps its surface
(`--app-bg-elevated-solid`), the 8px `--app-radius-lg` top corners, a
hairline top edge and `--app-shadow-3`. Content inside it still follows the
row rules, so do not put cards inside a sheet.

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
    the map selection surfaces and `InterceptedDrawer` use it. It draws
    the same 8px top corners and hairline edge as `BottomSheet`, with the
    deeper `--app-elev-3` layer shadow and a 44px outlined close control.
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
- Event side: `EventSheetProvider` (mounted in the app layout) and
  `EventSheetBoundary` wire whole surfaces by event delegation. Rows
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

### `MobileActionBar`: the primary actions on a detail page
`src/components/ui/MobileActionBar.tsx`. On phones it replaces `BottomNav` on
place and event detail pages and pins the key actions (directions, call,
tickets, calendar, save) within thumb reach. It is a flat bar attached to the
screen's bottom edge: the page ground with one top hairline, and no floating
offset, card, radius or shadow. Its height matches `--app-bottomnav-reserve`
above the bottom safe area, so toasts and the feedback trigger clear it as
they clear the tab bar. `MobileBarLink` with `primary` is the one filled
coral cell (white on `--app-brand-press`); every other cell is quiet ink text
under its icon. `MobileBarControl` wraps a reused client control such as
`SaveButton`. Link cells forward `data-decision-action`.

- Give a bar at most one `primary` cell, and only when the page has no other
  filled coral action.
- Do not stack it above `BottomNav` or add a second floating action bar.

### Other canonical pieces (already existed, keep using)
`CollapsibleSection` (a group wrapper that hides what is not needed) and the
`.text-*`/`.display-*` type scale. `TrustChip` is already plain text: an
11px semibold label in `--app-ink-2` after a small colored level dot, with
the basis as a tooltip or, in detail mode, a second muted line. It has no
border, fill or capsule. `FreshnessChip` is also plain text: an 11px label
after a small state icon, with no background or radius. `Chip` still draws a
small tinted tag with the 4px `--app-radius-sm` corner (not a capsule), and
it is the only one of the three still pending conversion. Render a new
informational tag as plain text rather than copying `Chip`. The weight rule is
400 for quiet text, 500 for labels, 600 for row titles, and 700 or heavier
for page and section titles and numerics.

### Directory density: done
`parks` (10,680px → 1,682px) and `trails` (~1,673px) rebuilt from
big map-thumbnail card grids to dense `Row` + collapsed-by-town
`CollapsibleSection`. These were the two true "card dump" pages. The
other long surfaces (parking, amenities, transit, places) are editorial
guides or already use compact rows, and were left as they are by design.

## Rollout status

**Adopted today (checked against imports on 2026-11-10):**
- In product code, `Pill` is imported by `municipality/TownStrip` and
  `ui/FilterChip`.
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
vocabulary where it fits, not one mold for everything.
