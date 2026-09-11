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

## Location

Every location-aware answer states its scope as **Near me**, **Whole county**,
or a named municipality. A location request must explain the benefit before
the browser permission prompt appears. Declining location always leaves a
working county or town fallback.

The map must not expose two controls that change the same location state.
Recenter, scope, and the location readout must agree.

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
