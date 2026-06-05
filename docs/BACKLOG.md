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
municipality pages**, then **events**. Category pages are the most likely to
read as raw directories, so they have the bigger "show all the data better"
problem. One clean step at a time — do NOT start the next page until the
current one is merged or tuned.

### Pass 3 — category pages, starting with COFFEE (pattern page)
Goal: *stop making categories feel like directories; make them feel like
guided local choices.* Use **coffee** as the single pattern page — do NOT
build a giant category system yet. Surgical PR around:
- coffee briefing (a short editorial intro, not a count)
- best matches first
- open now
- local favorites
- good for sitting / work
- with food
- nearby
- full browse below (the directory, demoted under the guided sections)

### Pass 4 — events (the current biggest firehose)
Strong data, still reads as a feed. Needs: stricter grouping, capped
descriptions, civic calendar collapsed, and more human sections —
**Tonight / Weekend / Free / With kids / Live music.** Audit before building;
reuse existing event loaders/components, don't rebuild.
