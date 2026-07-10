# Radius Pings — Phase 1: Research + Product Design

Status: DESIGN ONLY. No implementation is approved. Baseline: `origin/main`
@ `4bb6219e`, researched in the clean worktree `../frederick-radius-pings`
on branch `claude/radius-pings` (0 dirty files at start).

Tagline: **"Ping what's happening."**

---

## 1. Current architecture findings

### 1a. A proto-Ping system already ships

The single most important finding: **Frederick Radius already has a
community reporting pipeline in production**, and its schema comment
literally reserves a column for this feature ("future Waze-style 'still
there?' voting").

| Concern | What exists | Where |
|---|---|---|
| Table | `community_reports`: category, subtype, title, note, photo_url, lng/lat, municipality, status (pending/approved/rejected), source, reported_by (free text), **confirmations int (zero writers)**, expires_at, created_at, reviewed_at + indexes on status/(lng,lat)/expires_at/created_at | `src/lib/db/schema.ts:698-724` |
| Taxonomy + TTL | 4 categories (hazard 30d + photo required, condition 6h, tip 90d, note 30d), subtypes, per-category `ttlHours`, `photoRequired` | `src/lib/reports/categories.ts` |
| Anti-spam | `sanitizeText`, `textSpamConcern` (links/shouting/repetition), `statusForSubmission` (passcode → instant approve, else pending), `expiresAtFor` | `src/lib/reports/logic.ts` |
| Submit API | POST `/api/reports`: category/subtype/coord validation, **county-lock** (`isInFrederickCounty`), text screens, Blob photo upload (4MB, jpeg/png/webp), trusted-passcode path | `src/app/api/reports/route.ts` |
| Submit UI | `/report`: full-screen map + center crosshair, category/subtype chips, note + photo, `?c=lng,lat,zoom` deep-link, `track("report_submit")` | `src/app/report/ReportClient.tsx` |
| Read loader | approved + unexpired only, limit 500, fail-soft `[]` | `src/lib/loaders/communityReports.ts` |
| Reaper | `pruneExpiredReports()` in the daily `data-health` cron | `communityReports.ts:87`, `api/cron/data-health/route.ts:117` |
| Map render | reports → `OsmPlace` shape → clustered `amenities` source under the "Community" layer-tray group, caution-colored engraved markers, report-styled popup | `map/page.tsx:536-553`, `categoryMarkers.ts:24`, `popups.tsx:171-205` |
| Moderation | `/admin/reports` queue + `reviewReport` action (approve/reject/delete), Basic-Auth gated | `src/app/admin/reports/` |
| Entry point | "Mark a spot" in the More sheet (the in-map FAB was removed by owner decision) | `MoreSheet.tsx:97`, `AppMap.tsx:483-487` |

### 1b. Map architecture (the surface Pings must join)

- `/map` render chain: `page.tsx` (ISR 300s) → `MapModeGate` → `BrowseMapArea`
  → `BrowseMapClient` (URL params) → `AppMapClient` (ssr:false) → `AppMap`
  (~2,900-line GL orchestrator, `react-map-gl/mapbox`).
- **MapDock** (`src/components/map/MapDock.tsx`) is the one instrument:
  What / When / Where / **Layers** panes; pinned to the TOP of the canvas
  (the floating BottomNav owns the bottom band). Layer toggles live as
  `AppMap` state seeded from `localStorage` (`mapLayerPrefs.ts`, key
  `fr:map-layers:v1`); intent/time filters live in the URL.
- Native Mapbox clustering on 3 sources; markers are canvas-rasterized
  "pucks" with engraved glyphs (`categoryMarkers.ts` bucket seam — report
  buckets `rhazard/rcond/rtip/rnote` already exist).
- Selection: curated pins open **MapPeek** (DOM bottom card) → full
  `PlaceSheet` via global provider; reports/OSM currently open only a
  Mapbox **popup** (no sheet, no actions).
- Contracts: z-index ladder (`docs/Z_INDEX.md`, `--z-fab: 42` free),
  chrome-height CSS vars, `.tap-44`/`.tap-44-y` extenders, safe-area math,
  `npm run lint:zindex` guard.
- Freshness gap: reports are baked into the page at ISR time (≤300s stale,
  plus deploy-keyed caches). A live layer needs client-side fetch.

### 1c. Identity, push, telemetry

- **Anonymous users have zero server identity.** `fr-device-id` is READ in
  two places but MINTED nowhere (always undefined). The only durable
  anonymous key is the push-subscription `endpoint`, which exists only
  after notification consent. `reported_by` today is a free-text vanity
  field. `auth.users` count in prod: 0.
- Push: topic fan-out (`fanoutToTopic` + `push_log` dedupe), device-scoped
  sends (`saved-reminders` pattern), sw.js `notificationclick` already
  routes `payload.url`. New topics are plain strings — no migration.
  `owner-alerts` topic (admin-gated) already pushes feedback/signups to
  the owner's phone.
- Telemetry: `track(event, props)` → Plausible, cookieless, ~26 existing
  events; `report_submit` already exists. Convention: verb_noun + small
  scalar props, never PII.
- Rate limiting: `isRateLimited()` exists but (a) **is a no-op until
  Upstash KV env is set** (known audit item) and (b) **is not applied to
  `/api/reports` at all**. No cooldowns, no dedupe on the write path.
- Photos: 4MB cap + content-type allowlist, but **EXIF is only stripped
  incidentally by the client canvas re-encode** — a direct API POST keeps
  GPS EXIF. Server-side stripping does not exist.
- DB conventions that bind this design: hand-applied idempotent SQL
  migrations (`drizzle/NNNN_*.sql` + paste into Supabase; db:push is
  blocked), RLS enabled with zero policies (all access via the BYPASSRLS
  server role through Drizzle), **max:1 pooled connection — DB queries
  must be sequential, never `Promise.all`** (deadlocks Supavisor; verified
  live on 2026-07-09).

### 1d. Gamification

**Nothing exists — but the name is already promised.** The Saved wallet
ships a gold-ruled "PTS — soon" slot and the colophon line **"Radius
Points, for the field checks you contribute · Coming soon"**
(`SavedWallet.tsx:294-300`, `SavedList.tsx:1055-1056`). Pings fulfills an
existing in-product promise rather than inventing a system. No points
ledger, badges, or reputation fields exist anywhere (`user_profiles` has
none).

### 1e. Terminology collisions

- "Field Notes" = the verified place-intel moat (happy hours, tips). Do
  not reuse "note" or "field" language for Pings. (`note` is also already
  a `community_reports` category.)
- "Pulse" = the live civic-feed board (`/pulse`). Distinct concept;
  complements Pings (a future Pulse tile could count live Pings) but the
  name must stay separate.
- `field_amenities` (`/collect`) = permanent infrastructure;
  `commerce_link_reports` = broken-link metadata. Both deliberately
  separate lanes; leave them alone.
- The trust vocabulary to reuse: `confidence` + `last verified` labels
  from Field Notes (`verifiedLabel()`), not a new invented scale.

## 2. Reuse verdict — what should carry over

**Evolve, don't greenfield.** The recommendation is to make Radius Pings
the second life of `community_reports` rather than a parallel system:

- KEEP the table (add columns via one additive migration — §6). The DB
  columns are free-text, so the new taxonomy needs no destructive change.
- KEEP `src/lib/reports/logic.ts` helpers (sanitize/spam/TTL), the Blob
  photo path, the loader + reaper, the admin queue (relabel), county-lock,
  the `categoryMarkers` bucket seam, and the crosshair placement UX.
- REPLACE the surface language ("Mark a spot", "community report") with
  Ping language everywhere user-facing.
- BUILD the missing organs: confirm/clear loop, author identity, rate
  limiting + cooldowns + dedupe-as-confirm, a first-class map layer with
  client freshness + aging, the fast create sheet, impact accounting,
  EXIF stripping.

Rationale: the pipeline is proven in production, the admin muscle exists,
and a parallel system would create a third overlapping "reports" concept
(the collision the codebase already struggles against).

## 3. Product requirements document

### Problem
Frederick Radius knows what is *usually* true (hours, events, places) but
not what is true *right now at street level*. The people walking downtown
know. There is no five-second way for them to say it, no loop that
verifies it, and no surface that rewards it.

### Users
- **The passerby** (reporter): notices a closed sign, a full garage, a
  flooded stretch of Carroll Creek. Will give the app 5 seconds, not 30.
- **The decider** (consumer): choosing where to go in the next hour;
  wants to trust the map's "right now" layer.
- **The steward** (owner/admin): needs abuse containment and a kill
  switch, not a moderation full-time job.

### Jobs to be done
1. Report an observable condition in ≤3 taps, ≤5 seconds.
2. See fresh, trustworthy conditions on the map without hunting.
3. Confirm or clear a condition in 1 tap when standing there.
4. Feel that contributing mattered ("helped N people"), without a
   points-farming economy.

### Success signals (beta scale)
- ≥20% of weekly active testers create or confirm ≥1 Ping.
- Median create time under 10s (track submit-start→done).
- ≥50% of expired Pings were never contested (TTLs are honest).
- Zero moderation incidents requiring more than the admin queue.

### Voice + brand constraints (binding)
Verb-first labels, no exclamation points, no banned words (VOICE.md), no
em dashes in copy, counts as support not headline. Ping copy set:
"Ping it" · "Add a ping" · "Pings nearby" · "Pinged 6 min ago" ·
"Confirmed by 4 people" · "Still true?" · "Cleared" · "Ping received.
We'll ask nearby people to confirm it."

## 4. MVP scope and explicit non-goals

### MVP vertical slice (matches the brief's suggested slice)
1. Create a Ping from the map (FAB → type sheet → submit).
2. See Pings as a first-class map layer (fresh, clustered, aging).
3. Tap a Ping → detail bottom card.
4. Confirm ("Still true?") or clear ("Cleared") from the card.
5. Automatic expiration per type + daily reaper (already exists).
6. A private impact line: "Your pings: N active · M confirmations."

### The six MVP ping types
Mapped onto the existing (category, subtype) columns — values are
free-text so this is code-level taxonomy only:

| Ping type | category/subtype | Anchor | TTL default |
|---|---|---|---|
| Unexpectedly closed | `status/closed` | place | 6h (cap 12h) |
| Crowded or long line | `status/crowded` | place | 45 min |
| Event delayed · cancelled · sold out · started | `status/event` (+detail) | event | until event end |
| Sidewalk or trail hazard | `hazard/*` (existing subtypes) | point | 24h (trail 72h) |
| Accessibility blocked | `access/blocked` | point or place | until cleared or admin review (soft cap 7d, resurfaced to admin) |
| Parking full / available | `parking/full`, `parking/open` | garage/lot point | 20 min |

Future types (patio open, live music, food truck, bus delayed, restroom,
elevator, flooding/ice, kitchen closing, hours confirmed) are new rows in
the same taxonomy table — no schema change.

### Non-goals (MVP)
- No comment threads, no messaging, no following people, no public
  profiles or movement history.
- No police/enforcement reporting of any kind; no reports about people.
- No public leaderboard; no purchasable anything.
- No Today/Ask/recommendation integration yet (the loader exposes clean
  data for it later).
- No radial menu (see §9 — a compact sheet wins on a11y and speed).
- No new nav tab. No second map control system.
- No offline queueing of pings.

## 5. Ping lifecycle / state machine

```
            create (device D, type T, location L)
                        │
              [dedupe: live same-type ping within R meters?]
                 │yes                        │no
                 ▼                           ▼
        counts as CONFIRM              ┌──────────┐
        on the existing ping ────────► │  ACTIVE  │  visibility: "New report"
                                       └────┬─────┘
        confirms (other devices)            │ time decay toward expires_at
        raise confidence:                   │
        New report → Likely → High ─────────┤
                                            │
        ┌───────────────┬───────────────────┼───────────────────┐
        ▼               ▼                   ▼                   ▼
   CLEARED         EXPIRED             CONTESTED           REMOVED
 (2 clear votes,  (expires_at         (clears ≈ confirms:  (admin reject/
  or author +1,    passes; TTL         show "may have       delete; spam)
  or admin)        per type)           cleared", shorten
        │               │              expires_at)
        └───────┬───────┘
                ▼
      hidden from default map view;
      reaped from DB by daily cron (grace 1d)
```

State is stored as: `status` (existing: pending/approved/rejected — MVP
uses `approved` for ACTIVE, `rejected` for REMOVED) + new `cleared_at`
+ computed EXPIRED (`expires_at < now`). CONTESTED is a computed display
state, not a column. "Still true?" votes extend `expires_at` by one
half-TTL (capped at 2× original) — fresh confirmation keeps a real
condition alive without manual re-posting.

Moderation posture (beta): **publish-first**. Every Ping goes live
immediately AND pushes to the existing `owner-alerts` topic, so the owner
is the human-in-the-loop at current scale. The pending queue remains as
the fallback when abuse signals fire (rate-limit trips, spam screen).

## 6. Data model and RLS requirements

One additive, idempotent migration (`drizzle/0018_radius_pings.sql`,
hand-applied per house process) + `schema.ts` updates:

```sql
-- Evolve community_reports into the Pings store (additive only)
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS author_device text,          -- minted fr-device-id (opaque uuid)
  ADD COLUMN IF NOT EXISTS place_slug   text,           -- optional anchor
  ADD COLUMN IF NOT EXISTS event_slug   text,           -- optional anchor
  ADD COLUMN IF NOT EXISTS cleared_at   timestamptz,    -- terminal clear
  ADD COLUMN IF NOT EXISTS clear_votes  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS community_reports_place_idx ON public.community_reports (place_slug);
CREATE INDEX IF NOT EXISTS community_reports_device_idx ON public.community_reports (author_device);

-- One vote per device per ping, confirm and clear in one ledger
CREATE TABLE IF NOT EXISTS public.ping_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ping_id    uuid NOT NULL REFERENCES public.community_reports(id) ON DELETE CASCADE,
  device     text NOT NULL,
  kind       text NOT NULL,              -- 'confirm' | 'clear'
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ping_votes_ping_device_uq ON public.ping_votes (ping_id, device);
CREATE INDEX IF NOT EXISTS ping_votes_ping_idx ON public.ping_votes (ping_id);
ALTER TABLE public.ping_votes ENABLE ROW LEVEL SECURITY;   -- deny-all, no policies
```

- `confirmations` / `clear_votes` on the parent row are DENORMALIZED
  tallies maintained by the vote endpoint in the same transaction
  (sequential queries — never `Promise.all`, per the Supavisor max:1
  constraint).
- RLS: identical deny-all posture; all reads/writes via Drizzle server
  routes. No PostgREST access, no policies.
- **Author identity**: mint `fr-device-id` at last (a `crypto.randomUUID()`
  in localStorage — the two existing readers start working the moment it
  exists). It is sent with create/vote calls and stored opaque. It is
  never displayed, never listed publicly, never queryable by other users.
  Impact totals are computed for YOUR device only. Explicitly NOT a
  security credential — it is spoofable and treated only as a dedupe +
  attribution hint; all abuse enforcement is server-side (IP rate limits).
- Privacy: no per-user public history; the map never shows who pinged;
  proximity is used transiently server-side (distance between reported
  fix and ping location) and never stored beyond a coarse
  `reporter_distance_band` if we choose to store it at all (open decision
  #6 in §14).

## 7. Confidence and scoring model

### Confidence (computed at read time, no fake percentages)
Inputs: independent confirm count (unique devices), age relative to TTL,
clear votes, photo presence, (phase 2: per-category device reliability).

MVP ladder — four honest labels:
- **New report** — 0 confirms, any age.
- **Likely** — 1 confirm, OR photo attached, OR reporter was verifiably
  nearby at create time (distance band ≤ 150m).
- **High confidence** — ≥2 independent confirms, newest within half-TTL.
- **May have cleared** — clear votes ≥ confirms (and ≥1), not yet terminal.

Display pairs the label with facts, in the Field Notes trust voice:
"Confirmed by 4 · pinged 18 min ago". Never a percentage.

### Scoring (Radius Points — fulfills the existing promise)
Points are LEDGERED from MVP day one but DISPLAYED as impact copy first;
the wallet "PTS" slot lights up in a later PR when the economy has data.

| Event | Points | Notes |
|---|---|---|
| Your ping reaches Likely/High (community-verified) | +10 | once per ping |
| Your confirm matches eventual consensus | +2 | judged at expiry/clear |
| Your clear is the one that closes a real ping | +4 | |
| Photo on a verified ping | +3 | once |
| Submitting alone | 0 | anti-spam by design |
| Ping rejected/removed | 0 and reliability− | repeated → cooldowns lengthen |

Reputation is per-category and per-device (a `ping_reputation` table in
phase 2 — NOT in the MVP migration). Badges (Trail Scout, Accessibility
Ally, Parking Pathfinder…) and weekly/neighborhood challenges are phase 3;
the vote ledger already captures everything they need retroactively.

Impact copy (private, in My Radius colophon): "Your pings helped N
people" where N = unique devices who viewed-or-voted on your active pings
— MVP counts votes only (honest, cheap); view-based reach needs a
counting endpoint we defer.

## 8. Abuse / privacy threat assessment

| Threat | Vector | Mitigation (MVP) |
|---|---|---|
| Spam flood | scripted POSTs | **Prerequisite PR-0: wire Upstash KV** so `isRateLimited` is real; apply to create (`pings-create` 5/hr/IP) + vote (`pings-vote` 30/hr/IP); per-device cooldown (1 create/2min, KV) |
| Junk duplicates | same condition re-posted | dedupe-as-confirm: live same-type ping within 120m → submit becomes a confirm on it (server-side, returns the existing ping) |
| False reports | malicious "closed" on a business | publish-first BUT owner push alert per ping; 2-tap admin remove; type TTLs bound damage; contested state surfaces disagreement; phase-2 reliability decay |
| Vote manipulation | one person confirming own ping | author device cannot vote its own ping; unique (ping, device); IP-level vote rate limit; confirms from the same /24 counted but flagged internally (phase 2) |
| Location privacy | reporter position leakage | ping stores the CONDITION's location (crosshair), never the reporter's fix; distance evidence used transiently; no public author identity, no history endpoint |
| Photo EXIF GPS | direct API POST bypasses client re-encode | server-side metadata strip: pure-function removal of JPEG APP1/APPn + PNG tEXt/eXIf chunks before Blob upload (no new dependency; ~60 lines + unit tests) |
| Photo abuse (content) | offensive imagery | photos hidden until ping reaches Likely, owner alert includes photo, admin remove; (phase 2: hash-block repeat offenders' devices) |
| Harassment via pings | pinning conditions at a home | county-lock already on; MVP types are place/infrastructure-scoped; free-text note is 280 chars, spam-screened, and shown small; no person-related types will be added |
| Emergency misuse | reporting fires/crimes as pings | create sheet carries a fixed line: "Emergency? Call 911." — and no emergency-shaped types exist |
| Griefing the clear button | mass-clearing real pings | clears rate-limited, terminal clear needs 2 devices or author or admin; contested state instead of instant removal |
| DB/API abuse | oversized payloads | existing 4MB photo cap, 280-char note, zod-shaped validation on every field, force-dynamic no-store |

## 9. UX — text wireframes

### Create (mobile, the 3-tap path)
```
/map (browse)                          Tap ①: the Ping FAB
┌─────────────────────────────┐
│  [MapDock: What When Where…]│   FAB: bottom-right, above BottomNav
│                             │   reserve, z=--z-fab(42), 56px puck,
│          ● ●   ●            │   IconStamp-style vermilion seal,
│       ●      ●              │   label "Ping" (icon + word).
│                    ┌───┐    │   Hidden in radius mode + when a
│                    │ ⨁ │    │   sheet is open.
│                    └───┘    │
│ [BottomNav: Today Map …]    │
└─────────────────────────────┘

Tap ① opens the Ping sheet (compact BottomDrawer, ~40dvh):
┌─────────────────────────────┐
│  Add a ping            [×]  │
│  Where: map center ⌖ (drag  │   ← map stays visible above; the
│  map to adjust) · You: 40m  │     crosshair appears at center
│                             │
│  ┌────────┐ ┌────────┐      │   6 type tiles, 2×3 grid,
│  │ Closed │ │Crowded │      │   ≥44px, engraved glyph + verb-
│  ├────────┤ ├────────┤      │   first label, one accent color
│  │ Event  │ │ Hazard │      │   (no rainbow)
│  ├────────┤ ├────────┤      │
│  │ Access │ │Parking │      │
│  └────────┘ └────────┘      │
│  Emergency? Call 911.       │
└─────────────────────────────┘

Tap ② a type → the sheet swaps to the confirm step:
┌─────────────────────────────┐
│  Crowded or long line       │
│  at Hootch & Banter ⌖       │   ← nearest place suggested when
│  (or: drop pin where you    │     within 60m of the crosshair;
│   are looking)              │     tap name to change/detach
│  [ optional note … 280 ]    │
│  [ ⊕ photo ]                │   ← optional; required for Hazard
│                             │
│  ┌───────────────────────┐  │
│  │       Ping it         │  │   Tap ③
│  └───────────────────────┘  │
└─────────────────────────────┘

→ toast: "Ping received. We'll ask nearby people to confirm it."
→ track("ping_create", {type, anchored, photo})
```

### Ping card (tap a ping marker)
```
┌─────────────────────────────┐
│ ⚠ Sidewalk hazard      LIKELY│  ← type stamp + confidence label
│ Market St near 3rd          │
│ "Bricks up across the whole │
│  sidewalk, strollers can't  │
│  pass"                      │
│ [photo thumbnail]           │
│ Pinged 18 min ago ·         │
│ Confirmed by 4              │
│ Expires ~6h unless confirmed│  ← freshness/expiry line, mono
│                             │
│ ┌───────────┐ ┌───────────┐ │
│ │ Still true│ │  Cleared  │ │  ← 44px, one tap each,
│ └───────────┘ └───────────┘ │     confirm disabled for author
└─────────────────────────────┘
```
Mobile: a MapPeek-pattern DOM bottom card (not a GL popup) so buttons are
real 44px targets. Desktop: the same card docks lower-left as a panel
(MapPeek already handles both). Map camera, filters, and selection
survive open/close (state lives in AppMap, map never unmounts).

### Map layer behavior
- First-class `pings` Source/Layer pair (parallel to `civic`), NOT inside
  the amenities toggle. Own MapDock Layers row: "Pings" with live count.
  Default ON at beta (owner decision #2 if that changes).
- Markers: existing report buckets extended to the 6 types; **aging** =
  marker opacity eases 1.0 → 0.55 across the TTL (data-driven `opacity`
  expression on `age_ratio` the API computes), never below readable.
- Clusters at low zoom via native clustering (same as other sources).
- Cleared/expired pings simply leave the GeoJSON (server filter).
- Freshness: the layer fetches `/api/pings` (no-store) on map mount and
  every 60s while the layer is on — NOT baked at ISR time.
- Selecting from a future list surface highlights the marker
  (`selected-glow` pattern already exists for curated pins).

### Keyboard / SR / zoom
See §11.

## 10. Proposed components, routes, schema files, APIs

New (all inside existing patterns, no new dependencies):
```
drizzle/0018_radius_pings.sql              -- §6 migration (hand-applied)
src/lib/db/schema.ts                       -- + ping_votes, + new columns
src/lib/pings/taxonomy.ts                  -- 6 MVP types (id, label, ttl, anchor kind, photoRequired, glyph bucket)
src/lib/pings/logic.ts                     -- confidence(), ageRatio(), ttlExtension(), dedupe radius rules (pure, unit-tested)
src/lib/pings/loader.ts                    -- getActivePings(): sequential queries, fail-soft
src/lib/pings/points.ts                    -- ledger arithmetic (pure)
src/lib/deviceId.ts                        -- mint/read fr-device-id (finally)
src/lib/photos/stripMeta.ts                -- JPEG APP1/PNG chunk stripper (pure)
src/app/api/pings/route.ts                 -- GET active (no-store, geojson-ready), POST create (rate-limited, county-locked, dedupe-as-confirm)
src/app/api/pings/[id]/vote/route.ts       -- POST {kind: confirm|clear} (rate-limited, unique per device)
src/components/pings/PingFab.tsx           -- map FAB (z-fab, tap-44, hidden per rules)
src/components/pings/PingCreateSheet.tsx   -- BottomDrawer 2-step create
src/components/pings/PingCard.tsx          -- detail card (MapPeek pattern)
src/components/map/pingsLayer.tsx          -- Source/Layer + aging expressions (used inside AppMap)
```
Modified:
```
src/components/map/AppMap.tsx              -- mount layer + FAB + selection wiring (small, additive)
src/components/map/MapDock.tsx             -- Layers row "Pings"
src/components/map/categoryMarkers.ts      -- 6 type buckets (reuse caution palette)
src/components/map/mapLayerPrefs.ts        -- persist toggle
src/app/api/reports/route.ts               -- add isRateLimited + isSameOriginRequest + stripMeta (hardening shared with legacy path)
src/app/admin/reports/page.tsx             -- relabel "Pings", show votes/confidence
src/components/nav/MoreSheet.tsx           -- "Mark a spot" → "Add a ping"
src/components/saved/SavedList.tsx         -- impact line in colophon (later PR)
```
Explicitly untouched: `tabs.ts` (nav), PlaceSheet, Pulse, Field Notes,
`/report` legacy route (redirects to the new flow in the final PR).

## 11. Accessibility requirements

- All create/vote targets ≥44px effective (`.tap-44` / real dimensions);
  the FAB is 56px with a visible text label, not icon-only.
- The create sheet: focus moves into it on open, Escape closes, focus
  returns to the FAB; sheet is a `role="dialog"` with `aria-label="Add a
  ping"`; type tiles are buttons in a labelled group, reachable in DOM
  order.
- The map layer is not the only path: ping details are reachable from the
  card (and later a "Pings nearby" list) — no interaction requires
  precise map clicking (WCAG 2.5.x). MVP includes a simple list fallback
  inside the layer pane ("N pings on the map · [List]") — decision #7.
- Confidence is conveyed by TEXT labels, never color alone; marker aging
  keeps ≥55% opacity and the card carries the explicit freshness line.
- `aria-live="polite"` for "Ping received" confirmation; toasts via the
  existing sonner setup (already SR-friendly).
- Reduced motion: no marker pulse animation for `prefers-reduced-motion`
  (LiveDot pattern already handles this); sheet transitions respect the
  global reduced-motion rules.
- 200% zoom: sheet content scrolls; grid collapses 2×3 → 1×6; nothing is
  trapped under the BottomNav (chrome-height vars).
- Screen reader labels carry the full fact: "Sidewalk hazard, Market
  Street, pinged 18 minutes ago, confirmed by 4, likely".

## 12. Test and verification plan

- **Unit (vitest, colocated like `lib/feedback.test.ts`):**
  `pings/logic.ts` (confidence ladder, TTL extension caps, dedupe radius,
  age ratio), `pings/taxonomy.ts` invariants (every type has ttl + bucket),
  `photos/stripMeta.ts` (JPEG with GPS EXIF in → no APP1 out; PNG chunks;
  corrupt input passthrough-rejected), `deviceId.ts` (mint-once),
  points arithmetic.
- **API integration (local dev against real DB, synthetic rows cleaned
  after — the pattern used for owner-alerts):** create → appears in GET;
  duplicate create within 120m → returns confirm; vote uniqueness; author
  self-vote rejected; rate-limit 429 path (with KV env present);
  county-lock 400; expired excluded from GET.
- **Browser verification (preview tools, mobile 390px + desktop):** the
  3-tap create path; card open/close preserves camera + filters; layer
  toggle + persistence; aging opacity visible on an old synthetic ping;
  keyboard-only create; reduced-motion pass; screenshots before/after per
  PR (house rule).
- **Gates per PR:** `npx tsc --noEmit`, `npx eslint <changed>`,
  `npx vitest run`, `npm run lint:zindex` when map chrome changes, plus
  prod verification after merge per CLAUDE.md (never-seen URL checks).
- **Data safety:** every synthetic row tagged (note prefix `[test]`) and
  deleted; no batch operations against prod during tests; sequential DB
  access only.

## 13. Implementation sequence (small PRs, each independently shippable)

0. **PR-0 (prerequisite, tiny):** wire Upstash KV (Vercel Marketplace) so
   `isRateLimited` is real; add rate limits + origin check + EXIF strip to
   the EXISTING `/api/reports` (pure hardening, no product change).
1. **PR-1 Schema + libs:** migration 0018, schema.ts, `pings/taxonomy`,
   `pings/logic`, `deviceId`, unit tests. Zero UI. (Owner hand-applies the
   SQL; page behavior unchanged.)
2. **PR-2 API:** `/api/pings` GET/POST + vote route + dedupe-as-confirm +
   owner-alert push on create. Integration-tested; nothing renders yet.
3. **PR-3 Map layer:** first-class Source/Layer + dock row + markers +
   aging + 60s refresh. Read-only slice ships value immediately (existing
   reports appear in the new clothes).
4. **PR-4 Ping card:** detail card + confirm/clear actions + selection
   wiring + `track()` events.
5. **PR-5 Create flow:** FAB + 2-step sheet + toast + MoreSheet relabel +
   `/report` redirect. (The full 3-tap loop is now live.)
6. **PR-6 Impact + admin:** vote-aware admin queue relabel, My Radius
   colophon impact line, points ledger accrual (display still "coming
   soon" wallet slot).
7. **PR-7 polish batch:** aging refinements, list fallback in the layer
   pane, copy pass, a11y audit fixes from real-device testing.

Estimated shape: no PR touches more than ~10 files; PR-3 and PR-5 are the
only ones touching `AppMap.tsx`, in separate small seams.

## 14. Risks and open product decisions

1. **Moderation posture.** Publish-first + owner alert is right for ~50
   testers; it needs a stated flip-trigger (e.g., >200 WAU or first abuse
   incident → new-device pings start at `pending` until 1 verified ping).
   OWNER CALL.
2. **Layer default.** Pings layer ON by default at beta (visibility feeds
   the loop) vs OFF (map calm). Recommended: ON during beta, revisit at
   launch. OWNER CALL.
3. **"Parking available" positivity risk.** Positive signals decay fast
   and can strand someone; 20-min TTL mitigates but consider launching
   parking as full-only. LEANING: ship `parking/full` only in MVP.
4. **Anonymous device identity is spoofable.** Accepted for MVP (it's a
   dedupe hint, enforcement is IP-based). The clean upgrade is binding
   pings to accounts once login has a reason to exist — Pings itself may
   BE that reason (points sync). Phase 2.
5. **Naming residue.** The DB table stays `community_reports` (rename =
   churn with zero user value). Code-level alias `pings/*` owns the new
   language. Confirm acceptable.
6. **Proximity evidence.** Storing even a coarse reporter-distance band
   is a privacy tradeoff; MVP can compute it transiently for the Likely
   label and store nothing. Recommended: store nothing. OWNER CALL.
7. **List fallback surface.** A "Pings nearby" list (a11y + no-map path)
   — in the dock layer pane (recommended, small) vs a route. Small either
   way; pick in PR-7.
8. **Event-status pings** need an event picker when not deep-linked from
   an event card — the only type with real UI complexity. Option: MVP
   ships it only as point-anchored with a note, full event-anchor arrives
   with the event-card integration. LEANING: defer event anchoring.
9. **KV dependency.** All rate limiting rides on the Upstash wiring
   (audit item #1, still open as of this doc). PR-0 is a hard
   prerequisite — without it the write path ships with paper shields.
10. **Legacy data.** Existing `community_reports` rows (2 today) simply
    appear as pings of legacy categories; the old 4-category taxonomy
    stays valid read-side. No backfill needed.

---

*Prepared in the `claude/radius-pings` worktree at `4bb6219e`. No
implementation has begun. Awaiting explicit batch approval per the
Phase 1 contract.*
