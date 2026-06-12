# Pattern Spec: The Five Interaction Systems

Distilled from the working demos in `docs/reference/pattern-lab.html`. Each demo in that file is a vanilla JS reference implementation; port the behavior to React with the approved kit, not the markup. Open the file in a browser to feel the intended behavior before building.

## P1. Time scrubber (Today)

**Replaces:** the nineteen stacked modules on /today, the four separate Tonight surfaces, the duplicate event renders.

**Behavior:** Today is one canvas. A four-segment control (Now, Tonight, Tomorrow, Weekend) swaps the canvas content in place. Counts render inside the segments only, derived from the same arrays that render the content. Now shows the conditional alert strip, the category chips, and open places. Tonight shows the event hero rendered exactly once plus a dinner pairing row. Tomorrow and Weekend show their event lists.

**Build:** Radix Tabs or plain state, framer-motion for the content swap. The segment counts and the rendered lists must read from one selector per window.

**Accepts when:** /today passes the duplicate-title test, contains zero stat cards, and lands under 150 visible lines with every time window reachable in one tap.

## P2. Map plus sheet (Map)

**Replaces:** the separate map and list surfaces, the Near You module, two of the four open-now entry points, and the /radius twin route.

**Behavior:** the map fills the screen. A draggable sheet carries the list with three detents: peek (about 86 percent down, handle plus header visible), half (about 48 percent), full (about 6 percent, list scrolls internally only at this detent). Drag snaps to the nearest detent on release; tapping the handle cycles detents. Tapping a pin selects its card, raises the sheet to half if at peek, scrolls the card into view, and expands its action row (Directions, Hours, Save) in place. Tapping a card highlights its pin. Nobody navigates away to learn an address.

**Build:** vaul over the existing react-map-gl. The reference file implements the detent math and the pin-card sync.

**Accepts when:** /radius 301s to /map, open-now exists as one map state, and pin-to-directions is two taps.

## P3. Agenda rail (Events)

**Replaces:** both stacked systems on /events, all three search affordances, all view modes beyond List and Map, and every count contradiction.

**Behavior:** one list grouped by day. A horizontal date rail pins above it; tapping a day scrolls the list to that group, and scrolling the list moves the active state on the rail. Five mood chips maximum (All, Music, Family, Civic, Free) filter the single source array. A Refine button opens one sheet holding towns and sort. Every number on the page, rail counts included, derives from the filtered array that renders the cards. At most one pinned Tonight row sits above the list; Today owns best-of editorial, Events owns the complete list.

**Build:** CSS scroll-snap on the rail, scroll position sync on the list (the reference uses offsets; IntersectionObserver is also fine), Radix Dialog for Refine.

**Accepts when:** the count-integrity test passes, /events has zero text inputs, lands under 400 visible lines and under 300 KB decoded, which forces the inline RSC payload fix.

## P4. Plan deck (Today)

**Replaces:** the afternoon plan as a buried text module.

**Behavior:** the generated plan renders as a horizontal snap deck. Each stop is a full card: step label, place name in display type, role line, and the walk time to the next stop as the connective element. A final summary card shows total stops and walking time. Progress dots track the scroll. Shuffle regenerates from live hours with a full deck swap. Save and Share sit in a fixed footer row.

**Build:** CSS scroll-snap or embla-carousel-react for the dots.

**Accepts when:** the deck renders from the live plan generator output and Shuffle produces a different valid plan keyed to current hours and weather.

## P5. Search sheet (the Search tab)

**Replaces:** the Ask tab's empty promise, both /events text inputs, and the keyboard-only ⌘K on mobile.

**Behavior:** the Search tab and any search affordance open one full sheet: a single input, a row of intent pills (Open now, Free this weekend, Family today, Next council meeting, Make me a plan), and grouped results. One shared index covers three kinds: Places, Events, and Actions, where actions include opening the map's open-now state and generating a plan. Tapping an intent pill fills the query. Empty state explains the three kinds; ⌘K remains as the desktop shortcut into the same sheet.

**Build:** the existing cmdk engine rendered inside vaul on mobile. The index is one build-time or edge-cached array of {kind, name, meta, keywords, action}.

**Accepts when:** typing "pizza," "free," and "plan" each return correct grouped results, and the civic persona finds the Planning Commission through this sheet or the Civic chip without encountering a second input anywhere.
