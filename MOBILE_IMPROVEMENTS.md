# Mobile Hierarchy & Empty/Error States — 2026-09-21

## Summary

Improved mobile experience for Frederick Radius by addressing hierarchy issues
with overlapping chrome and inconsistent empty/error states. Changes maintain
the dark-only visual language and 44px minimum tap targets while making data
outages and empty states clearer on phone-width viewports (320-430px).

## Changes Made

### 1. New FeedStatus Component (`src/components/ui/FeedStatus.tsx`)

**Purpose:** Consolidated feed/layer status indicator that replaces scattered
inline status messages.

**Features:**
- Five status types: `loading`, `error`, `stale`, `degraded`, `empty`
- Names data sources explicitly (e.g. "TransIT feed", "Weather radar")
- Groups multiple statuses without overlapping (FeedStatusGroup wrapper)
- Consistent retry UI with 44px minimum tap targets
- Responsive sizing (36px min-height on narrow mobile)

**Mobile improvements:**
- Positions at `z-map-control` (above map, below drawers)
- Adapts bottom position for BottomNav on mobile (72px from bottom)
- Reduces padding/font on 320-375px viewports
- Prevents status chips from obscuring selected content

**Usage:**
```tsx
<FeedStatusGroup>
  <FeedStatus
    status="stale"
    source="live buses"
    detail="last update 2 min ago"
  />
  <FeedStatus
    status="error"
    source="weather radar"
    onRetry={() => refetch()}
  />
</FeedStatusGroup>
```

### 2. Enhanced EmptyState Component (`src/components/ui/EmptyState.tsx`)

**Changes:**
- Added `compact` mode for tight spaces (reduced padding, smaller icon)
- Added `caution` tone for delayed/degraded data states (amber accent)
- Responsive typography (scales 17-20px serif on mobile)
- New `CompactEmptyState` export for inline panels

**Mobile improvements:**
- Padding scales from `px-4 py-6` on 320px to `px-6 py-10` on larger screens
- Icon halo reduces from 12x12 to 10x10 in compact mode
- Body text maintains 12-13px readability across viewports

**Updated tones:**
- `quiet` — default ink tones
- `brand` — Brick accent for primary actions
- `positive` — Catoctin Forest for "all caught up"
- `caution` (new) — Amber for delayed/degraded states

### 3. MapList Empty State (`src/components/map/MapList.tsx`)

**Before:** Hand-built `.map-list-empty` div with serif title and sub text.

**After:** `CompactEmptyState` component with:
- `MapPin` icon for failure mode, `Search` icon for filter mismatches
- Clearer mobile-friendly messaging
- Consistent styling with rest of app
- Proper spacing in `max-w-[680px]` container

**Result:** Empty map list now reads as intentional guidance rather than a
layout gap.

### 4. EventsExplorer Empty State (`src/components/event/EventsExplorer.tsx`)

**Before:** Hand-built empty state with manual icon halo, title, description,
and retry button inline.

**After:** `EmptyState` component with:
- `compact` mode for inline presentation
- `caution` tone when `!dataComplete` (incomplete calendar)
- Extracted retry button as separate control with proper tap target
- Reduced code from ~40 lines to ~20

**Result:** Calendar empty states now visually match other surfaces and
communicate data quality (caution tone for degraded sources).

### 5. CSS Improvements (`src/app/globals.css`)

**Feed status classes:**
- `.feed-status` — base indicator with status-specific variants
- `.feed-status-group` — stacks multiple statuses without overlap
- Responsive positioning (above BottomNav on mobile)
- Loading spinner animation
- Error/retry button styling

**Mobile media queries:**
- `@media (max-width: 1023.98px)` — positions feed group above mobile nav
- `@media (max-width: 375px)` — tighter spacing for narrow phones

**Z-index scale (unchanged):**
- `--z-map-control: 20` — map in-canvas status/alerts
- `--z-map-drawer: 25` — map in-view drawer (above status)
- `--z-sticky: 30` — TopBar, sticky headers
- `--z-nav: 40` — BottomNav, SideRail
- `--z-overlay: 50` — modal backdrops and sheets

Feed status indicators respect this scale, staying at `z-map-control` so
drawers and overlays always win.

### 6. Storybook Stories

**FeedStatus.stories.tsx:**
- All five status types
- Multiple statuses grouped
- Mobile viewport example

**EmptyState.stories.tsx (updated):**
- New compact mode
- New caution tone
- CompactEmptyState variant
- Mobile narrow viewport example

## Mobile Hierarchy Principles Applied

1. **One overlay at a time:** Status indicators stack cleanly and never
   obscure selected content (drawers win at z-25 vs status at z-20).

2. **Clear primary vs secondary:** Map canvas is primary; status chips are
   supporting context that yields to selected places/events.

3. **Consistent spacing:** Safe-area-aware padding (`env(safe-area-inset-*)`)
   and responsive positioning (above BottomNav on mobile).

4. **44px minimum targets:** All interactive elements (retry buttons, CTAs)
   maintain at least 44x44px effective tap area.

5. **Readable stacking:** Status messages group vertically without overlap;
   multiple feeds can report simultaneously.

## Empty/Error State Principles Applied

1. **Intentional, not phantom:** Every empty result shows a designed moment
   with icon, title, explanation, and (when appropriate) action.

2. **Honest about coverage:** Caution tone and explicit messaging when data is
   incomplete or degraded ("calendar is incomplete" vs generic "no results").

3. **Name the source:** Feed errors identify what failed ("TransIT feed
   unavailable" vs "something went wrong").

4. **Offer next steps:** CTAs suggest loosening filters, retrying, or browsing
   alternate surfaces.

5. **Consistent patterns:** CompactEmptyState for inline panels; full
   EmptyState for page-level results.

## Testing Checklist

- [ ] MapList empty state renders correctly when filters match nothing
- [ ] MapList failure mode shows MapPin icon and appropriate message
- [ ] EventsExplorer empty state shows caution tone when !dataComplete
- [ ] EventsExplorer retry button maintains 44px tap target
- [ ] FeedStatus component renders all five status types
- [ ] Multiple FeedStatus indicators stack without overlap on 320px viewport
- [ ] Feed status positions above BottomNav on mobile (<1024px)
- [ ] Empty states maintain readability at 320, 375, 390, 430px viewports
- [ ] All interactive elements pass 44x44px tap target requirement
- [ ] Storybook stories render correctly

## Next Steps (Optional Follow-ups)

1. Migrate legacy `.map-live-status` uses to FeedStatus component
2. Add FeedStatus to MapOverlays error handling
3. Consider feed-specific icons (bus for TransIT, cloud for weather)
4. Add empty states to remaining data-driven panels (fair vendors, food trucks)
5. Create comprehensive empty-state audit of all list/grid surfaces

## Files Changed

- `src/components/ui/FeedStatus.tsx` (new)
- `src/components/ui/FeedStatus.stories.tsx` (new)
- `src/components/ui/EmptyState.tsx` (enhanced)
- `src/components/ui/EmptyState.stories.tsx` (updated)
- `src/components/map/MapList.tsx` (improved empty state)
- `src/components/event/EventsExplorer.tsx` (improved empty state)
- `src/app/globals.css` (feed status CSS + mobile responsive)
- `MOBILE_IMPROVEMENTS.md` (this file)

## Verification Commands

```bash
# TypeScript check
npx tsc --noEmit

# Lint
npm run lint

# Visual regression (Storybook)
npm run test:storybook

# Build
npm run build
```

## Commit History

1. `d4dc06f` — Add FeedStatus component and enhance EmptyState for mobile
2. `5566ced` — Improve empty states in MapList and EventsExplorer
3. (this commit) — Document mobile improvements and add responsive CSS

---

**Rationale:** Frederick Radius is map-first and capability-dense. Mobile users
should never wonder whether a blank surface is a data outage, a filter
mismatch, or a design bug. These changes make every empty moment an
intentional, helpful experience.
