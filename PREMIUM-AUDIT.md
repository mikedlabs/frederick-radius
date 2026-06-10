# Frederick Radius Premium Overhaul: Phase 0 Audit

This is the Phase 0 deliverable for the Premium Overhaul brief. It is
named PREMIUM-AUDIT.md so it does not clobber the existing living
AUDIT.md. No em dashes are used, per the brief.

Date: 2026-06-10. Method: three parallel read-only workstreams against
production (main), plus before screenshots at 390px and 1440px in
`design-log/before/`. No code changed in this phase.

## Headline reframe (read this first)

This brief describes a version of the app that is roughly two weeks old.
The session that precedes this brief shipped about 40 fixes, and the
audit confirms that most of the brief's stated defects are already
resolved on production:

- No duplicate Events link in navigation. Events appears once (BottomNav).
- No dead links and no soft 404 reachable from navigation.
- Cards do not show "Hours not posted." PlaceStatus renders nothing when
  hours are unverified or unknown. Silence is already the policy.
- Event times already render in America/New_York (verified in JSON-LD,
  17:00-04:00 for a known event).
- Em dashes were swept from user copy, and cleanFeedText converts feed em
  dashes to commas.

What this means: the overhaul should not re-fix dead links, duplicate
nav, hours text, times, or copy that are already clean. It should spend
effort on what is genuinely still weak: density on the home surface, the
component system, purposeful motion, and the one visible feature that
does not work.

## 0.1 Interaction inventory

The home surface is over-dense. /guide presents 22 or more interactive
targets above the fold at 390px. The brief's target is eight or fewer.

- TopBar: search pill, settings, more, wordmark home (4).
- BottomNav: Ask, Today, Map, Events, Saved (5).
- FunnelFlow intent step: search pill (1), six intent tiles, five lens
  pills, the town door (13).

The two nav clusters (9) are reasonable. The density problem is the
funnel step stacking 13 in-page choices. That is the declutter target.

Card anatomy (PlaceCard, five variants): category mark, name, category
label, known-for line, distance, status line (only when real), save
button. No numbered markers on the default rails. The card is already
lean. The opportunity is collapsing five variants toward fewer.

## 0.2 Unused-asset, Ask, and hours

Ask Radius is configured but dark on production. Entry point: TodayAsk on
/today (not on /guide). With no model key visible to the deployment,
/api/ask returns configured:false and the UI shows "The concierge is
warming up" plus real retrieved place cards. The grounded search half
works. Decision required: set a key (one env var, owner action, no code
change), or remove the TodayAsk entry point per the brief.

Hours and open-now: the data-health gate the brief asks for mostly
exists. PlaceStatus hides unverified status at the component level, and
HOURS_GATE hides the Open-now affordance when verified-hours coverage
drops below sixty percent. Roughly 75 percent of enriched places carry
hours. The reusable gate can be formalized as one small wrapper, but the
behavior is already correct.

Orphaned code (delete candidates): CreekHairline (zero imports),
AdaptiveGreeting (parked), and several env-gated-off integrations
(Ticketmaster, Bandsintown, DFP iCal, Open Brewery DB, Vercel KV rate
limiting, by-town events). Each gets a verdict in DECISIONS.md in Phase 4.

## 0.3 Photo manifest

Towns are not individually photographed. All twelve municipality pages
render the same county-wide seasonal photo, rotated by date, from a pool
of 108 images. Aerial drone shots cover only downtown Frederick.
Therefore the brief's Phase 5 (audit twelve town heroes for accuracy)
does not apply as written: there is no per-town hero that can be wrong.

The real photo question is places. Roughly 3,009 places carry a permanent
Vercel Blob hero photo. The rest fall to a Google Places proxy photo or
to the designed gradient plate. Hundreds land on the plate. That is the
photo gap worth a Phase 5 pass: place photo coverage, plus optionally
mapping the owner's geotagged drone library to give towns real per-town
heroes.

## Revised phase plan

Phase 1 tokens and component consolidation: applies as written, high
value. Phase 2 declutter: scoped to the funnel density and progressive
disclosure, not to fixing nav defects that are gone. Phase 3 motion
(GSAP): the real premium lever. Phase 4 reintegrate: the Ask decision
plus the flag verdicts. Phase 5 photo: re-scoped from town accuracy to
place coverage and optional town photography. Phase 6 verification:
applies as written.
