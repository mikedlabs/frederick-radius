# Mobile UX audit — July 2026 (partial harvest)

Owner engagement: "massive UI/UX improvements across the whole site... super fast, clever, attention to detail, one of a kind on mobile." Brand decision (owner, 2026-07-10): KEEP the current palette/style as-is; spend everything on craft/speed/UX/detail.

A 7-group audit workflow swept the app at 390px (real renders, findings grounded in source files). The session's token budget ended it early: the /today group completed in full, the /events group was mid-flight (one confirmed finding salvaged below), and map / places / saved-plan / discovery / utility were NOT audited. This file banks the completed work so a future session can act on it directly, and re-run the sweep for the remaining groups.

## How to continue (future session)

- The findings below are ready to implement as-is; each names its files. Verify empirically at 390px (playwright-core, /opt/pw-browsers/chromium, beta cookie on localhost) before/after.
- To audit the REMAINING route groups, re-run the workflow script saved at the session path in git history (or simply re-prompt: one auditor per group: map dock chrome, /nearby+/category+place detail, /my-radius+/plan+/weekend, /collections+/towns+/m/*+/open-now+/deals+/live-music, /search+/contacts+/transit+/parking+/amenities+/settings). Workflow run-caches are same-session only; the durable artifact is this file.

## Salvaged from the in-flight /events audit

- CONFIRMED layout bug: the /events peek-card grid track measures 397px inside a 358px container at 390vw (horizontal overflow). Re-measure, then fix the grid template/min-widths in the events explorer peek cards.

## Completed findings — /today group

### [P0 (high)] [ux] /today

**What:** The page's first live signal is a social-services meeting: at 11:19 AM the 'On now, near you' strip led with 'LIVE NOW · DCFS Family Support Specialist · Thurmont Regional Library, Small Meeting Room' in serif with a pulsing vermilion dot. pickLiveEvent() filters only by isEventLiveNow with zero draw-ranking, so civic/utility programming that WhatsOn deliberately demotes to 'Also today' becomes the strip's headliner. Also 'near you' is claimed for a venue ~25 min from Frederick with no location logic.

**Fix:** In pickLiveEvent (src/lib/today/on-now.ts), exclude isUtilityEvent() rows and rank the remainder with compareForLead — the exact gates WhatsOn already uses. When no draw is live, fall back to the next-starting draw with an honest 'Starts in N min' kicker instead of a utility filler; the strip's unit tests make this a safe pure-function change.

**Files:** src/lib/today/on-now.ts, src/components/today/OnNowStrip.tsx, src/lib/event-kind.ts

### [P0 (high)] [ux] /today

**What:** The What's On rail carries raw, untrusted-looking feed data on the front door: tile 2 is 'REBEKAH FOSTER Acoustic LIVE on Stage! Thursday 7/9/26 6:30PM' (shouting caps + the date AND time embedded in the title while the card prints '6:30 PM · Rockwell Brewery' below it), and the SAME show appears again later in the rail as 'Rebekah Foster Acoustic LIVE · 12:00 PM · Free' — a cross-source duplicate with a suspicious noon timestamp, alongside a cluster of other bare '12:00 PM · Starting soon' rows with no venue (Battle of Monocacy, Freddie Long, Pickling).

**Fix:** Boundary-clean per CLAUDE.md: extend normalizeTitle in src/lib/events/normalize.ts to strip trailing embedded weekday/date/time fragments and de-shout all-caps titles; extend unifiedEvents dedupe to fuzzy-match same-day same-venue/artist across sources (prefer the row with a stated venue + non-default time). Remember to bump the unstable_cache key (ingested-series-vN) so the fix actually ships past the persisted cache.

**Files:** src/lib/events/normalize.ts, src/lib/loaders/unifiedEvents.ts

### [P0 (high)] [detail] /today

**What:** Today's specials wallet deck — the page's most tactile band — is unreadable at the lip: 4 of 6 card headlines truncate mid-thought ('Nightly AYCE Crabs special T…' hides 804px of text, 'Trivia Night every Thu…' hides 743px, 'Buffalo wing special, (eat-in …', 'Burger and a beer (or tots) s…'). Even the RAISED card's TOWN column clips 'Downtown Frede…' on a 390px viewport, and its body repeats the title verbatim as the first line.

**Fix:** Distill offers at the boundary, not render time: trimDay/stripHours in todaysDeals.ts already run but miss embedded day-lists ('…Tuesday, Wednesday, and Thursday from 3 PM') and parentheticals — strip those into the lip fact, keeping a short essence headline ('AYCE crabs', '$1 oysters'). In DealsWallet allow the sw-name lip to wrap to 2 lines, widen the TOWN column (or drop 'Downtown ' prefix), and skip the body line when it equals the title.

**Files:** src/lib/loaders/todaysDeals.ts, src/components/today/DealsWallet.tsx

### [P1 (medium)] [detail] /today

**What:** The standardized live-dot pulse renders as a muddy GRAY smudge that swallows adjacent text: .live-dot's halo box-shadow and ::before pulse ring use currentColor (inherited gray ink) while every call site colors only the dot core via background: var(--app-brand). Mid-pulse (visible ~70% of the 1.8s loop) a ~26px gray blob overlaps the 'L' of 'Live music tonight' and the 'On now, near you' header — screenshots caught it on every load.

**Fix:** Match the .pulse-dot pattern that already does this right: change .live-dot::before to background: inherit and derive the halo box-shadow from the same background (or set color: var(--app-brand) on the dot spans). Then add a touch more clearance (gap-2 or margin-right) so the vermilion ring breathes without crossing the first glyph.

**Files:** src/app/globals.css, src/components/now/RightNowBand.tsx, src/components/today/OnNowStrip.tsx

### [P1 (medium)] [ux] /today

**What:** The What's On rail is unbounded: ~20 tiles × 280px ≈ 5,600px of sideways scroll, and the tail is library programming (Build and Play, School Skills, ESL Conversation Classes, Caregiver Support Group) rendered in the same photo-draw-card language as tonight's headline acts — the field-guide hierarchy flattens and the 'See all' door goes unused.

**Fix:** Cap the rail at 8–10 draws and close it with an end-cap stub tile ('+12 more today →' into /events) — the wallet-stub language already exists. Routine recurring library programs (already sorted last by compareForLead) belong in the quiet 'Also today' one-liners, not the rail; widen the isUtilityEvent/lead-rank gate or add a 'routine program' classifier at the boundary.

**Files:** src/app/(app)/today/page.tsx, src/lib/events/lead-rank.ts, src/lib/event-kind.ts

### [P1 (medium)] [ux] /today

**What:** One live fact renders three times on one page: the Everedy Square & Shab Row market appears as an OnNowStrip chip (top), as the 'MARKET TODAY' cell inside the CravingStrip grid, AND as OnNowBand's 'Farmers market today:' line; Bentztown's happy hour appears twice (strip chip + the Happy hour card). The top strip is a miniature of the band below it, so the live layer speaks twice and the page reads longer than its information.

**Fix:** Make the strip a teaser, not a duplicate: pass the strip's chosen chips down (or share the selector) so OnNowBand suppresses the line/card already chipped up top — or have strip chips anchor-link to #on-now so the fact lives once with two doors. CravingStrip's market cell should yield when the strip already carries the market.

**Files:** src/components/today/OnNowStrip.tsx, src/components/today/OnNowBand.tsx, src/components/now/CravingStrip.tsx

### [P1 (medium)] [speed] /today

**What:** Landing on /today silently downloads the two heaviest routes in the app: the bottom-nav Links auto-prefetch the full /map (998 KB decoded) and /events (698 KB decoded) RSC payloads, plus the sky-teaser link prefetches its event page (107 KB) — ~1.8 MB of deferred-page data (measured via performance.resourceTiming; brotli shrinks the wire but the fetch + parse cost lands on every first visit) competing with the page's own Suspense streams on cellular. The HTML document itself is 664 KB decoded.

**Fix:** Set prefetch={false} on the Map and Events tabs in BottomNav (tab taps are deliberate; the 120ms SPA nav I measured came from the router cache, which a tap-time fetch still fills fast), or defer prefetch to first idle after the page's own streams settle. Audit why the /today document is 664 KB — the inline RSC payload duplicating the full event list twice (HTML + payload) is the likely driver.

**Files:** src/components/nav/BottomNav.tsx, src/components/nav/tabs.ts

### [P1 (medium)] [speed] /today

**What:** The route-transition skeleton is shaped like a page that no longer exists: loading.tsx paints a 72svh FULL-BLEED sky gradient with a centered temp glance and a 3-col mood-tile grid, but the shipped page is a compact sky CARD sitting under a welcome line and an alert slot. When the boundary does show (cold ISR miss, slow network — prefetched tab hops skip it), the whole first screen flashes a dark-blue field then snaps to the compact cream layout, a full-viewport false paint.

**Fix:** Reshape TodayLoading to the current spine: alert-slot ghost, two-line welcome text ghost, a ~220px rounded sky-card block (reuse currentSkyPalette tint inside the card, not full-bleed), masthead line, then the craving-grid ghosts. Height parity with the real bands is what makes the cross-fade read as 'the page arriving' instead of a layout swap.

**Files:** src/app/(app)/today/loading.tsx, src/app/(app)/today/page.tsx

### [P1 (medium)] [detail] /today

**What:** Craving-grid papercuts on every 390px phone: the 'Wellness & stay' tile label NEVER fits ('Wellness …', 20px clipped — a permanent ellipsis in primary nav), the 7-tile grid strands 'Get around' as a half-row orphan with an empty slot beside it, and the What's On plate's 'See all' link is a 54×16px tap target with no .tap-44 extender (app norm is ≥44px effective; the food chips beneath the lunch hero are 37px tall too).

**Fix:** Rename the tile to 'Wellness' or 'Stay & spa' (verb-first, fits), or drop the label to 13px with tighter tracking; give 'Get around' a full-width row treatment (it already reads as a different species from cravings); add tap-44 to DismissibleSection's cta Link (line ~70) and the craving chips.

**Files:** src/components/now/CravingStrip.tsx, src/data/cravings.ts, src/components/today/DismissibleSection.tsx

### [P1 (medium)] [delight] /today

**What:** The specials wallet deck — the page's signature material moment — just sits there fully fanned on scroll, while its Explore sibling (PR #1016) earned a fan-in entrance. The deck shares the .sw-* card language but not the arrival: no tuck-to-fan, no stagger, and the '6 verified specials' tally is static text.

**Fix:** Reuse the Explore deck's fan-in on first scroll-into-view: IntersectionObserver fires once, cards deal from a tucked stack with ~40ms stagger (transform-only, prefers-reduced-motion holds the fanned state), and the mono tally in the dossier masthead counts up 0→6 in the same beat. One system with Saved/Explore, and it lands on the exact band users should linger on — the verified deals.

**Files:** src/components/today/DealsWallet.tsx, src/components/today/TodaysDealsStack.tsx, src/components/nav/ExploreDeck.tsx
