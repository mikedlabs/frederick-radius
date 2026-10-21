# Frederick Radius photo policy

**Status:** Current owner-approved photographic discovery direction.
**Scope:** Photography in the UI, source identity and attribution.
**Updated:** October 20, 2026. This document does not add another plan-approval step to already authorized product work.

## Current direction, approved October 9, 2026

The owner requested a visibly more photographic app and implementation of that direction. For discovery results, this supersedes the older typographic-only defaults and photo-removal phases. Those historical decisions remain in Git history; they are not current instructions.

- Specific place results may lead with their canonical, unsuppressed photograph. Feature, answer, tile and grid cards give the image meaningful space; list and Map rows use readable thumbnails.
- Events may use approved publisher art or a credited photograph of their resolved venue. Captions distinguish the venue from the event. Date, time, location and source remain readable.
- The owner permits their own photographs without a visible credit or date. Today uses them as scenic context, with a descriptive place alt text and its current heading separate from the photograph. A scenic image does not establish current weather or activity. Required third-party attribution remains visible.
- Missing, suppressed, failed or transparent images fall back to the real name and facts. An unrelated scenic image never stands in for a business or event.
- Category navigation retains its glyphs. Source eligibility, venue matching, attribution and duplicate-photo suppression remain in force.
- On phones, complete weather and Find actions remain reachable above the bottom navigation, including when a real advisory appears. Density rules constrain controls and copy without reducing every photograph to a small stamp.

The earlier photo-removal rules are not instructions to flatten these result cards again.


## Source and rendering requirements

- Use an exact, appropriate photograph of the named place or approved event imagery. Favor owned or licensed assets where available; retain the source, rights and actual review evidence.
- Existing provider photos retain their provider delivery, attribution and suppression requirements. Downloading a merchant or provider image does not turn it into owned or licensed media.
- An eligible source or configured provider is not proof that the image decoded. Verify real bytes and visible credits, and test a useful failure state.
- Keep event date, time and venue identity readable. Label a venue photo as venue context rather than implying it depicts the event itself.
- Town and scenic heroes use approved contextual imagery. A random business photo does not establish a town's visual identity.
- Preserve usable touch targets, focus, Back continuity, contrast and reduced motion while refining card layout and animation.

## Superseded decisions

The June and July 2026 text previously kept in this file required photo removal,
typographic-only discovery cards, a photo quota per event window and a separate
plan approval before implementation. Those instructions conflict with the
owner's later direction and no longer apply. Do not restore them when improving
Today, Events, Nearby, Map or Saved. The previous record is preserved in Git
history, including revision `8deb52f1814122370372a740ce9590168f8a7d11`.

Use the current product task, brand tokens and relevant behavior contracts
when implementing approved photographic discovery. Keep source identity,
rights, suppression, attribution and meaningful image-failure checks intact.
