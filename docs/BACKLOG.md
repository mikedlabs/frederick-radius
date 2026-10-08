# Backlog

Living. The locks in this file were reviewed on 2026-10-08. Most other items
date from the June 2026 structure pass and have not been re-checked since, so
verify an item against the code before you build it.

**The lock rule.** Every "do NOT" in this file names its owner, its date and
the condition that lifts it. A lock without those three is a note, not a
lock. When a later owner direction overrides a lock, mark it LIFTED or
SUPERSEDED with the date and the decision instead of deleting it. Current
owner direction lives in `CLAUDE.md` and `docs/VISUAL_FIRST.md`, and they win
over anything here.

The shipped June 2026 sections (trust polish, the UI hygiene pass and the
20-user simulation brief) moved to
`docs/archive/2026-06/BACKLOG-shipped-2026-06.md` on 2026-10-08.

## Carried over from archived reviews (2026-10-08)

These items were still open when their source docs were archived. Each line
names its source, now under `docs/archive/2026-07/`, and its status on
2026-10-08.

- [ ] **PARTIAL · Type-scale adoption** (EXPERIENCE_REVIEW, July 2026).
      `npm run lint:type-scale` blocks growth file by file, but its baseline
      still holds the old debt: on 2026-10-08 `node scripts/check-type-scale.mjs`
      reported 3,230 bracketed text sizes and 531 sizes below the 11 px
      caption. Burn the baseline down one surface at a time.
- [ ] **OPEN · Weight rule** (EXPERIENCE_REVIEW). The rule in
      `src/app/globals.css` is 500 for labels and chips, 600 for titles and
      700 for numerals only. On 2026-10-08
      `grep -rho "font-semibold" src --include=*.tsx | wc -l` counted 1,597
      (the July review counted 841), against 260 for `font-medium`.
- [ ] **OPEN · EmptyState adoption** (EXPERIENCE_REVIEW). Only 5 shipping
      files import `@/components/ui/EmptyState` on 2026-10-08
      (`grep -rlE 'from "@/components/ui/EmptyState"' src --include=*.tsx | grep -vE '\.(spec|stories)\.tsx$' | wc -l`).
      Bare one-line empties remain, for example the dashed box in
      `src/components/happy/HappyHourBrowser.tsx`.
- [ ] **OPEN, not re-measured · /events peek-card overflow** (MOBILE_AUDIT,
      July 2026). A 397 px grid track sat inside a 358 px container at 390 px.
      The explorer has changed since, so re-measure before fixing.
- [ ] **NOT RE-CHECKED · Feed titles with embedded dates and cross-source
      duplicates** (MOBILE_AUDIT). Same family as T3a below. Fix at the
      boundary in `src/lib/events/normalize.ts` and bump the cache key.
- [ ] **OPEN · /report chip selection** (DESIGN-POLISH §3, item 5). Category
      and subtype chips in `src/app/report/ReportClient.tsx` show the selected
      state by border and tint only; `aria-pressed` is set. The other §3 items
      were not re-checked one by one.
- [ ] **OPEN · UX-08 one list contract** (UX_REDESIGN_2026-07).
      `src/components/happy/HappyHourBrowser.tsx` and
      `src/components/deals/DealsBrowser.tsx` still have no PlaceIndex rows.
- [ ] **OPEN · UX-14 saved plans** (UX_REDESIGN_2026-07). No plans store
      exists (`usePlans` and `fr:plans:v1` are absent). UX-23 plan templates
      and UX-24 plan sync wait on it.
- [ ] **PARTIAL · UX-20 keep last good** (UX_REDESIGN_2026-07). Event sources
      serve their last good payload through
      `src/lib/integrations/event-source-circuit.ts`. The /pulse sources still
      fall back to empty or "unavailable" on a timeout (`withTimeout` and
      `withTimeoutStatus` in `src/app/(app)/pulse/page.tsx`) instead of a last
      good payload, and no component reads the `servedStale` flag to show an
      "as of" time.
- [ ] **OPEN · UX-22 recommendation feedback** (UX_REDESIGN_2026-07). No
      "More like this" or "Not for me" control exists.

Checked and already done, so do not redo them: Today's after-9 PM state and
the event "Getting there" block (EXPERIENCE_REVIEW), and the Today skeleton,
the live-dot fix and the duplicate live fact (MOBILE_AUDIT). The archived
files carry a dated status line on each.

## 🔴 Production audit (2026-06-06) — SEO + data integrity (HIGH PRIORITY)
Live-prod audit of frederickradius.app. Work **P0 first** (indexing is broken;
highest-leverage; independent). Constraints: ~~**do NOT change robots.txt**
(the AI-crawler block is deliberate)~~ **LIFTED by 2026-08-05:**
`src/app/robots.ts` now allows the answer-engine agents and keeps only the
training-crawler block, with the reason in its comment. Items marked **DECISION** need Mike's call —
do not guess; ask, or ship behind an off flag. Prod `curl` acceptance checks
run after deploy (can't hit prod from the sandbox); I verify code-level + local.

**P0 — indexing (confirmed in code):** ✅ shipped #440 (see "Trust polish shipped").
- [x] **T1 — every page emits the homepage canonical.** `layout.tsx:77`
      `alternates: { canonical: "/" }`; child routes don't override → all of
      `/events`, `/map`, `/m/<town>`, `/events/<slug>` claim the homepage as
      canonical, collapsing indexing. Fix: drop the fixed root canonical; each
      indexable route's `generateMetadata` returns `alternates.canonical` =
      self URL (a `canonical(path)` helper so authors can't forget). Redirecting
      / noindex pages need none.
- [x] **T2 — sitemap lists redirects + omits content.** `sitemap.ts:13,16`
      lists `/now` + `/radius` (308s); towns partial, no `/events/<slug>` window
      from data; single build `lastmod`. Fix: generate from the route table +
      data (all town slugs, event slugs for open+next-60-days), canonical
      destinations only, real `lastmod`.

**P1 — data integrity / credibility:**
- [ ] **T3a** cross-source event dedupe (normalized title + start + venue/coords;
      keep both source links). "Fire & Rescue" vs "Fire and Rescue" twice.
- [ ] **T3b** trim/sanitize event descriptions at ingestion → `summary` field
      (first sentence, strip HTML); full body only on detail; redact meeting
      IDs/passcodes/dial-ins (a Parks&Rec Teams passcode is exposed).
- [x] **T3c/T5** decode HTML entities (`C&amp;O`, `&bull;`) — DONE #441 via
      `cleanFeedText` (named-entity map + residual guard; `C&O`/`AT&T` untouched).
- [x] **T3d — DECISION resolved → DONE #443.** civic-ops/service notices (bulk
      trash, yard waste, closures) now lane into "Town reminders"; boards/
      commissions/hearings into "Civic meetings". Classified, not deleted.
- [x] **T3e — DECISION resolved → DONE #443.** Owner: suppress. Cancelled/
      postponed events (status or title) are excluded from the upcoming flow.
- [ ] **T3f** reconcile section counts with rendered list ("Today 12" / "Show
      all 11") — derive count from the same deduped array.
- [ ] **T4 — DECISION (weights):** `/m/frederick` "Worth your time" (Most loved)
      is dominated by personal-service businesses (review-count signal), not
      breweries/arts the copy promises. Add category weighting (favor
      destinations; down-weight individual practitioners) + editorial pin for
      flagship towns. NOTE: this is the same "belongs ≠ recommend" disease #436
      fixed for institutions — extend the eligibility/ranking layer.
- [ ] **T6** JSON-LD (none on site): `Event` on `/events/<slug>` (+ `eventStatus`
      EventCancelled for T3e), `City`/`Place` + `BreadcrumbList` on `/m/<town>`,
      `ItemList` on `/events` + `/collections`. Validate via Rich Results.

**P2 — perf / security / polish:**
- [ ] **T7** JS payload (~630KB /guide, ~655KB /map) — measure `next build`
      first-load + Lighthouse, lazy-load Mapbox via dynamic import gated on map
      view, find a heavy client dep to split. *(Mapbox is already dynamic
      ssr:false — verify it's gated on the map mount.)*
- [ ] **T8** `/api/og` cache-control is `max-age=0` → set long cache + version key.
- [ ] **T9** add CSP (Report-Only first → enforce): self, Mapbox, Google Places,
      Supabase, Vercel Blob, Plausible, Vercel insights; nonces for inline.
- [ ] **T10** copy/minor: "panable"→"pannable" (/map meta); **DECISION** "Furmont
      Days" (Thurmont source typo? don't feature a misspelled hero); /events meta
      "Frederick Keys" vs feed "Flying Cows"; 404 emits conflicting noindex +
      index,follow (keep noindex only); optional root `/`→/guide 307→308.

## 🔴 Production audit #2 (2026-06-06) — event/geo/news trust + a11y
Second live audit. **Principle: Radius should never act certain when the data
is only approximate** — applies to events, map distance, news, recommendations.
Same disease as #436 (belongs-to-feed ≠ should-be-promoted), now for events/geo.

- [x] **P0 — Event eligibility/trust pass (DONE #443).** `lib/events/classify.ts`
      lanes the unified feed once: **What's on = public only**, **Civic meetings**
      (boards/commissions/hearings/council sessions), **Town reminders** (trash/
      yard waste/curbside/closures), with **private rentals + cancelled
      suppressed**. Title-only, word-boundary, conservative `public` default;
      validated against the live feed (zero real events mislaned) + 6 unit tests.
      Replaced the old `isCivicEvent` filter (which couldn't catch county-feed
      rows — their category is blank). The #436 eligibility pattern, for events.
- [ ] **P1 — Geo confidence.** Map "Happening within reach" shows events "113 ft
      away" when the geocode is just "Frederick" (vague). Add a confidence tier:
      exact_address · venue_match · municipality_only · county_only · unknown.
      Only exact_address + venue_match qualify for "within reach"/"near you";
      weak geocodes still list in Events but never in proximity modules. "Near
      me" is a promise — don't show wrong distances.
- [x] **P2 — Entity decode (DONE #441).** cleanFeedText named entities +
      residual guard. Deploys with the rest; prod still showed `&bull;` only
      because it hadn't merged.
- [ ] **P3 — Pulse news relevance.** Today's rail is fixed (#438) but `/pulse`
      still shows loose Google News (MoCo, statewide politics, obituaries).
      Split: local-official · local-reported · regional-mention · low-utility/
      obituary/generic → hide low-utility or put behind "More news". (Pulse may
      net wider than Today, but still needs editorial rules.)
- [ ] **P4 — Duplicate nav a11y.** Responsive nav renders twice in the DOM
      across guide/today/events/map/collections/pulse. Ensure the inactive nav
      is `aria-hidden`/visibility-hidden so screen readers + crawlers read ONE
      semantic nav, not two.
- [ ] **P5 — Family restructure (intent subsections).** Filtering helped, but
      Family needs lanes: Things to do with kids · Rainy-day/indoor · Parks &
      play · Classes & creative · Family services/schools. Everything wears one
      "Family" jacket; separate by intent. (Sub-bug "Looks like Family → Spinners
      ×6" FIXED #442.)

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
Owner directive (June 2026), updated: **#433 /map → UI hygiene foundation →
20-user simulation audit → category pages (coffee) → events.** One clean step
at a time — do NOT start the next step until the current one is merged.
**SUPERSEDED 2026-10-07:** the build sequence is now the "Build order" in
`docs/VISUAL_FIRST.md` (owner direction, 2026-10-07), so this June order no
longer gates new work. UI
hygiene was inserted before coffee/events on purpose: every new surface built
before it inherits the same uncoordinated overlay/z-index problem (see "UI
cleanliness" below). The simulation audit was inserted before coffee so we
see what we're missing **before** locking the next major page patterns.

### Pass 2.5: UI hygiene foundation (shipped)
Shipped as #434. The layer scale lives in `docs/Z_INDEX.md` and `npm run lint:zindex`
guards it. The full brief moved to `docs/archive/2026-06/BACKLOG-shipped-2026-06.md`.
Its boxes were never ticked in this file. The map overlay collision item is
still tracked under "UI cleanliness" below and has not been re-checked.

### Pass 2.75: 20-user simulation audit (done)
The report is `docs/audits/2026-06-simulation-20-users.md`. The brief moved to
`docs/archive/2026-06/BACKLOG-shipped-2026-06.md`, and its owner standard moved to
`docs/PRODUCT_QUALITY_BAR.md`.

### Pass 3 — category pages, starting with COFFEE (pattern page)
Goal: *stop making categories feel like directories; make them feel like
guided local choices.* Use **coffee** as the single pattern page — do NOT
build a giant category system yet. Decision facets **confirmed by the
simulation** (users 2/12/13 — directory feel is the proven gap):
- coffee briefing (a short editorial intro, not a count)
- best matches first
- open now
- local favorites
- good for sitting / work
- with food
- nearby
- full browse below (the directory, demoted under the guided sections)

**NEW RULE (owner, June 2026) — coffee is not "make the page nicer."**
Coffee must **prove the category system can rank from the user's context, not
downtown by default.** Today `/category/[slug]` ranks from the `fr_home_muni`
cookie but **silently falls back to `FREDERICK_CENTER`** when it's unset — so a
first-time Thurmont user gets downtown picks with no explanation. Coffee has to
demonstrate the fix:
- If a town/location is known → rank from it + show "Ranked from {town}".
- If NOT known → either **ask/set a town** inline, or be **transparent**:
  "Using Downtown Frederick as the default center." Never silently downtown-bias.
- This is the difference between a cleanup pass and a real product leap, and it
  makes coffee the pattern for context-aware ranking across ALL categories.
- Sev: **High** · Surfaces: category (all), feeds map/today/radius origin ·
  When: **during coffee** · Type: [G] (the fallback is in code) + [P].

### Pass 4 — events — AUDITED, MOSTLY COMPLETE ✅ (do NOT rebuild)
Audit (June 2026) verdict: the "firehose" label is **stale**. `/events` is
already tiered and trustworthy — the `/radius` outcome. Confirmed against the
code/data:
- ✅ Tiered + answer-first: Today (hero + "why it matters" + rail) → This
  weekend (grouped by vibe) → Later (collapsed) → Browse/Explorer (collapsed)
  → Civic (collapsed). First screen answers "tonight/this weekend?".
- ✅ Civic fully separated: `isCivicEvent` strips civic from the feed (0 civic
  in the upcoming set); municipal calendar is its own collapsed section.
- ✅ Descriptions capped: `line-clamp-2` everywhere + first-sentence "why it
  matters" ≤150 chars. No walls of text in browse.
- ✅ Recurring/low-relevance handled: `collapseRecurringEvents` folds weekly
  RRULE shows; non-event venue open-status entries dropped.
- ✅ Cancelled/stale: `deriveEventStatus` → red/amber badges + line-through;
  past events filtered out.
- ✅ Free / Family / Live music are data-backed (`is_free` + `category`), with
  one-tap chips already in the Explorer.
- ✅ Event detail intact + excellent: "Eat & drink before", "Parking nearby"
  (1.5km cap), same-venue future events, weather at start.

**Do NOT do an events structure pass.** Narrow real gaps only:
- [ ] **Feed reliability = the #1 "feels useful" lever, but it's DATA/OPS, not
      a UI pass.** `eventsLive` returns ~2; page leans on ~28 seed events
      because Hood is dead (HTTP 410) and Celebrate/County fail in the worker
      (issues #383–#423). Fix in the data cluster: repair Hood URL, Celebrate/
      County parser, owner-set Ticketmaster/Eventbrite keys. Sev: **High** ·
      Type: [G].
- [ ] **(Optional small polish) Lift the human lenses higher.** The Live music
      / Free / Family / Tonight / Weekend chips exist but sit inside the
      *collapsed* "Browse & search" Explorer. A compact intent row above the
      tiers, deep-linking the EXISTING lenses (reuse, ~1 component), would make
      the page answer by intent without expanding Browse. Sev: Med · Type: [P].
      Only if the owner wants it — not required.
- [ ] **Live-feed facet reliability (minor data note):** for live (not curated)
      events, `category`/`is_free` are keyword/default guesses; tighten as feeds
      recover so Free/Family/Live-music stay trustworthy. Sev: Low · Type: [G].
- [ ] **Downtown-defaulted** (24/28 upcoming are Frederick) — same county-wide
      posture as coffee; events are genuinely sparser in towns. Covered by the
      Cluster A posture work, not an events-specific fix.

---

## Simulation → tracked clusters (20-user audit, June 2026)
Full report: `docs/audits/2026-06-simulation-20-users.md`. Folded here as a
**small, sequenced** set — not 80 tickets. Each item: severity · surfaces ·
when · type ([G] code/data · [P] product judgment · [D] needs device QA).

**The sharper diagnosis (owner):** the real problem is **downtown posture +
data trust**, not just "coffee & events need cleanup." When the app lacks user
context it treats **downtown Frederick as the default center of gravity** — which
breaks the county-wide brand promise for Brunswick / Thurmont / Middletown /
Walkersville / Woodsboro. This cluster is tracked **alongside** coffee/events;
do NOT start implementing it yet unless it directly supports coffee (the
context-ranking rule above does). **LIFTED by 2026-08-05:** the shared scope in
`src/lib/scope.ts` and the header location control now give surfaces an
explicit Near me, Whole county or town scope (CLAUDE.md, "Locked
architecture"). The Cluster A items below are still worth checking one by one.

### Cluster A0 — Recommendation quality / eligibility 🔴🔴 (TOP — June-5 live audit)
**The spine of the next phase.** The owner principle that framed it ("show the
RIGHT thing first, then let people dig") now lives in
`docs/PRODUCT_QUALITY_BAR.md`. This is editorial strictness, NOT new features.

Evidence (live, June 5): `/category/family` "Worth your time" leads with
**Maurice Arenas Guitar Academy, Hood College Admission Office, Lincoln
Elementary, Phoenix Recovery Academy, The Banner School** — 16 of 38 records
are schools/offices/institutions, not family outings. Root cause: these carry
`feature_score: 10.0` and ranking is feature-score-dominated; real attractions
(escape rooms, pinball, zoo, bowling) get buried.

- [ ] **Eligibility / `isBrowseWorthy` layer (do FIRST).** Deterministically
      exclude non-public-facing institution types from discovery/recommendation
      surfaces via Google `primary_type`: `primary_school`, `secondary_school`,
      `preschool`, `university`, `child_care_agency`, generic `school`, +
      admin/office types. CAUTION: `educational_institution` is mixed (Earth &
      Space Science Lab, Frederick Clay Studio are real attractions) → don't
      blanket-exclude; use a curated allow/deny for the ambiguous bucket.
      Extends `relevance.ts` (`isNonDiscoverable`). Type: data + code-light.
- [ ] **Stop trusting raw `feature_score`** as the dominant signal (schools at
      10.0). Roll the coffee `categoryScore` (normalized, context-aware) to the
      other category surfaces once eligibility is in. Type: code (reuse).
- [ ] **Category vs Intent vs Moment vs Confidence model** (owner's cleaner
      taxonomy): Category = what it is; Intent = why (with kids / date night /
      rainy day / free / walkable / live music / dog-friendly); Moment = when
      (now/tonight/weekend); Confidence = should Radius recommend it (curated /
      verified / owner / imported / low). Underpins search, map, cards, events,
      home. Big; design before building.
- [ ] **"Why this result"** on important cards (why am I seeing this · open? ·
      who says so · how far · next action). Primitives exist (SourceBadge /
      FreshnessChip / PlaceStatus) — make systematic, esp. dense cards.

## June 5 2026 — live-site strategic review (owner) → priority order
The product crossed from prototype to real shape; thesis is on screen. Next
phase = **trust, ranking, restraint, polish — not features.** "Do not expand
the interface until ranking + trust are tighter." **SUPERSEDED 2026-10-07** by
the owner's visual-first direction (CLAUDE.md, "Visual first", and the "Build
order" in `docs/VISUAL_FIRST.md`), which adds mini maps, the hours week chart
and the Events flyer rail on purpose. Pending owner call: confirm in one line
that this June lock and the "Do NOT yet" line below are lifted. Priorities:

**Do now:** 1) category/ranking quality, esp. Family (→ Cluster A0) · 2) reduce
Today density above the fold (answer-first → best moves → deep briefing) · 3)
audit duplicate nav for a11y/SEO · 4) upgrade Search into real "Ask Radius"
natural-language prompt cards · 5) "why this result" on cards (→ Cluster A0).
**Do next:** recommendation scoring · category/intent/moment/confidence split ·
better empty/low-confidence states · more visible town/municipality context ·
make event pages the model for place pages.
**Do NOT yet:** add random features / expand UI before ranking + trust tighten.
**SUPERSEDED 2026-10-07** by the same visual-first direction (see above).

### Live re-audit follow-ups (June, owner)
- [x] **Eligibility coverage hole — FOUND + FIXED (#437).** #436 gated only
      getCuratedPicks + category; Phoenix Recovery Academy still led Today's
      "Worth a look". Added `isRecommendable` to worth-a-look, now-picks
      (open-now + weekend bets), RightNow. Browse/admin/health stay unfiltered.
- [x] **Photo-twins — SHIPPED (#437).**
- [ ] **News feed relevance leak — High (brand).** "What's new in Frederick"
      surfaced MoCo Show, Maryland Matters statewide items (Montgomery County
      emissions, PG County council, statewide abortion fund). Either tighten the
      Frederick-County filter hard or pull the section until clean — bad local
      relevance hurts the brand fast. Source: `news.ts`/`local-news` +
      `LocalNewsStrip`. Type: data/filter. Likely quick.
- [ ] **Tighten Today choreography — Med.** Right ingredients, still reads
      dashboard-y. Target order: Ask Radius → Best move now → Tonight/Weekend →
      Practical → Full briefing. Less buffet, more "here's your move." (Extends
      the #432 ladder; sequencing, not new modules.)
- [ ] **"Why this result" systematic — Med.** Every promoted card should quietly
      justify itself (open now · 5-min walk · kid-friendly · free · official ·
      verified · rain plan · near Carroll Creek). Primitives exist
      (SourceBadge/FreshnessChip/place-reasons) — make consistent on promoted
      cards. The phrase "Worth your time" is a promise; this is what backs it.

### Cluster A — Downtown posture / county-wide default 🔴
The biggest hidden risk: claims county-wide, behaves downtown-first without
context. (Users 6,7,8,9,10,19 — 8 of 20.)
- [ ] Gentle **"set your town"** affordance when no location/home town exists.
      Sev: **High** · Surfaces: today, map, category, all · When: **starts in
      coffee** (context-ranking), broader rollout later · Type: [P].
- [ ] **Don't silently default to downtown.** Show "Ranked from {town}" or
      "Using Downtown Frederick as default" honestly. Sev: High · Surfaces:
      category, map · When: during coffee · Type: [G]+[P].
- [ ] Improve **no-location + cold-entry** states (map pinpoint-empty reads
      "blank"; ensure `/today` is the default entry, not `/map`/`/events`).
      Sev: High · Surfaces: map, today, events · When: later (not coffee) ·
      Type: [P]+[D].
- [ ] Make small towns **first-class starting points** (town discovery / index;
      precursor to GIS County View). Sev: High · Surfaces: town pages, nav ·
      When: later (GIS pilot) · Type: [P].

### Cluster B — Data trust / provenance 🔴
Trust leaks from data, not design. (Users 5,20 + cross-cutting.) **Audited June
2026 with live evidence — severities corrected below.**
- [ ] **Fix photo-twins — CONFIRMED High, do FIRST.** Authoritative `photo_names`
      check: **74 ChIJ clusters / 158 records (~10% of 1,540 photo'd places)**
      share a Google photo. Three causes: multi-tenant building photos
      (Brewer's Alley|Fountain Rock|Alley Wagon), wrong-photo on unrelated places
      (3 different Thurmont restaurants share one), and dup records (Rockwell ×2,
      Court St deck ×2). Surfaces: ALL place cards (today/map/radius/category/
      town/detail). Smallest safe fix: (a) fold true dupes in `places-dedup.json`;
      (b) deterministic shared-photo SUPPRESSION — keep the photo on one
      canonical record per ChIJ cluster, drop to category placeholder on the rest
      ("no photo" > "wrong photo"); (c) suppress junk records ("Best of Business
      Listings"). Type: **data + small pipeline rule** (no UI change). When: now.
- [ ] **Event feed cleanup — Medium (NOT the High outage previously assumed).**
      Live evidence: runtime `getLiveEvents(60)` = **77 events** (County 62,
      Celebrate 15); Celebrate + County HTTP 200 / valid. The page is well-fed.
      The daily-worker "not JSON" failures (#383+) are **false alarms** — those
      sources are iCal/RSS consumed at runtime, not JSON. Genuinely dead: **Hood
      (410)** + **DFP scrape URL (404)**, both contribute 0. Smallest safe fix:
      mark Celebrate/County runtime-only in `sources.yaml`/worker so they stop
      opening daily-failure issues; remove dead Hood + stale DFP scrape; (owner)
      set Ticketmaster/Eventbrite keys for additive coverage. Type: pipeline/
      config. When: after photo-twins.
- [ ] **Provenance on dense cards — Medium-low.** `SourceBadge`/`TrustChip`/
      `FreshnessChip`/`PlaceStatus`/`/trust` all exist; detail + lead cards carry
      trust, but `PlaceCard showSource` defaults OFF for row/tile/grid → map
      drawer, category sections, town lists show none. Optional: a compact source
      dot on dense cards. Lower value than fixing the wrong photos. Type: small
      code. When: after feeds / later polish.
- [x] **Municipality stamping — DONE (audited).** 1,649 places, **0 unstamped,
      0 off-bbox/needs-review**; every place valid + in-county. Downtown's 53.2%
      is real density (877), not a stamping error. No fix needed; GIS boundaries
      could refine edge cases later, but there's no leak. (Posture/downtown bias
      is Cluster A, a ranking matter — not a stamping one.)
- [ ] **De-emphasize weak/odd records** (feature-score-only ranking surfaces
      niche records — guitar studios/schools — over anchors). Sev: Med ·
      Surfaces: category, map, radius, today · When: during coffee (ranking) ·
      Type: [G]+[P].
- [ ] **Event feed reliability — the real "events" work (Sev: HIGH).** `/events`
      is audited & architecturally complete (see Pass 4); the actual problem is
      DATA/OPS: `eventsLive` returns ~2, so the page leans on ~28 seed events.
      Hood feed dead (HTTP 410), Celebrate + County failing in the worker
      (issues #383–#423). Repair Hood URL / Celebrate+County parser; track
      owner-set Ticketmaster/Eventbrite keys. This belongs to the data/pipeline
      cluster, NOT an events structure pass. Surfaces: events, town pages, today
      · Type: [G].
- [ ] **Live-feed facet confidence (Sev: Low):** for live (not curated) events,
      `category`/`is_free` are keyword/default guesses — keep documented, don't
      overstate in UI; improve as feeds recover. Type: [G].

### Optional — events intent-chip polish (DEFERRED, not trivial)
Audited verdict: NOT trivial, so skipped per owner's "skip if not trivial" bar.
Lifting Free/Family/Live-music chips above the fold would require force-opening
a localStorage-persisted collapsed Explorer + reconciling two param systems
(`lens` vs `cats`/`when`) — real dead-control risk. The lead tiers already
answer Tonight/Weekend. Revisit only if events gets a larger pass later. Sev:
Low · Type: [P].

### Cluster C — GIS pilot gating ⏸️ (do NOT implement yet)
Justified by the simulation; use GIS to solve **posture / orientation / trust**,
not as a layer dump. Full detail: `docs/GIS_FEASIBILITY.md` §4.
- County View **first** (top justified pilot — fixes the dominant small-town/
  orientation failure). · Type: [P].
- First Visit **second** (visitor sense-of-place). · Type: [P].
- Getting Around **third** (narrower; needs a live parking feed to matter). ·
  Type: [P].
- When: **after coffee + events**, gated on this audit (now satisfied).

**SUPERSEDED IN PART 2026-10-07:** County View shipped as `CountyOverviewMap`,
which leads /towns and /parks (commit 62cd05f5, recorded in
`docs/VISUAL_FIRST.md` under the owner's visual-first direction). Pending owner
call: confirm that the June "do NOT implement yet" gate is lifted for the
remaining GIS modes, First Visit and Getting Around.

### Cluster D — Device QA / future-proofing 🟡
- [ ] Confirm **post-#434 overlay behavior on a real device** (the z-index pass
      math is verified; on-device render isn't). Sev: Med · Surfaces: all
      overlays/map · When: anytime · Type: [D].
- [ ] Note the need for a **visual-regression / screenshot harness** later (no
      automated catch for stacking/overlap regressions today). Sev: Med ·
      When: later · Type: [P].
- [x] ~~Keep the **GitHub Actions runner block** visible as a process risk (CI
      trust rests on local runs until billing/runner is fixed).~~ **LIFTED by
      2026-08-19:** CI `verify` and `style-lint` run and are required on main
      (CLAUDE.md, "Verification norms").

---

## Pre-existing issues — tracked elsewhere, NOT yet scheduled
Carried over so the structure pass doesn't lose them. These are separate
from the page-by-page UI work above. Owner asked (June 2026) to make sure
none of these get forgotten.

### 🖼️ Wrong / shared photos on place cards (the "twins" issue)
User-reported: two cards showing the *same* thumbnail. Full audit in
`docs/audits/2026-05-27-dfp-photo-twins.md`; raw clusters in
`audit/photo-twins.json`. State: detector built, **15 true duplicates
folded** (May 27) — but **~37 clusters remain unresolved**:
- [ ] **22 MULTI_TENANT clusters** — different businesses sharing one
      building photo (e.g. 3 tenants at 112 E Patrick St). Records are
      correct; the shared photo is misleading. Fix = pick a distinct photo
      per record (upstream enrichment side). **This is the most visible
      "wrong photo on a card" symptom on /radius + /map.**
- [ ] **9 MAYBE_MULTI_TENANT_OR_DUPE** — need an editor to decide per
      cluster (some may be rebrands).
- [ ] **2 REVIEW + 1 WRONG_PHOTO** — genuine enrichment misapplications
      (same Google photo on unrelated records). Root cause: weak
      `resolveAndEnrich` matches cross-pollinating photos.
- [ ] Root-cause fix: add **photo-ChIJ extraction to the dedup pipeline**
      (same thumbnail = strong dup signal the name-Jaccard pass misses) and
      backfill real `ChIJ…` place IDs to replace the placeholder UUIDs.

### 🔁 Daily data-pipeline failures (open GitHub issues, automated)
7 sources fail the daily refresh (#383/#384/#387/#392/#397/#404/#423) and
show as stale (#74/#393): **mdot_chart, celebrate_frederick, hood_college
(HTTP 410), frederick_county_calendar, fcps_news (404), firstenergy_outages,
usgs_water (400).** Upstream feeds moved/closed or changed format. Triage per
`AGENTS.md` diagnose-failure; fix the source URL/parser or correct the
cadence in `data/sources.yaml`. NOTE: `celebrate_frederick` + `hood_college`
are the live event feeds — if they stay dead, /events coverage thins.

### 🧪 Stale prototype / mockup PRs to triage (open, not merged)
- [ ] **#422 `/reach`** — radius-as-gesture prototype.
- [ ] **#421 `/mock`** — premium-redesign mockups (predates the locked
      brand deck; likely superseded — confirm + close).
- [ ] **#420 `/fly`** — cinematic descent prototype.
- [x] ~~**#265** — Weinberg + Delaplaine event feeds, **inert** until
      `WEINBERG_CALENDAR_URL` / `DELAPLAINE_CALENDAR_URL` env vars point at
      real iCal URLs (venues don't expose one at the obvious paths).
      Decision: close, or chase the venues for a calendar URL.~~ Closed
      2026-10-08: neither env var exists in the code any more, and both
      venues already reach the unified event set. Delaplaine is read directly
      from its public iCal in `src/lib/integrations/ical-live.ts`. Weinberg
      Center and New Spire Arts come from the official Weinberg calendar
      through the venue-lineup ingest (`config/venue-sources.json`, method
      `"weinberg"`; `scripts/lib/weinberg-events.ts`, shipped in #1630).
      Neither venue needs an env var. Check with
      `grep -n '"method": "weinberg"' config/venue-sources.json`. PR #265
      itself was closed unmerged on 2026-08-01, so nothing is left to triage.

### 📋 AUDIT.md half-working / broken (carried from `docs/archive/2026-06/AUDIT.md`)
- [ ] `/business/manage/[token]` — email-the-token flow not firing (no SMTP).
- [ ] `/business/claim` + `/submit/*` — write to DB but no review queue;
      untested end-to-end on prod.
- [ ] Inert event feeds: Ticketmaster, Bandsintown (need API keys + curation).
- [ ] Image perf: some raw `<img>` for Google photos (not `next/image`).
- [ ] `/places` directory index — the one surface not on the post-overhaul
      card system.
- [ ] Editorial routes (`/parks` `/trails` `/transit` `/water` `/history`)
      under-surfaced from the main pages — the "connectedness" phase.
- [x] ~~NOTE: `AUDIT.md` route names predate the structure pass.~~ Closed
      2026-10-08: `AUDIT.md` was archived to `docs/archive/2026-06/AUDIT.md`
      instead of refreshed. The items above are the ones carried forward and
      have not been re-checked since June.

---

### 🧹 UI cleanliness — overlap, overlays, "stuff on top of each other" (NOT done)
Owner asked (June 2026) whether the messy/overlapping UI is finally cleaned
up. Honest answer: **no — this is a known, still-open systemic workstream**,
separate from the page-by-page structure pass. Full diagnosis in
`docs/DESIGN_UX_AUDIT.md`. The structure pass (/today #432, /map #433) is that
doc's **Phase 3** (surface re-layout); the *root causes* of the mess are its
**Phase 0–1** (foundation + primitives), which are largely **not done**:

- [ ] **No central z-index scale → overlays can collide.** z-index is
      hand-picked per component with no shared ladder. Several independent
      floating elements sit at the **same `z-40`** with no coordination:
      `InstallPrompt`, `PullToRefresh`, `FloatingPlanFab`, `BottomDrawer`
      backdrop — plus a jumble above them (`PlaceSheet`/`Sheet`/`SearchOverlay`/
      `SortDropdown` at z-50, `PhotoLightbox` z-[120], skip-link z-[100]).
      Same-level + uncoordinated is exactly how things stack wrong. **Fix:**
      a named z-scale token set (nav / sheet / overlay / toast / modal) adopted
      everywhere.
- [ ] **`DESIGN_UX_AUDIT.md` §7 (map) 🔴 still open:** "Road & alerts overlay
      covers UI; overlay z-order needs a pass." Direct match for "stuff
      overlaid on top of each other" on the map.
- [ ] **Overlay/sheet primitive sprawl:** `Sheet` · `BottomDrawer` ·
      `CollapsibleSection` · the map in-view drawer are independent
      implementations that don't know about each other → inconsistent
      stacking, focus, and dismiss behavior. **Fix:** one shared sheet/overlay
      primitive (audit recommends Radix under the existing skin).
- [ ] **Token non-adoption (the root cause per the audit):** ~20 ad-hoc
      `text-[Npx]` sizes (1,000+ uses), 359 raw hex, inline `style={{}}` in
      ~214 files, 3 button / 3 sheet / 5 chip variants. This drift is *why*
      surfaces look inconsistent; lint guards + token-as-utilities stop it
      recurring.
- [ ] **Verification gap:** overlap/overlay bugs are **visual** — they need
      eyes on a real device (the sandbox can't render Mapbox/live overlays).
      No screenshot/visual-QA harness is wired yet, so these can't be
      regression-caught automatically. **Until then, "is it clean?" requires a
      device walk-through, not a green test.**

## 💡 Content & editorial ideas (owner notes — June 2026)
Brainstorm capture, not scheduled. "Things people might want to know" —
the texture that makes it a local field guide, not just a directory.

- [ ] **Major routes / roads.** Surface the big arteries people actually
      orient by: **I-270, US-15, I-70, US-340, US-40, MD-26, MD-355, MD-85.**
      Could be a map overlay (label the corridors), a "getting around"
      explainer, and/or live conditions. NOTE: there's already an
      `mdot_chart` traffic source wired (currently failing — see the
      data-pipeline issues above), so live road conditions are partly
      scaffolded. Cross-ref `/transit`.
- [ ] **County / city stats.** A "Frederick by the numbers" surface —
      population, towns, area, founding date, elevation, etc. Some of this
      already exists per-town (`/m/[slug]` shows population); idea is a
      consolidated almanac-style stat block for the county + City of
      Frederick.
- [ ] **Famous people from here.** Notable Fredericktonians (e.g. Francis
      Scott Key, Barbara Fritchie, Roger B. Taney) — an editorial "who's
      from Frederick" piece. Verify each before publishing.
- [ ] **Movies / TV shot here.** Productions filmed in Frederick County —
      another "did you know" editorial angle. Verify filming locations.
- [ ] Natural home for the above: the editorial routes (`/history`,
      `/about`, or a new "almanac"/"did you know" surface). Reuse the
      field-guide voice; keep facts sourced. Lower priority than the
      structure pass + data fixes — these are enrichment, not plumbing.
