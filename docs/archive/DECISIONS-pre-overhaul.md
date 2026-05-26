# Decisions

Structural decisions and reasoning. One entry per decision. Newest first.

## 2026-05-18: Activate transit_gtfs (PROPOSAL, owner flips the row)

Brief reference: external-audit-actions section 7.3. The
`transit_gtfs` row already exists at `status: pending_approval`; this
PR does not touch it. It stages the schema and transform so the owner
can flip the row in one step.

What is staged. `schemas/fc_transit_gtfs.json`,
`pipeline/schemas_ts/fc_transit_gtfs.ts`,
`transforms/fc_transit_gtfs.ts` (bus routes plus county-validated
stops), and a Vitest fixture. The row, the url, and the license
(public, Frederick County) are unchanged.

Why activate. The /transit surface today links out to a county PDF.
The north-star rule is to bring civic data in, never bounce out. Static
GTFS gives nine bus routes and their stops as first-class in-app data,
mappable on the same spine as every other place. It is free, public,
no key.

Activation steps. Flip `status` to `active`, set `schema_file` to
`schemas/fc_transit_gtfs.json` and `transform_file` to
`transforms/fc_transit_gtfs.ts`, and the weekly cadence runs. The
transform already drops out-of-county or coordinate-less stops, so a
bad GTFS row cannot place a phantom stop. Recommendation: activate.
Decision deferred to the owner.

## 2026-05-18: cof_parking_occupancy (PROPOSAL, blocked on two gates)

Brief reference: external-audit-actions section 7.2. Added as
`pending_review`, not `pending_approval`, because two real-world
questions are unresolved and must not be guessed.

What is staged. A `cof_parking_occupancy` row (status pending_review,
url null on purpose), `schemas/cof_parking_occupancy.json` and
`pipeline/schemas_ts/cof_parking_occupancy.ts` and
`transforms/cof_parking_occupancy.ts` all marked SCAFFOLD, and a Vitest
fixture. The transform is defensive: it derives the missing one of
available/occupied from capacity and otherwise leaves counts null.

Why it is worth doing. Friday and Saturday night downtown parking is a
genuine resident and visitor pain point. Live deck counts for Court
Street, Carroll Creek, and West Patrick would be a high-value Today and
Radius signal, and it is the kind of civic-layer data the north-star
says to bring in rather than bounce out.

The two gates, unresolved here by design. (1) Endpoint: a
machine-readable live-occupancy feed is not confirmed. The public
parking page exists; a documented API does not. No URL was invented;
`url` is null. (2) License: redistributing live counts needs the city's
confirmation. Recommendation: a maintainer confirms the endpoint and
the license with the City of Frederick before anything is activated.
Until then this stays pending_review. Decision and the real-world
confirmation are the owner's.

## 2026-05-18: Activate usda_farmers_markets (PROPOSAL, owner flips it)

Brief reference: external-audit-actions section 7.4. The
`usda_farmers_markets` row already exists at `status: pending_approval`
and is not modified here.

What is staged. `schemas/usda_farmers_markets.json`,
`pipeline/schemas_ts/usda_farmers_markets.ts`,
`transforms/usda_farmers_markets.ts` (county-scoped, drops any market
outside the Frederick bbox, never relocates one), and a Vitest fixture.

Seam confirmed. `src/lib/connect.ts` already exposes the typed seam:
`GatedFeeds.farmersMarkets: PlaceCardData[]` and `nearbyNow` returns
`feeds: { farmersMarkets: [], specials: [] }`. The seam is empty by
design until an active source and a transform land, so activation is a
mapping step, not new plumbing.

Why activate. A queryable national directory with lat/long radius is
the authoritative spine for the "find all the farmers markets" ask.
Season and hours text drive a real Live-Now open/closed signal.

Activation steps and gate. The USDA API needs a free API key, so
activation is owner-gated on obtaining the key. Then flip `status` to
`active`, set `schema_file` and `transform_file` to the staged paths,
map the transform output into `connect.ts` `feeds.farmersMarkets`, and
cross-check coverage against `md_farmers_markets`. Recommendation:
activate once the key is in hand. Decision deferred to the owner.

## 2026-05-18: Activate kfdk_metars (PROPOSAL, owner flips the row)

Brief reference: external-audit-actions section 7.1. Per AGENTS.md
agents propose and humans activate. The row is added at
`status: pending_approval`; the daily worker only fetches `active`, so
nothing is fetched until the owner flips it.

What is staged. `data/sources.yaml` row `kfdk_metars`,
`schemas/kfdk_metars.json`, `pipeline/schemas_ts/kfdk_metars.ts` (zod
validator), `transforms/kfdk_metars.ts`, and a Vitest fixture
(`tests/kfdk-metars.spec.ts`). The source is the NOAA Aviation Weather
Center METAR JSON for KFDK: free, public domain, no key.

Why activate. Today the weather strip is the regional NWS point
forecast. KFDK is the downtown-adjacent field and reports a real
measured hourly observation (temperature, dewpoint, wind, altimeter,
derived flight category). Activating it gives the Today strip an actual
current observation instead of a forecast cell, which is the more
honest and more local signal.

Gate and activation steps. No license or partner gate (US federal open
data). To activate: set `status: active`, set `schema_file` and
`transform_file` to the staged paths, and let the hourly cadence run.
Recommendation: activate. Decision deferred to the owner.

## 2026-05-18: Resident/Visitor toggle, real fork or remove (OPEN, owner call)

Brief reference: external-audit-actions section 6.1. Per AGENTS.md an
agent does not make this call. This entry states options, tradeoffs,
estimates, and a recommendation, then stops. Nothing is implemented.

Current state, verified in code. `src/hooks/useMode.ts` already persists
the choice to localStorage (`fr:mode:v1`, default resident), so "persist
in user prefs" is not a cost in either option. `TodayTabs.tsx` defines
one `TAB_ORDER` map that reorders the same five tabs (tonight, weekend,
family, walkable, open-now). The data, the cards, and the panels are
identical in both modes. The only content that changes by mode is the
heading ("What to see" vs "What to do"), a one-line subtitle, and the
`ModeAwareCta` and `ModeLead` blocks at the top of `/today`.
north-star.md names dual resident/visitor mode as one of three
defensible pillars and frames Visit Frederick as visitor-only, so the
differentiator is serving both audiences. The current toggle reorders.
It does not fork. The implementation underdelivers the thesis, as the
brief states.

Option A, real fork. Each mode leads with its own composition and its
own focal element. Resident lead: Pulse (live, /pulse exists), Transit
(/transit exists), 311 reports (SeeClickFix, county-scoped after PR
#95), Saved (/saved exists), Trash and recycling day (no source in the
repo today), School status (no source in the repo today). Visitor lead:
Open Now (exists, with the honest HOURS_GATE caveat at the current
verified-hours coverage), Walkable (exists), Tonight (exists), Parking
(City of Frederick deck occupancy is a pending source, brief Batch 4.2),
Top Picks (exists as featured and family picks). The toggle already
persists, so only the per-mode section list and focal element are new.
Honest dependency: three named surfaces (Trash and recycling, School
status, Parking occupancy) have no data source wired today. A front-end
fork that defers those three to their data-source phases is roughly a
two-week build: compose two mode layouts from existing loaders, one
focal element per mode, tests, and a 375px pass. Including the three new
feeds is not a two-week job and is not all front-end. It is source
integration that belongs in Batch 4 sequencing.

Option B, remove. Drop `ModeToggle`, delete `TAB_ORDER` and the mode
reorder in `TodayTabs`, collapse `ModeAwareCta` and `ModeLead` into one
clear headline, and reclaim the space. `useMode` stays only if another
surface reads it; the consumers today are ModeToggle, TodayTabs,
ModeAwareCta, and ModeLead. Estimate: two to three days, low risk. Cost:
this removes the only visible expression of a stated north-star pillar.

Recommendation (advisory, not a decision). Take a scoped Option A: ship
the real fork using only surfaces that already exist (Resident: Pulse,
Transit, 311, Saved; Visitor: Open Now, Walkable, Tonight, Top Picks),
each mode with its own focal element, and defer Trash, School status,
and Parking to their Batch 4 data phases. This delivers the thesis at
the two-week cost without blocking on unbuilt feeds. Option B is the
right call only if the owner judges the dual-mode pillar not worth the
home-screen surface area. Decision deferred to the owner. Do not
implement either option until approved.

## 2026-05-18: Radius as the primary action on /today (OPEN, owner call)

Brief reference: external-audit-actions section 6.2. Proposal only.
Nothing is implemented.

Current state, verified in code. `/today` is the home. The section order
today is CivicAlerts, SkyHero (AdaptiveGreeting, ModeAwareCta),
ModeLead, weather and air quality, LiveActivityPill, featured, the
Explore hub, then the tabs. Radius is one entry among many and also a
full route at `/radius`. The product is named after the radius
interaction and north-star calls it the signature.

Premise correction (verify before trust, the same class as the 4.1 slug
and the 4.4 baseline). The brief states "the radius interaction imports
the full map; the compact hero must not." That is not accurate in this
codebase. `src/components/radius/RadiusBuilder.tsx` is already map-free
and loader-free by design: it imports PlaceCard, geo math
(`minutesToMeters`, `haversineMeters`, `formatDistance`), categories,
and municipalities only, with type-only loader imports and
server-decorated props documented in its own header comment.
`/radius/page.tsx` decorates places server-side to keep the roughly 12MB
enrichment JSON out of the client bundle. There is no Mapbox or
react-map-gl import on the radius path. A compact hero that reuses the
same pure geo helpers carries zero map weight by construction. The
bundle risk the brief raises is already solved upstream.

Proposal. The top of `/today` on mobile becomes a compact radius hero: a
center selector, a mode chip (walk, bike, drive), a distance slider, an
inline result count, and a one-tap expand to the full `/radius` surface.
Weather, civic alerts, and the Explore hub move below it.

Estimated client weight. The hero adds a slider and a count to logic
that already exists. Geo math is already in the bundle via the radius
route pattern, and the lucide icons are shared. No map, no enrichment
JSON, no new heavy dependency. Order of magnitude: a few KB of component
code, not the hundreds of KB a map would cost. Any future map stays
behind the `/radius` expand and behind the existing server-decoration
discipline.

Paste-able sketch (illustrative, not implemented, ui primitives and
tokens, no em dashes in copy):

```tsx
// src/components/today/RadiusHero.tsx  (SKETCH, owner approval required)
"use client";
import { useState } from "react";
import Link from "next/link";
import { Footprints, Bike, Car, ChevronRight } from "lucide-react";
import { minutesToMeters } from "@/lib/geo";

const MODES = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "bike", label: "Bike", icon: Bike },
  { key: "drive", label: "Drive", icon: Car },
] as const;

export default function RadiusHero({
  resultCount,
}: {
  resultCount: (meters: number) => number;
}) {
  const [center, setCenter] = useState("Downtown Frederick");
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("walk");
  const [minutes, setMinutes] = useState(15);
  const count = resultCount(minutesToMeters(minutes, mode));
  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <p
        className="text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Signature interaction
      </p>
      <select
        aria-label="Center point"
        value={center}
        onChange={(e) => setCenter(e.target.value)}
        className="mt-1 w-full bg-transparent text-lg font-semibold tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        <option>Downtown Frederick</option>
        {/* all 12 municipalities, Frederick first */}
      </select>
      <div className="mt-3 flex items-center gap-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          const on = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: on ? "var(--app-brand)" : "transparent",
                color: on ? "white" : "var(--app-ink-2)",
                borderColor: on ? "var(--app-brand)" : "var(--app-border)",
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>
      <input
        type="range"
        min={5}
        max={30}
        step={5}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        aria-label="Distance in minutes"
        className="mt-3 w-full"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          {count} places within {minutes} min
        </span>
        <Link
          href="/radius"
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--app-brand)" }}
        >
          Open full radius
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
```

The `resultCount` prop is computed server-side on `/today` from the same
decorated public place set the route already loads, so the hero stays
loader-free and map-free, consistent with the radius route discipline.

Recommendation (advisory, not a decision). Adopt the compact radius
hero. The premise correction makes it cheaper and lower risk than the
brief assumed: the signature interaction is already a pure computation,
so leading with it on the home screen is mostly a layout change and a
server-side count, not a bundle problem. Keep the full `/radius` route
as the expand target. Decision deferred to the owner. Do not implement
until approved.

## 2026-05-16: Data-quality flags flipped to default ON ("ship everything")

The owner directed shipping everything after a long period in which
correct, tested data-quality work was built behind flags that defaulted
off and the flip was deferred each time. That deferral loop became the
problem: the live site did not reflect the work.

Decision: invert the defaults for the proven flags so the work is
active in production without a Vercel env change: RADIUS_DEDUPE,
RADIUS_EVENT_NOISE_FILTER, RADIUS_EVENTS_BY_TOWN, and HOURS_GATE now
read `!== "0"` (default on). Each keeps an escape hatch: set the env
var to "0" for an instant, code-free rollback. This reverses the
earlier "flags default off equals today's production is the rollback
path" posture, which was prudent but had compounded.

Consequence to note honestly: at today's roughly 3.6 percent
verified-hours coverage, HOURS_GATE on hides the Open-now affordance
widely in favor of an honest message. That is the trustworthy behavior
the data-layer brief asked for, and it is reversible with HOURS_GATE=0.
RADIUS_OBDB stays off because the brewery source is not yet surfaced;
flipping it would change nothing visible.

## 2026-05-16: Mapbox funded, map migrated MapLibre to Mapbox GL

The owner funded a Mapbox account and provided a public token, reversing
the earlier "Mapbox deferred" ruling. This is the P1 audit-remediation
foundation: P1-1 static placeholder, P1-3 isochrone, P2-1 Studio style,
P2-5 search box, and P3-3 directions all require Mapbox.

Changes: react-map-gl swapped from the maplibre entrypoint to the mapbox
entrypoint; mapbox-gl added; AppMap and PlaceMiniMapInner pass
mapboxAccessToken from NEXT_PUBLIC_MAPBOX_TOKEN. Interim base style is
mapbox://styles/mapbox/dark-v11, which aligns with the System Black brand
target; the custom Frederick Radius Studio style is P2-1, an owner-only
manual workflow whose published URL replaces the interim style when
ready. applyFrederickPalette is Positron-specific and now no-ops safely
on the Mapbox style (it iterates existing layers with guarded writes).
categoryMarkers re-adds its runtime icon images on style.load because
Mapbox loads its style asynchronously after onLoad, unlike OpenFreeMap.

Verified: tsc, vitest, node:test, and a browser screenshot showing the
dark base with category pins rendering. The transient styleimagemissing
warnings during first paint are the original code's documented one-frame
flash, mitigated by the style.load re-add, not a functional defect.

## 2026-05-16 — Stack ruling made: proceed on MapLibre, Mapbox deferred

The Checkpoint 1 stack question went unanswered across three requests
while the directive each time was maximum visual impact. Mapbox plus
Mapbox Studio cannot be built without a paid account and a manual Studio
workflow that only the owner can create, so waiting blocks all visual
progress indefinitely.

Decision: proceed on MapLibre and OpenFreeMap and push them to their
visual ceiling (custom style overrides, terrain and hillshade where the
free tiles allow, refined palette, motion). This is reversible. If
Mapbox is funded later, the style work ports and the migration is its
own phase. Reasoning: a perfectly good free path exists, and an
unanswered decision should not freeze the product's biggest visual win
forever. Recorded as a deviation per the brief.

## 2026-05-16 — Admin review decisions persist as committed JSON, not runtime writes

Vercel serverless storage is read-only at request time. An /admin route
cannot write a decisions file that survives. Rather than ship a writer
that fails silently in production, the admin tooling is a review surface.
Dedup overrides live in `src/data/dedup-decisions.json` and copy
rewrites in `src/data/copy-overrides.json`. They are committed and
applied by `npm run dedup` and `npm run copy:scores`. The nightly cron
recomputes and reports the numbers; it does not persist artifacts.

Reasoning: this matches how every place, enrichment, and dedup record
is already persisted in this codebase. A future phase may add a Supabase
table for live editorial workflow, which is an additive change recorded
here when made.

## 2026-05-16 — Map stack stays MapLibre and OpenFreeMap until a Phase 3 ruling

The brief's canonical stack names Mapbox GL JS, a custom Mapbox Studio style, and deck.gl. The repository runs MapLibre GL 5.24, react-map-gl 8.1, and OpenFreeMap Positron tiles, with a runtime palette override. Mapbox and deck.gl are absent.

Decision: keep MapLibre and OpenFreeMap for Phase 1 and Phase 2. Phase 1 is data quality with no visual work, so the map vendor is irrelevant to it. The Mapbox migration is a funded, key-gated, manual Studio workflow and a strategic call. It is recorded here as OPEN and must be ruled at the Phase 3 checkpoint before any Phase 3 map work begins.

Reasoning: migrating the map vendor speculatively would burn budget and time before the data spine is fixed, which the brief's anti-pattern 13 forbids in spirit. Deferring costs nothing because no Phase 1 or Phase 2 work depends on it.

## 2026-05-16 — Paid API keys deferred to their gating phases

PredictHQ, Algolia or Typesense, Stripe, Twilio, SafeGraph or Placer, Cloudinary or Imgix, Geocodio, Google Civic Information, Open States, Eventbrite, Ticketmaster, and Bandsintown are not present.

Decision: none are required for Phase 1. Each is requested at the start of the phase that needs it, per working rule 4. Status tracked in INTEGRATIONS.md as that file is built out.

## 2026-05-16 — CMS choice deferred to Phase 1 close or Phase 2

The brief asks to choose Sanity or Payload in Phase 1. Editorial copy infrastructure in Phase 1 (the copy-review tooling) can be built against the existing static data and a new Supabase table without committing to a CMS yet.

Decision: defer the Sanity vs Payload choice until the copy-review tooling shape is known. Record the choice here when made. Reasoning: choosing a CMS before the editorial workflow is designed risks a wrong fit.

## 2026-05-16 — Deploy of the 14 unpushed commits is the user's call

Local main is ahead of origin by 14 commits, including this session's work. Pushing and deploying is a shared, hard-to-reverse action.

Decision: do not push without an explicit instruction. Surface the need at Checkpoint 2, since Phase 1 results are invisible in production until the tree ships. Reasoning: deploy timing is an owner decision, not an engineering default.
