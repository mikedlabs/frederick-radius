# Vision Traceability — did it make it into the app?

> Mike's question, answered straight: of everything you asked for — your
> own words, the off-the-cuff vision, and every reviewer's feedback — what
> actually got built, what's half-there, and what got lost. Verified
> against the real code on 2026-05-30 (B7 re-verified 2026-06-03), not
> from memory. No spin.
>
> **Legend:** ✅ DONE (live) · 🟡 PARTIAL (started, not fully there) ·
> ❌ MISSING (talked about, never built) · ⏳ BLOCKED (built, waiting on data/key)

---

## A. The core thesis — "answer engine, not a directory"

| # | What you asked for | Status | Reality |
|---|---|---|---|
| A1 | Lead with "what's the move," not a list | ✅ | Command center + Move Stack on /today |
| A2 | "Here is your next move," not "here is Frederick County" | 🟡 | Today does it; Places/Events still open with scale |
| A3 | Two users (visitor decided / undecided resident) | ✅ | Persona system, mode-aware ordering |
| A4 | Surface buried info in ≤2 taps (restaurant tonight, recycling, movie times) | 🟡 | Quick-answers in search; civic stripped; but venue/business data ⏳ empty |
| A5 | Don't shovel people into a Google Map | ✅ | WithinReach outcomes, not raw pins |

## B. The map — the flagship

| # | What you asked for | Status | Reality |
|---|---|---|---|
| B1 | Pinpoint-first, don't dump 1,700 pins | ✅ | Capped to best ~18; pinpointDefault |
| B2 | "Outcomes not counts" (reach coffee in 4 min) | ✅ | WithinReach strip |
| B3 | Clean, editorial map (not a Mapbox demo) | ✅ | light-v11 base, swarm killed |
| B4 | Map Modes / smart presets instead of endless filters | 🟡 | MAP_MODES exist; not reframed as human "jobs" (Coffee run, Kill an hour) |
| B5 | The slider as a big, beautiful HERO control w/ live feedback | ❌ | Slider works but is utilitarian, not the hero |
| B6 | Living "Radius" visual language — rings, pulse, range | 🟡 | **Just shipped** ripple+breathe on center marker; not yet the slider/whole-system |
| B7 | Custom category pins + beautiful "you are here" marker | ✅ | Category-colored canvas pucks w/ bespoke per-bucket icons (categoryMarkers.ts), rendered by the curated/OSM icon layers; center marker alive |
| B8 | Pin → card connection (tap pin, tethered card) | ❌ | Popup exists, no visual tether |
| B9 | Consolidate two maps (Browse vs Radius) into one | ❌ | Still two modes behind a toggle |
| B10 | "I'm here now" one-tap mode | ❌ | Never built |

## C. Today — the command center

| # | What you asked for | Status | Reality |
|---|---|---|---|
| C1 | Compact/dense, not spread out; use the 9:16 canvas | 🟡 | Better; still a long page below the fold |
| C2 | Lead with weather + one useful sentence + best move | ✅ | TodayCard + TodayMoves |
| C3 | Progressive disclosure (hide until wanted) | 🟡 | Some sections collapse; not all |
| C4 | Deck/wallet card depth | ✅ | .deck-card |
| C5 | Bento weather (variable-size boxes) | ✅ | WeatherMoreGrid masonry |
| C6 | Consistent fonts / weight discipline | ✅ | Type scale + weight rule |
| C7 | Move Stack ("your next 90 minutes") | ✅ | buildMoveStack |

## D. Events

| # | What you asked for | Status | Reality |
|---|---|---|---|
| D1 | Separate civic/municipal from the fun feed | ✅ | Collapsed "Official calendars" lane |
| D2 | Tiers: Featured / Tonight / Weekend by vibe | 🟡 | Featured + horizon groups; not vibe-lanes (Free/Family/Live) |
| D3 | Event cards TIME-FIRST (huge time, title secondary) | ❌ | Time is present but the title is still the dominant element |
| D4 | Real venue lineups (Banyan, Weinberg, Sky Stage…) | ⏳ | Agent built; data empty pending key |

## E. Places

| # | What you asked for | Status | Reality |
|---|---|---|---|
| E1 | Intent-first ("start with what you need") above categories | ✅ | Human-intent rail leads; category/town below |
| E2 | Town cards feel alive (count, events, a featured move) | ❌ | Towns are a plain list, not rich cards |
| E3 | Situational layers (date night, rainy day, good walk, open late) | ❌ | Only the basic intent rail; no situational layer |

## F. The data moat (the differentiator)

| # | What you asked for | Status | Reality |
|---|---|---|---|
| F1 | Agents scrape buried data (gov, venues, food trucks) | ✅ | 4 agents built |
| F2 | Happy hours, "known for," what people like — on the page | 🟡/⏳ | BusinessExtrasCard UI shipped; known-for only 5 seeds; data ⏳ pending key |
| F3 | 12-municipality parity (same treatment as the City) | ⏳ | URLs wired for 11 towns; data empty pending key |
| F4 | Food trucks (DFP Instagram/FB) | ❌ | Needs partnership/human path, not built |
| F5 | "Radius stories" — short visual local context, soul | ❌ | Never built |

## G. Feel / motion / craft (what felt "missing")

| # | What you asked for | Status | Reality |
|---|---|---|---|
| G1 | Subtle tasteful animation, human/lifelike feel | 🟡 | **Just started** — breathe-in stagger + living radius |
| G2 | Cards breathe in / arrive with intention | ✅ | stagger-children on /today |
| G3 | Cinematic transitions between pages/states | ❌ | Only basic view-transition fade |
| G4 | Tactile, springy touch on every tap/toggle | 🟡 | Press states exist; not a unified spring system |
| G5 | "Wow, I can't believe this is a web app" polish | 🟡 | Closer; not there yet |

## H. Follow / notify / retention

| # | What you asked for | Status | Reality |
|---|---|---|---|
| H1 | Follow places/towns/categories without social-feed chaos | 🟡 | Follows table + My Radius exist (places only) |
| H2 | "Tell me when there's live music downtown / events in Brunswick" | ❌ | Push backend built; this loop never surfaced |

## I. Foundation (security / perf / architecture)

| # | What you asked for | Status | Reality |
|---|---|---|---|
| I1 | Protect dataset + user data, no amateur mistakes | ✅ | RLS migration, headers, audit |
| I2 | Faster, snappier, smoother | ✅ | Lighthouse 88–90, streaming, TTI 3.7s |
| I3 | CI / quality gate | ✅ | ci.yml typecheck+lint+test+build |

---

## The honest summary

**What's genuinely DONE:** the thesis, the foundation (security/perf/CI),
the core of Today, the map's "outcomes not counts," intent-first Places,
civic separation, and the start of the motion layer.

**The biggest things still MISSING (your "lost in translation" list):**
- **B5/B6 — the map's living, tactile soul** (hero slider, full Radius
  motion system). Just started; this is the flagship feel. *(B7 custom
  pins now shipped — ✅ above.)*
- **B10 — "I'm here now" one-tap mode.** Never built. High emotional payoff.
- **D3 — time-first event cards.** A clear reviewer ask, not done.
- **E2/E3 — alive town cards + situational layers** (date night, rainy day).
- **F5 — "Radius stories"** (the soul / local context).
- **G3/G4 — cinematic transitions + unified springy touch.**
- **H2 — the follow→notify loop** (built backend, never surfaced).

**Waiting on the API key (⏳), not missing:** real venue lineups, happy
hours, known-for, 12-town civic data. The UI is built; the data is dark.

None of this was thrown away — but a real cluster of the *feel* and
*delight* items (the map soul, motion, stories, "I'm here now") got
deferred behind structure, which is exactly what you sensed.
