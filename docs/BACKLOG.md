# Backlog

Tracked, not urgent. Reviewed during the structure pass (June 2026).

## /radius — audited, mostly complete ✅
`/radius` already follows the structure-pass playbook: leads with the `WithinReach`
"best moves" strip, events are capped at top-5 with an "All N →" see-all, and the
full place list sits behind a "See everything" toggle (the count is demoted to a
secondary line, not the headline). **Do not rebuild it.** Small follow-ups only:

- [ ] Add **Transit** (nearest bus / MARC stop, with minutes) to the `WithinReach`
      reachable strip — currently missing because transit stops aren't in the
      `AmenityKind` set; needs transit-stop data plumbed into the inside-radius
      reach calc. Feature add, not a reorg.
- [ ] Optional later: small header/copy polish on the "Within reach" strip
      ("What you can reach from here") if it tests better. Cosmetic only.

## /map — structure pass 2/6 (PR #433) ✅
Ranked the in-view list as "Best in this view" (open now → feature_score →
nearest, top 6 + "See all N") and added a "Useful nearby" amenity section
(Events nearby → Useful nearby → Best places). Follow-ups:

- [ ] **Transit stays parked until the data exists — do NOT fake it.** Owner
      directive (June 2026): no placeholder/empty transit chip on the map or in
      `WithinReach`. `AMENITY_DISPLAY` is structured so a real transit kind
      surfaces automatically once transit-stop data lands; until then it stays
      absent, not stubbed.
- [ ] **Parking** is fine as-is: it's a place *category*, so it surfaces
      naturally in "Best places" / category filters. No need to model it as an
      amenity in "Useful nearby."

## Next structure-pass order
Owner directive (June 2026): after /map (#433), do **category pages before
municipality pages**. Category pages are the most likely to read as raw
directories, so they have the bigger "show all the data better" problem.
