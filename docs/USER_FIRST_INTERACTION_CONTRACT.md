# User-first interaction contract

Frederick Radius has many capabilities, but people should not have to choose a
tool before they can get an answer. Product surfaces organize those
capabilities around the task a person is trying to complete.

## Permanent destinations

The mobile navigation keeps four stable destinations:

- **Today** answers what is useful now.
- **Map** answers where something is and what is nearby.
- **Events** answers what is scheduled.
- **Saved** holds what the person chose to keep.

Ask, search, category matching, and tool routing share one request doorway.
The system decides which capability handles the request. The person does not
choose between "search" and "AI" first.

A confirmed complete place name leads with that place and its actions.
Incidental words inside the name must not add a category shortcut above it or
change what Enter opens after retrieval. Same-name branches retain their normal location scope and ranking;
requested features, hours and event searches keep their own constraints.

## Location

Every location-aware answer states its scope as **Near me**, **Whole county**,
or a named municipality. A location request must explain the benefit before
the browser permission prompt appears. Declining location always leaves a
working county or town fallback.

The map must not expose two controls that change the same location state.
Recenter, scope, and the location readout must agree.

Today's arrival photographs lead directly to a scoped category or an exact
place. A category illustration never implies that a named business serves the
pictured food. Frederick storefronts appear only in the county or Frederick
lens; other town and Near me lenses retain their own category destination.
The URL scope wins over a saved scope, and Back preserves the original query
and section. Image failures keep the named action usable. Required photograph
credits remain outside the destination link, with usable touch targets.

## Map

The map is an answer surface, not a layer manager.

- Common tasks apply immediately and close their chooser.
- Advanced data layers stay behind one secondary control.
- Search does not move the camera until the person selects a result or submits
  the query.
- A task returns a small ranked set of candidates, not pins alone.
- A selected result opens one complete mobile surface.
- Browser Back closes that result before it leaves the map.
- Camera, scope, filters, and query survive the close and return journey.
- Empty coverage says what Radius knows and offers the nearest useful fallback.

## Transit

The rider's selected stop and next arrival lead the screen. Saved stops remain
easy to switch; changing a stop is a deliberate disclosure once one is selected.
Following departures stay compact, with bus-specific actions available inline.

The stop shell uses the committed official GTFS network and does not wait for
secondary train information. Arrival detail shares the selected-stop snapshot.
Freshness expires against the source clock even while a refresh is pending;
stale estimates cannot imply that a bus is catchable.

The live map opens deliberately or through a validated Track, Show stop, or
route action. Its static preview is clearly a route diagram, without invented
vehicles. The latest exact intent survives a deferred map load when device
storage is unavailable. Opening the map does not alter the rider's URL or
history. Other existing map consumers keep their normal loading policy.

On a phone, a stop preview uses the shared bottom sheet and one arrival reader
instead of a bubble clipped by the map. Its presentation stays stable through
rotation. Close, Escape and native Back dismiss its single temporary history
layer and return focus to the stop marker. Use this stop waits for history and
sheet focus cleanup before selecting the exact stop and returning to My stop.
Desktop stop previews retain the map popup.

Zoom and contextual reset operate on the existing map instance and keep the
selected route, stop and rider URL. No second location control or automatic map
reload is needed. Vehicle detail shows the reported ETA without inventing a
percentage of the journey completed.

A representative route schematic is not a directional itinerary or an exact
remaining-stop count. Delayed or unavailable vehicle reports lose live cues
and estimates; official schedules remain available.

## Progressive disclosure

Only one overlay may own the screen. Sheets do not open another sheet for the
same decision. Directories and raw inventories stay behind a deliberate
secondary action. Unavailable readings and empty modules do not take primary
space.

## Mobile acceptance checks

- A common need can reach a useful answer within two actions after location
  setup.
- Every interactive target is at least 44 by 44 CSS pixels.
- Labels remain understandable at 320, 375, 390, and 430 pixels.
- Back, Escape, and close controls restore focus and the originating context.
- Reduced motion, keyboard operation, and screen-reader names remain part of
  the same interaction rather than a separate fallback experience.
