# Frederick Radius — Quality Review Master Report

*Multi-agent review · 12 angles · all findings against live production (`frederickradius.app`) + the codebase. Review-only; no changes made. Priorities: **P0** trust-breaking/broken journey · **P1** major UX friction · **P2** visual/polish · **P3** nice-to-have.*

---

## 1. Executive summary

The app's **architecture and design language are right** — the answer-first funnel, paper-chip `IconStamp` system, dense/native-fluid surfaces, the Map Control Sheet, and the 4-tier results all landed. Ask, Places (landing), Saved, Place detail, and Town now read **premium**.

But the review found a consistent, serious gap: **the data/ranking layer doesn't live up to the UI.** The premium shell is repeatedly handed the wrong content to show:

- **The single worst symptom — flagged by 3 separate agents — is the Events "Best next" hero leading with a private "Frederick Nonprofit Summit Planning Committee Leadership Luncheon," with raw scraped text leaking into the card.** The premium page's one answer is feed noise.
- **A one-line bug (`open_confidence` never set) silently kills the "verified hours" ranking signal for 1,309 of 1,644 places**, degrading *every* recommended surface.
- **Flat search bypasses the quality gate the rest of the app uses** — an "Office Only" B2B roaster ranks #4 for "coffee," and the county's most famous restaurant name ("Volt") returns wrong results.
- **The `local_favorite` flag is on 37% of all places** (the code itself calls it "meaningless") yet still drives a filter chip and a badge on nearly every card — flagged by 3 agents.
- **`/map` removes the entire app from the accessibility tree** for screen-reader users (P0 a11y), and **an install prompt physically blocks the map's primary "Use my location" button.**

**Theme:** the next level of quality is **less about pixels and more about trust** — gate what's shown (events, ranking, tags, search) so the premium UI is always pointed at a genuinely good answer.

---

## 2. Top 10 UX bottlenecks

| # | P | Bottleneck | Where |
|---|---|---|---|
| 1 | **P0** | Events "Best next" hero = a private committee luncheon + raw ingest text ("Event date:… Event Time:…") | `events/page.tsx:234` `heroEvent`, `EventCard` feature |
| 2 | **P0** | Install/A2HS prompt covers the Map's "Use my location" CTA (z-prompt 48 over the pill) — the one first action is un-tappable | install prompt component, `RadiusBuilder.tsx` |
| 3 | **P0** | Visitors standing downtown are silently flipped to "resident" view; the resulting banner covers place-detail Directions/Call buttons | `ModeBootstrap.tsx`, place sheet toast |
| 4 | **P0** | "Live music tonight" is broken everywhere — overlay labels a Jun 11–Aug 27 series "Happening tonight"; the Ask lens leads with a *closed winery* | `search.ts`, `FunnelFlow.tsx` (lens = static venue set) |
| 5 | **P1** | "2 hours downtown" plan is unreachable from the front door (`/plan` exists, isn't linked from `/guide`) | `FunnelFlow.tsx`, `plan/page.tsx` |
| 6 | **P1** | Map "Adjust" button is unclickable (sheet `z:20` sits under BottomNav `z:40`); only a hidden drag works | `MapControlSheet.tsx`, `globals.css` z-tokens |
| 7 | **P1** | Map utility row (Parking/Restrooms/Coffee/Events/Transit) links *away* instead of filtering the radius in place | `RadiusBuilder.tsx` ~L1042 |
| 8 | **P1** | Save-an-event needs 3 taps — the `glance` EventCard has no save affordance (the feeder to Saved is missing on its busiest surface) | `EventCard.tsx` glance variant |
| 9 | **P1** | Town "Search {town}…" pill goes to bare global search (no town scope) — the redesign's headline action drops you into the directory | `m/[municipality]/page.tsx:141` |
| 10 | **P2** | Cross-surface count contradictions: Today "1 this weekend" vs Events "14"; open-now "125" vs "12" | `today/page.tsx` `eventsForMode`, search surfaces |

---

## 3. Top 10 UI problems

| # | P | Problem | Where |
|---|---|---|---|
| 1 | **P0** | Today `CravingStrip` still uses saturated/glossy per-craving icons — the last island of the pre-`IconStamp` style, right under "Ask Radius anything." | `now/CravingStrip.tsx` |
| 2 | **P0** | Detail pages "lie": on a place/event page the **Map tab stays lit** and there's **no Back button** (routes resolve to a tab index, not a deep page) | `nav/tabs.ts`, `nav/TopBar.tsx` |
| 3 | **P1** | Today is a flat "dumped" stack of ~14 equal-weight cards with two competing eyebrow styles; no lead, nowhere for the eye to land | `today/*`, `Module.tsx` |
| 4 | **P1** | `/search` results = a 50-row directory wall (no Best-match lead/grouping) while `/category/*` does it right | `search/page.tsx` |
| 5 | **P1** | Triple-redundant funnel header: TopBar "EAT & DRINK" + eyebrow "EAT & DRINK" + h1 "Eat & drink" on one screen | `FunnelFlow.tsx:613` `Header`, `TopBar.tsx` |
| 6 | **P1** | Town pages mix 4 registers (editorial / events / municipal services / affiliate lodging) and can lead "Worth your time" with a wig shop / travel agency | `m/[municipality]/page.tsx` |
| 7 | **P2** | Map "Use my location" pill collides with the Control Sheet's top edge; "Adjust" partly clipped | `RadiusBuilder.tsx`, `map-component.tsx` |
| 8 | **P2** | Ask bento's bottom row + place-detail "GOOD TO KNOW" card tuck under the BottomNav (missing nav-height bottom padding) | `FunnelFlow.tsx`, place detail |
| 9 | **P2** | Map shows only ~3 markers for "485 places" at landing zoom (collision-thinning too aggressive inside the reach) | `RadiusMap.tsx` ~L590 |
| 10 | **P2** | Event detail body degrades below the fold into a dense run of identical small rows (no lead/secondary rhythm) | `event/*` |

**Components to standardize:** finish `IconStamp` adoption (kill `CravingStrip` glyphs); one `SectionHeading`/eyebrow (Today + Events ship two); a **detail-page deep-nav contract** (Back + no lit tab); a **card-tier scale** applied to Today/Event lists (the 4-tier results discipline isn't applied there).

---

## 4. Top 10 data-trust issues

| # | P | Issue | Example |
|---|---|---|---|
| 1 | **P0** | `open_confidence` never set in `decoratePlace` → "+verified hours" ranking term **dead for 1,309/1,644 places** despite 79.6% having Google hours | `loaders/places.ts:482` |
| 2 | **P0** | Past event detail renders live as "Confirmed," no ended-state | `/events/weinberg-summer-concert-2026-05-16` ("Punch Brothers", ended May 16) live on Jun 8 |
| 3 | **P0** | Event classifier leaks committee meetings + private rentals into the public feed *and* "This weekend" | "…Planning Committee…Luncheon", pavilion birthdays, family reunions, employee picnic |
| 4 | **P1** | `local_favorite` flag on **37% (610/1,644)** of places — meaningless, yet a filter chip + pervasive badge | 6 of 8 "Hidden gems" also wear it |
| 5 | **P1** | "Take the kids" / `family` category includes **18 schools/admin** (recovery academy, driving school, university, PTA) labeled "Kid-friendly" | `intents.ts` `FAMILY_CATS` |
| 6 | **P1** | 31 worship places (churches) are Tier-1 *recommendable* — can lead "best match" | `quality/readiness.ts` (no destination-category demotion) |
| 7 | **P1** | `dog-friendly` & `family` tags are blanket-inferred, never verified per-place; only 13.7% of places have any tags | bars/breweries tagged `family` |
| 8 | **P1** | Restroom data = ~7 points county-wide; parking = 1 row → "restroom/parking nearby" unanswerable for ~94% of parks | Baker Park shows only "Dogs OK" |
| 9 | **P2** | Templated blurbs ("Wellness in Downtown Frederick." ×23) read as editorial *and* earn quality credit | `placeQuality.ts:25` (`copy-quality.ts` exists, unwired) |
| 10 | **P2** | 93 places sit 8–16 km from their assigned town centroid but the town page implies proximity | `loew-vineyards-mount-airy` (11.4 km) |

*Latent:* event seed-anchor (`events.ts:84`) is hardcoded to 2026-05-14 — honest today, silently stale later.

---

## 5. Top 10 click-reduction opportunities

*(all are smarter defaults / deep-links / restoring one affordance — none adds a filter)*

| Journey | Current | Ideal | Fix |
|---|---|---|---|
| Map nearby coffee | 3 | 2 | map quick "Coffee" chip → `?mode=browse&intent=coffee` (pins, stay on map) not `/category/coffee` |
| Save an event | 3 | 2 | restore save icon on the `glance` EventCard |
| Restroom | 3+type | 2 | add "restroom"/"parking" to `/search` suggestion chips |
| Live music this weekend | 2 (weak) | 2 (good) | category chips filter the visible list in place + respect weekend context |
| Explore Brunswick | 2 | 1 | make the front-door town-card named towns tappable `/m/<slug>` chips |
| Parking | 2 | 1 | surface Parking from `/search` chips (it's buried under "More") |
| Walkable food | 2+OS prompt | 1 | offer location at the Eat tile; pre-show a "Walkable" affordance |
| "2 hours downtown" | ∞ (unlinked) | 1–2 | a "Plan my time" entry on `/guide` → existing `/plan` presets |
| Event tonight | 1 (wrong) | 1 | day-aware hero: "Tonight" when there's something today, honest "Next up" otherwise |
| Civic meeting | 2–3 | 2 | civic section expanded-by-default when arrived via `#civic-meetings` |

---

## 6. Broken or confusing journeys

- **"Something happening tonight"** (visitor + resident): hero is a committee luncheon; "live music tonight" surfaces a future series labeled "tonight" and a closed winery.
- **"2 hours downtown"** (visitor): the perfect tool (`/plan`) is unreachable from the front door.
- **Search a famous place** ("Volt"): wrong substring matches, typo dead-ends, no quality gate.
- **Save an event**: impossible from the browse list — must open detail first; and once saved, events don't sync (places do) → silent cross-device loss.
- **Map first action** (`/map`): the "Use my location" CTA is covered by an install prompt; "Adjust" is unclickable.
- **Screen-reader on Map**: the whole app is `aria-hidden`; the user can't leave the controls sheet.

---

## 7. Pages that still feel too directory-like / low-end

- **`/search`** — the highest-intent surface, still a flat row wall (the `/places` redesign fixed the landing, not this).
- **Today** — a dumped stack of ~14 equal-weight cards; the busy daily-return page.
- **`/towns`** index — population-ranked list with "No events this week" on 12/13 towns.
- **Event detail** (below the fold) — dense uniform rows.
- **`/events/calendar`** — an unfiltered 335-event month dump (civic + dupes interleaved).

## 8. Pages that now feel premium

- **Ask `/guide`** (bento + IconStamp) — the best screen in the app.
- **Places `/places`** landing — question-led, lanes, demoted directory. ✓
- **Saved `/my-radius`** — field-guide plate header, frosted doorways, guided empty state.
- **Place detail** — editorial hero, single clear Save CTA.
- **Town detail** — photo hero + serif name + coordinate hairline (field-guide). *(caveat: the search pill + thin-town padding bugs in §2/§4.)*

---

## 9. Fast wins (low-risk, high-impact)

1. **Set `open_confidence` from `hours_source` in `decoratePlace`** — one line, reconnects 1,309 places to ranking + trust labels. **(P0)**
2. **Quality-gate the Events hero + strip raw ingest text** — exclude civic/meeting/rental categories from "Best next"; render only parsed fields. **(P0)**
3. **Swap brand-as-text to `--app-brand-press`** — the AA-compliant red already exists; fixes the active-nav label + ~46 link usages at once. **(P1 a11y)**
4. **Route `CravingStrip` icons through `IconStamp`** — kills the last saturated-icon island. **(P0 UI consistency)**
5. **Raise the Map Control Sheet above the BottomNav** (z-index) — makes "Adjust" clickable. **(P1)**
6. **Gate the install prompt off `/map`** — unblocks the locate CTA. **(P0)**
7. **Remove the `local_favorite` filter chip + badge** until the flag is re-derived to a real ~5–10%. **(P1)**
8. **Restore the save icon on the `glance` EventCard**; **scope the Town search pill** to `?m={slug}`. **(P1)**

## 10. Bigger redesign opportunities

- **Detail-page deep-nav contract** (`tabs.ts` + `TopBar.tsx`): Back button, no lit tab — standardize for `/places/*` + `/events/*`.
- **Extend the `ResultBlock` 4-tier pattern to `/search`** + add quality gate + word-boundary/fuzzy matching (reuse `recommendationTier`/`placeQuality` — already built).
- **Today re-architecture**: one lead card + a demoted secondary tier; collapse Parking/Transit into "Getting around."
- **Make Map utility row filter the radius in place** (chips, not links) using the already-computed `insideAmenities`/`eventsInReach`.
- **Event-first "Live music"**: lead with tonight/weekend shows (dedupe recurring series), venues secondary.
- **Family data model**: add `setting: indoor|outdoor`, `has_restroom`/`has_parking`, `kid_age`, trail `difficulty`; gate "With kids" off categories not 2%-coverage tags.
- **`/map` a11y re-architecture**: render the controls sheet as a non-dialog landmark so it stops `aria-hidden`-ing the app.

---

## 11. Recommended PR order

**Wave 1 — P0 trust/safety (small, surgical, do first):**
1. `open_confidence` one-line fix + unit test (`loaders/places.ts`).
2. Events hero quality-gate + ingest-text sanitize (`events/page.tsx`, classifier `classify.ts`).
3. Past-event detail guard ("ended" state) + date-filter `eventsAtVenue()` + purge 8 past rows (`events/[slug]/page.tsx`, `events.ts`).
4. `/map`: gate install prompt off the route + raise sheet z-index above nav (`globals.css`, install prompt, `MapControlSheet.tsx`).
5. `/map` a11y: stop `aria-hidden`-ing the app + add `Drawer.Title` (`MapControlSheet.tsx`).

**Wave 2 — P1 ranking & search quality (shared logic):**
6. Quality-gate flat search + word-boundary + exact-name boost (+ later fuzzy) (`search.ts`); extend `ResultBlock` to `/search`.
7. Destination-category demotion in `recommendationTier` (worship/wellness) (`readiness.ts`).
8. Retire the `local_favorite` filter chip/badge; stop prose credit for templated blurbs (`FunnelFlow.tsx`, `placeQuality.ts`).
9. Restore `glance` EventCard save + unify event saving with sync (`EventCard.tsx`, `SaveButton.tsx`).
10. Scope Town search pill `?m={slug}`; radius-cap "Worth your time"; surface `m.description` (`m/[municipality]/page.tsx`).

**Wave 3 — P1/P2 UI consistency & clicks (shared-component fixes):**
11. Brand-as-text → `--app-brand-press` (a11y contrast, app-wide token swap).
12. `CravingStrip` → `IconStamp`; one `SectionHeading`; detail-page deep-nav contract (`tabs.ts`, `TopBar.tsx`).
13. Click-cuts batch: map quick-chip deep-links, tappable town chips, `/search` amenity suggestion chips, day-aware Events hero.
14. Touch-target pass (SaveButton/PulseIndicator/month-arrows/chips → 44px).

**Wave 4 — P2/P3 polish:**
15. Today hierarchy re-architecture; Event-detail rhythm; nav-height bottom padding; reconcile cross-surface counts; map marker density at landing zoom.

*Rule honored throughout: each fix makes the user find the right thing faster, and makes the screen calmer/clearer/more premium — none adds a new overlay, filter, or design system.*
