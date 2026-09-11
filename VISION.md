# Frederick Radius — The Vision

> What this is, why the foundation can carry it, the universe of what it
> becomes, and the honest unlocks between here and there. Companion to
> `docs/NORTH_STAR.md` (the laws) and `UX_REDO.md` (the build plan).
>
> Last updated: 2026-06-01.

---

## The one idea

**Frederick Radius is the local intelligence layer for a county — answers,
not listings.** Not a directory, not "Yelp for Frederick," not a city
portal. A knowledgeable local in your pocket: you arrive with a need, it
gets you to the answer in a tap or two, and it knows the things that are
buried everywhere else.

The shape:
- **The funnel is the front door** — "what are you after?" → narrow → the answer.
- **The civic moat is why you stay** — the buried answers Google can't give.
- **The data agents are the engine** — they un-bury, with source + freshness.
- **AI is the voice, the radius is the signature.**

## Why the foundation can carry it (the stack is genuinely top-tier)

This is not a prototype stack. It is what most local apps never reach for:
- **Next.js 16 + React 19** — RSC, streaming, View Transitions (on), React
  Compiler (in the build), ISR everywhere. PPR + `"use cache"` available.
- **Mapbox GL** real maps · **Framer Motion** real motion · **Vaul / cmdk /
  nuqs / Sonner** modern interaction primitives.
- **Supabase + Drizzle + PostGIS** (auth + geo) · **Sentry + Plausible +
  Speed Insights** (observability) · **PWA** (manifest, service worker,
  web-push) — installable, works offline in the park.
- **The Vercel AI SDK + the ingest agents** (feed → image → render → Claude
  vision) — the rare one. Most apps scrape; this has a data-acquisition
  platform.

The gap is not the tools. It is that we are early in *using* them.

## The universe of what it becomes

### The civic moat — indispensable (what Google can't do)
Trash / recycling / yard-waste by address · parking availability + rules ·
report-an-issue (SeeClickFix) · public-meeting agendas + "what's the vote" ·
permits + "who do I call" · MARC / TransIT real-time · outages · river /
flood gauges · air quality · voting · school closings.

### The visitor wow — word of mouth
Auto-built itineraries ("a perfect Saturday downtown") · the within-reach
radius instrument (walk / bike / drive) · event hubs (First Saturday, Alive
@ Five, In the Streets) · self-guided history / mural / ghost walks · the
Beverage Trail passport · seasonal (Catoctin foliage, holiday lights,
markets).

### Local life — the habit
Follow places / towns → smart notify · "new here?" mover onboarding · build
+ share a night out · deals / happy-hours · community + business submissions
(events, food trucks, specials) — a supply side that keeps data fresh.

### The brain — hyperlocal intelligence
A grounded **"ask Frederick" AI concierge** (natural language → a real
answer from our data, never invented) · open-now + weather-aware suggestions
· quality-scored ranking · behavior-driven personalization.

### The soul — identity
"Radius stories" (short visual local context) · 12-town parity (Brunswick,
Thurmont, Middletown…) · the living radius + daypart sky as the brand.

## The bigger idea (why this is just the start)

It is **uniquely Frederick** — the rhythm, the towns, Carroll Creek, First
Saturday — *and* architecturally **replicable**. Config + ingest agents mean
the same engine could become the intelligence layer for any county.
**Frederick is the proof; the platform is the idea.**

## The honest unlocks (demo → the real thing)

Most of the leap is not more code. It is three things:
1. **Eyes.** Confirm + tune the experience on a real device (we've built the
   funnel front door largely without seeing it render).
2. **Keys.** Set the dormant API keys (Ticketmaster, Bandsintown, AirNow,
   NPS, the AI key) — coded, just dark.
3. **Data + partnerships.** A civic data source (County / City GIS, the
   collection-day tool, MTA GTFS) and relationships (City, DFP, Visit
   Frederick, FCPL) — the moat is mostly acquisition, not engineering.

## Status (built so far)

The answer-first **funnel is the front door** (`/guide`): intent → narrow →
ranked answers, with **situational lenses** (find by the moment),
**open-now + nearest** ranking, a transparent **quality_score**, and a
premium motion layer. The docs (North Star, UX_REDO, this) hold the plan.
Next: the design-system sweep, the AI concierge, and the civic moat.
