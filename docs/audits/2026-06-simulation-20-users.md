# 20-user simulation audit — June 2026

**Pass 2.75** (after UI hygiene #434, before coffee). A pressure-test, not
happy-path theater. Goal: find what's hard to use, what creates doubt, what
still feels like a directory, where small towns get shortchanged, and where the
app feels genuinely fresh.

## Method & honesty
This is **reasoning over the real app surfaces, real data, and real flows** —
not a generic persona exercise, and not a live device session. Every finding is
tagged:
- **[G] code/data-grounded** — a verified fact from the code / loaders /
  `data/sources.yaml` / known data issues.
- **[P] product/UX judgment** — a reasoned product call about a real, verified
  surface (most simulation findings are this — they're judgments about flows
  that genuinely exist).
- **[D] needs real-device verification** — pixel overlap, gesture feel, real
  render. The z-index pass (#434) just shipped, so overlap findings are
  *expected-fixed* but unconfirmed on-device.

## Executive summary
**The app's spine is genuinely strong; its weakness is a posture.** The
answer-first `/today` ladder, the just-shipped `/map` "Best in this view" +
"Useful nearby," and the event-detail "dinner + parking" flow are real,
modern, one-of-one wins. But the app **behaves like it lives downtown**: with
no location and no home town set, `/map` opens 15 miles from a Brunswick user
and `/category` ranks downtown-first. That single posture — *downtown by
default* — is the thread connecting the most severe findings (8 of 20 users),
and it's what makes small towns feel shortchanged.

Three patterns dominate:
1. **Downtown-by-default for everyone off-grid** (no location / no home town).
   The biggest, most pervasive failure. [G/P]
2. **Trust leaks from data, not design** — photo-twins (same photo on two
   places), inconsistent provenance/freshness badges, and degraded event feeds
   (Hood dead, Celebrate/County failing). [G]
3. **Two surfaces still read like a database** — category pages have no
   decision facets (the coffee pass's job) and events is a firehose-or-empty
   (the events pass's job). [G/P]

The GIS audit's **County View pilot is strongly justified** by this simulation:
it's the direct fix for the dominant small-town/orientation failure. First
Visit is justified second (visitor sense-of-place); Getting Around is real but
narrower (needs a live parking feed to matter).

Net: the structure passes already queued (coffee, events) hit two of the three
big problems; the third — *downtown posture + data trust* — is largely **data +
a "set your town" affordance**, slottable alongside the page work, and it's the
highest-leverage thing not yet on the board.

Grounding facts used throughout:
- **No-location default is downtown.** `/map` recenters to `FREDERICK_CENTER`
  and never prompts; `/category` ranks from the `fr_home_muni` cookie but
  **falls back to downtown when it's unset** — so a first-time or no-permission
  user is downtown-biased by default. [G]
- **Event feeds are degraded.** Hood = HTTP 410 (dead); Celebrate Frederick +
  County calendar failing in the daily worker (open issues #383–#423). Town
  pages cap events at 4 and show a submit-door + nearby fallback when empty, so
  **small-town event sections likely read empty right now.** [G]
- **Category pages have no decision facets yet** (editorial header + 3 photo
  picks + a ranked list). The "open now / good for sitting / with food / local
  favorites" guidance is exactly what the coffee pass will add. [G]
- **Photo-twins unresolved** (~37 clusters): shared/wrong card photos on
  `/map`, `/radius`, category, town. [G]
- **Feature-score ranking can surface niche records** (guitar studios, schools)
  above obvious anchors — flagged in prior mock PRs. [G]

---

## The 20 users

Format per user: town · mission · expected path · actual path · taps/scroll ·
worked · confusing · crowding/overlap · collision · data issues · trust gap ·
downtown-bias · clear next action? · fresh? · **severity** · fix type.

### 1. Downtown Frederick visitor, 2 hours
Downtown · "what's worth doing right now?" · open `/today` → pick → go ·
`/today` answer-ladder → AnswerCards → a place. **Worked:** answer-first ladder
is genuinely fast; "Best move now" is a real answer. **Confusing:** none major.
**Overlap:** [D] expected-fixed. **Data:** a top pick could be a photo-twin.
**Trust:** open-now confidence shown. **Bias:** fine (they ARE downtown).
**Next action:** yes. **Fresh:** yes. **Severity: Low.** Fix: none.

### 2. Longtime resident who hates tourist fluff
Frederick · "anything actually new/worth it, not the same 5 tourist spots" ·
`/today` or `/radius` · sees curated picks. **Worked:** WithinReach is
locals-useful. **Confusing:** unclear what's *new* vs evergreen; feels like the
same canonical list. **Data:** feature-score surfaces odd niche places — reads
as "the algorithm doesn't know the town." **Trust:** wants "why am I seeing
this." **Bias:** n/a. **Next action:** partial. **Fresh:** medium — nothing
says "this week." **Severity: Medium.** Fix: data/ranking (a "new/changed"
signal) + copy.

### 3. Parent with young kids
Walkersville · "somewhere free + easy with a 3-year-old, near me" · expects a
"with kids" filter · there's **no family mode**; must hunt categories +
amenities (playgrounds live). **Worked:** playground amenities exist. **Confusing:**
no single "with kids" answer; must assemble it. **Data:** playground coverage
OSM-sparse outside downtown. **Trust:** ok. **Bias:** lives in Walkersville →
default downtown picks unless cookie set. **Next action:** weak. **Fresh:** no.
**Severity: High.** Fix: larger product (family mode) + ranking origin.

### 4. Older / low-tech user
Frederick · "the thing I heard about — just show me, simply" · opens app cold ·
`/today`. **Worked:** answer-first reduces overwhelm. **Confusing:** map
pinpoint-first empty state ("what do you want to see?") can read as "blank/
broken" to a low-tech user expecting pins. Drag-to-expand drawer is not
discoverable. **Overlap:** [D]. **Trust:** ok. **Next action:** medium.
**Fresh:** yes but maybe intimidating. **Severity: Medium.** Fix: UI/copy
(empty-state wording, a peek hint).

### 5. Business owner checking their listing
Frederick · "is my place listed, correct, and can I fix it?" · search name →
place detail → claim · `/search` → `/places/[slug]` → `/business/claim`.
**Worked:** place detail is solid; claim form exists. **Confusing:** claim
submit writes to DB but **no confirmation/review loop** (untested e2e; manage-
token email not wired — no SMTP). **Data:** their photo may be a twin (wrong
photo). **Trust:** owner sees a wrong photo and no way to know it'll be fixed →
trust hit. **Next action:** dead-ends after submit. **Severity: High.** Fix:
component/system (claim loop + SMTP) + data (photo-twins).

### 6. New resident understanding the county
Brunswick → countywide · "what even is around here, town by town" · expects a
county overview · town pages exist (`/m/[town]`) but **discovery of them is
weak** (orphan-ish; not strongly surfaced). **Worked:** town page 3-answer
spine is good when reached. **Confusing:** how to browse all towns; no "County
View." **Data:** small-town place sets thinner. **Bias:** strong — default
downtown framing. **Next action:** weak. **Fresh:** medium. **Severity: High.**
Fix: product (County View / town index) — **GIS County View hypothesis ✓**.

### 7. Brunswick user
Brunswick · "what's open near me tonight in Brunswick" · `/map` or `/today` ·
**defaults downtown Frederick** unless they set home town. **Worked:** once
centered, in-view ranking is good. **Confusing:** app opens 15 mi away from
them. **Data:** Brunswick events likely empty (feed degraded). **Trust:** ok.
**Bias:** severe — the core small-town complaint. **Next action:** weak until
they relocate the map. **Severity: High.** Fix: ranking/product (respect
location/home; County View) — **small-towns-shortchanged hypothesis ✓**.

### 8. Thurmont / northern county user
Thurmont · "Catoctin area things, not downtown" · `/category` or `/today` ·
category ranks from home cookie IF set, else downtown. **Worked:** "Ranked from
Thurmont" line is a nice touch *when cookie present*. **Confusing:** first
visit = downtown picks with no explanation. **Data:** northern coverage thinner;
NPS/Catoctin live but not foregrounded. **Bias:** severe by default. **Next
action:** medium. **Severity: High.** Fix: ranking origin default + product
(County View).

### 9. Middletown / Myersville / western county user
Middletown · "dinner + a walk on this side of the mountain" · `/radius` or
`/map` · WithinReach helps once centered. **Confusing:** western coverage
thin; default downtown. **Data:** fewer records, more OSM reliance. **Bias:**
severe. **Severity: High.** Fix: ranking origin + coverage (data).

### 10. Walkersville / Woodsboro user
Walkersville · "is there anything here at all?" · `/m/walkersville` · town page
hero + top places, **events likely empty → submit door**. **Worked:** honest
empty state + nearby fallback. **Confusing:** reads as "nothing happens here."
**Data:** thin places + empty events = town feels neglected. **Bias:** severe.
**Severity: High.** Fix: data (coverage) + copy (frame the nearby fallback
warmly) — **small-towns hypothesis ✓**.

### 11. Weekend visitor from DC/Baltimore
Out-of-county · "is Frederick worth the drive Saturday?" · `/today` or `/about`
→ events · **events firehose / thin feeds**: either overwhelming or empty.
**Worked:** /today reads inviting. **Confusing:** events page is a wall (lens
chips + facets + rails) — too much to scan in 30s. **Data:** Ticketmaster/
Eventbrite off → big-draw events missing; Hood dead. **Trust:** "is this all
that's happening?" doubt. **Next action:** medium. **Fresh:** /today yes,
/events no. **Severity: High.** Fix: events cleanup (Pass 4) + feed reliability.

### 12. Rainy-day user
Frederick · "indoor stuff, today, it's pouring" · expects a "rain plan" · **no
rain mode**; must infer indoor from categories (museum/gallery/shops). **Worked:**
weather is on /today. **Confusing:** no one-tap "indoor & open now." **Data:**
indoor-ness isn't a tagged facet. **Trust:** ok. **Next action:** weak.
**Severity: Medium.** Fix: product (rain plan mode) + data (indoor facet).

### 13. User looking for something free
Frederick · "free things to do today" · expects a "free" filter · **no free
facet**; events lack a reliable price field. **Worked:** parks/trails are
implicitly free. **Confusing:** can't filter free. **Data:** price not modeled
on events. **Severity: Medium.** Fix: data (price/free flag) + UI facet.

### 14. Dinner before an event
Frederick · "eat near tonight's show, timed right" · `/events/[slug]` →
before/after picks + parking nearby. **Worked:** event detail HAS before/after
picks + parking nearby — genuinely good. **Confusing:** discovering that flow
from the event firehose is hard. **Data:** open-now timing vs event start not
explicitly reconciled. **Trust:** ok. **Fresh:** yes (this flow is a highlight).
**Severity: Low–Med.** Fix: surface the flow earlier.

### 15. Find parking quickly
Frederick · "where do I park right now, near where I'm going" · parking is a
**place category** (decks listed) but **no live occupancy** (pending, no feed)
· `/map` useful-nearby + parking category. **Worked:** decks are findable.
**Confusing:** no "spaces available." **Data:** no live counts. **Trust:**
"is it full?" unknown. **Next action:** medium. **Severity: Medium.** Fix:
data (occupancy feed, gated) — **parking/road-context hypothesis ✓ (partial)**.

### 16. Restrooms / practical needs
Downtown · "public restroom near me now" · `/map` "Useful nearby" (just shipped
in #433) → restroom chip with distance. **Worked:** this is now a real answer —
a highlight. **Confusing:** only populates with places in view; sparse outside
downtown (OSM coverage). **Data:** restroom coverage downtown-heavy. **Bias:**
downtown-heavy amenity coverage. **Severity: Low–Med.** Fix: data (coverage).

### 17. Civic/practical user — municipal info
Myersville · "trash day / permits / town hall for my town" · `/m/[town]`
CivicCard — **self-hides until the extraction agent populates it**, so most
towns show nothing. **Worked:** when populated, it's exactly right. **Confusing:**
mostly empty → "the app doesn't know my town's basics." **Data:** municipal
civic data largely unpopulated. **Bias:** small towns worst. **Severity: High.**
Fix: data (populate municipal civic) — **GIS civic + small-towns ✓**.

### 18. 30-second user
Anywhere · "give me one good thing, fast, then I'm gone" · `/today` →
AnswerCards. **Worked:** the answer-first ladder is built exactly for this —
strongest 30s story in the app. **Confusing:** if they land on `/map` first
(pinpoint-empty) or `/events` (firehose), they bounce. **Trust:** ok. **Next
action:** yes on /today. **Fresh:** yes. **Severity: Low** (on /today) /
**High** (if they enter on /events or /map cold). Fix: ensure /today is the
default entry; tame /map empty + /events.

### 19. No location permission
Frederick area · "just show me stuff" without granting location · app **never
prompts**, silently defaults downtown. **Worked:** doesn't break; no nag.
**Confusing:** everything is downtown-centric with no "set your town" nudge.
**Data:** ok. **Trust:** ok. **Bias:** severe-but-silent. **Next action:**
medium. **Severity: High.** Fix: product (a gentle "where are you?" / home-town
set without GPS) — **no-location + orientation hypothesis ✓**.

### 20. Distrustful user — what's official vs scraped
Frederick · "is this data real, or some scraped junk?" · looks for sources ·
`/trust` exists; TrustChip/FreshnessChip exist on records. **Worked:** there IS
a trust page + per-record freshness/source signals. **Confusing:** signals are
inconsistent surface-to-surface; "official / owner-submitted / feed / scraped"
isn't a clear, consistent badge. **Data:** photo-twins actively undermine this
user ("same photo on two places = obviously wrong"). **Trust:** the photo-twins
are the single biggest credibility leak. **Severity: High.** Fix: data
(photo-twins) + UI (consistent provenance badge) — **GIS data-trust ✓**.

---

## Grouped by surface

- **/today** ✅ strongest surface. The answer-first ladder wins users 1, 18.
  Risk: it must be the default entry.
- **/map** — ranked "Best in this view" + "Useful nearby" (restrooms!) are
  real wins (16). Weak points: pinpoint-empty reads "blank" to low-tech (4),
  defaults downtown for everyone off-grid (7, 19).
- **/radius** — WithinReach is locals-useful (2, 9) but discovery of it is
  weak; it's a deep-link, not a headline.
- **Category pages** — editorial header + 3 picks is decent, but **no decision
  facets** = still directory-ish (2, 12, 13); downtown default without cookie
  (8). This is the coffee pass's job.
- **Events** — firehose when feeds work, empty when they don't (11); the single
  most "database-y / overwhelming" surface. Event *detail* (before/after +
  parking) is a hidden gem (14). Pass 4's job.
- **Town pages** — good 3-answer spine, but thin places + empty events + empty
  civic = small towns feel neglected (6, 10, 17).
- **Place detail** — solid; photo-twins are the main wound (5, 20).
- **Search / Ask** — works; not a major friction source in these runs.

## Grouped by severity
- **Critical:** none stop the app cold. (The closest: photo-twins + small-town
  emptiness erode *trust*, not function.)
- **High:** small-town/downtown bias (3,6,7,8,9,10,17,19); event feed
  reliability + firehose (11); business-claim dead-end (5); photo-twins/
  provenance (20); cold-entry on /map or /events (18).
- **Medium:** "what's new" signal (2); low-tech map empty state (4); rain/free
  modes (12,13); parking occupancy (15); amenity coverage (16).
- **Low:** the /today happy paths (1,18), restroom lookup (16).

---

## GIS hypothesis verdicts (does the simulation justify a GIS pilot?)
- **Do smaller towns feel shortchanged?** **YES, strongly** (users 6,7,8,9,10,
  17,19). The #1 recurring theme. → **County View earns its place.**
- **Do visitors need better orientation?** **YES** (4,6,11,19). → County View /
  First Visit.
- **Do people need parking/road context?** **Partially** (15) — real but
  narrower; live-occupancy is the missing piece, not boundaries. → Getting
  Around is real but lower priority than County View.
- **Does the map feel generic?** **Somewhat** — less "generic," more "downtown-
  defaulted." GIS town framing helps the *bias*, which is the sharper problem.
- **Does county-wide context help users know where they are?** **YES** (7,19).
  → County View directly answers the most common failure (opening 15 mi away
  with no orientation).

**Verdict:** the simulation **confirms County View as the highest-value GIS
pilot** (directly fixes the dominant small-town/orientation failure), First
Visit second (visitor sense-of-place), Getting Around third (narrower, needs a
live parking feed to matter). Matches the owner's read.

---

## Top 10 product problems
1. **Downtown-by-default for everyone off-grid** (no location, no home town) —
   the single most pervasive failure.
2. Small towns feel neglected: thin places + empty events + empty civic.
3. Events is a firehose when feeds work, empty when they don't.
4. No "mode" for real intents: with-kids, rain, free, first-visit.
5. Business-claim dead-ends (no confirmation, no SMTP, no review loop).
6. Photo-twins visibly wrong photos undercut trust app-wide.
7. /map cold entry (pinpoint-empty) reads "blank/broken" to non-power users.
8. WithinReach (a genuinely strong feature) is buried as a deep-link.
9. No "what's new this week" signal for returning locals.
10. Provenance (official/owner/feed/scraped) isn't a consistent, legible badge.

## Top 10 quick wins
1. Make `/today` the guaranteed default entry (it's the best 30s story).
2. A gentle "set your town" affordance when no location/cookie (kills bias
   cheaply).
3. Warmer copy on empty town event sections ("nothing ticketed nearby — here's
   what's close in {neighbor}").
4. Surface WithinReach/`/radius` from `/today` and `/map`, not just deep-link.
5. Reword the `/map` pinpoint-empty state so it reads as "choose," not "blank."
6. Add a peek/drag hint to the map drawer for discoverability.
7. Fold the top remaining photo-twins (the multi-tenant clusters) — visible
   credibility fix.
8. On category pages, add the "Ranked from {town}" line even on first visit
   with a one-tap town set.
9. Foreground the event-detail "dinner before + parking" flow (it's a gem).
10. Add a "new/recently added" tag to places to give locals a reason to return.

## Top 10 data-trust fixes
1. Resolve photo-twins (multi-tenant + wrong-photo clusters).
2. Consistent provenance badge: official / owner-submitted / feed / scraped.
3. Fix the failing event feeds (Hood dead, Celebrate/County worker-failing).
4. Authoritative coordinates via GIS address points (the ~157 mis-geocoded
   pins).
5. Stamp every place with its real municipality (GIS boundaries) → kills "is
   this even in my town?" doubt.
6. Show open-now *confidence* consistently (verified vs likely) everywhere, not
   just some surfaces.
7. Populate municipal civic (trash/permits/hall) so town CivicCards aren't empty.
8. De-emphasize feature-score-only ranking that surfaces niche records over
   anchors.
9. Add last-verified dates visibly on place detail.
10. Reconcile event price/free so "free" is trustworthy.

## Top 10 UI/UX fixes
1. Tame the events firehose (Pass 4: Tonight/Weekend/Free/With kids/Live music).
2. Add category decision facets (Pass 3 coffee: open now / good for X / with
   food / local favorites).
3. Default-entry + cold-entry handling (/today first; /map & /events softened).
4. Map empty-state + drawer-discoverability copy.
5. County View / town-index navigation so small towns are reachable.
6. Surface WithinReach prominently.
7. Consistent trust/freshness chips across every surface.
8. Make "set your town" a first-class, one-tap control.
9. Event-detail flow promoted into discovery.
10. (Post-#434) confirm no residual overlay collisions on-device. [D]

## Top 10 future-proofing risks
1. Event coverage is single-points-of-failure (feeds die → /events empties).
2. Downtown bias compounds as more data is added downtown-first.
3. Photo-twins recur without ChIJ-based dedup in the pipeline.
4. Feature-score ranking drift surfaces odd records as the set grows.
5. OSM amenity sparsity outside downtown (restrooms/playgrounds).
6. Municipal civic data has no sustainable population pipeline.
7. GIS layers, if shown raw, become heavy/confusing (keep as intelligence).
8. No visual-regression harness → overlap/stacking can silently regress.
9. Business submissions with no review loop = data rot + owner distrust.
10. Account-level Actions block means CI trust rests on local runs.

## Top 10 ideas to feel fresh / one-of-one
1. **County View** — town boundaries + "you're in/near {town}" + county-wide
   day-trip framing. The signature "the county finally has an interface" move.
2. **First Visit mode** — historic district + cultural assets + a walkable
   route; make the map feel uniquely Frederick.
3. A **"this week in Frederick"** changing layer for returning locals.
4. **Tonight mode** — fade closed, warm-glow active areas (motion that clarifies).
5. Event → **"dinner + parking + walk"** mini-itinerary as a first-class card.
6. **Reachability radius** from where you stand, animated, on the main map.
7. **Creek/trail corridor** gentle flow lines in Outdoors mode.
8. Per-town **identity cards** (the railroad town, the mountain town) — character,
   not stats.
9. **Rain Plan** one-tap "indoor & open now" with a sky-aware trigger.
10. **Owner-posted "tonight only" specials** (the business_specials moat) — the
    one thing no competitor has.

---

## What this means for the queue
Unchanged order: **coffee → events** next. The simulation *adds targets*:
- **Coffee (Pass 3):** decision facets are the proven gap (users 2,12,13) —
  validates the planned shape (open now / good for sitting / with food / local
  favorites).
- **Events (Pass 4):** firehose + feed reliability are both confirmed High.
- **GIS:** County View is justified as the top pilot (after coffee/events),
  First Visit second, Getting Around third.
- **Cross-cutting trust:** photo-twins + provenance badge + the downtown-default
  fix are high-value and largely *data*, slottable alongside the page work.
