# Frederick Radius — Audit

**Last walked:** 2026-05-26 by the dev team during the Phase 1 doc refresh.
**Source of truth status:** living document. Update when state changes. Older audits live in `docs/archive/`.

This is an honest read of the live app — not the brief, not the strategy — what an actual user touches today. Three columns:

- ✅ **Works** — ships value, no known issue
- 🟡 **Half-working** — ships but is incomplete, brittle, or has a known papering-over
- 🔴 **Broken or unbuilt** — claimed somewhere (route exists, type union mentions it) but doesn't deliver

---

## Primary nav (4 tabs)

| Route | Status | Notes |
|---|---|---|
| `/now` | ✅ | WeatherHero + RightNowStrip (3 daypart-aware picks, daily rotation) + MoodTiles + TimeToggle-scoped events shelf. 4-section spine. |
| `/browse` | ✅ | Map with category-color clustered pins. Layers drawer for civic/transit/trails/amenities. Pin-tap → BottomDrawer with place. |
| `/events` | 🟡 | WeekStrip · TonightRail · CategoryJumpTiles · EventsExplorer (lens chips + facets + Vaul filter drawer). Half-working because live feeds are short (see *Live feeds*). |
| `/saved` | ✅ | Bookmarks + Recently viewed. localStorage-backed. Smart "dominant town" suggestion when ≥3 saves cluster. |

## Spatial detail routes

| Route | Status | Notes |
|---|---|---|
| `/radius` | ✅ | RadiusBuilder — point + reach mode + isochrone overlay. Reachable as deep link; no longer a bottom-nav tab (PR #259). |
| `/places/[slug]` | ✅ | Full place detail. Open-now-aware hours. Photos. Nearby. Upcoming events at the venue. JSON-LD. |
| `/places` | 🟡 | Directory index. Lists category + town tiles. Works but is the *one* surface that doesn't fully embrace the post-overhaul card system. |
| `/category/[slug]` | ✅ | Top-N places in one category, county-wide. |
| `/m/[slug]` | ✅ | Town page — 3-answer spine (hero · top 8 places · upcoming events) per PR #260. |

## Time/event detail routes

| Route | Status | Notes |
|---|---|---|
| `/events/[slug]` | ✅ | Event detail. Hero · description · before/after picks · parking nearby · venue place card. |
| `/events/calendar` | ✅ | Month grid with density dots, weekend column tint, today bar. |

## Editorial sub-routes (the "field guide" surfaces)

| Route | Status | Notes |
|---|---|---|
| `/parks` | 🟡 | Editorial parks list. Reachable via direct URL; not surfaced from /now or /browse strongly enough — this is part of why parks feel hidden. |
| `/trails` | 🟡 | Same shape as /parks. |
| `/trail` | 🟡 | The "Frederick Beverage Trail" (26 wineries/breweries/distilleries). Standalone editorial page. |
| `/transit` | 🟡 | Transit overview. Status unclear how often the data is fresh. |
| `/water` | 🟡 | Rivers & streams. Editorial. |
| `/history` | 🟡 | County history overview. |
| `/from-above` | ✅ | The photo book product (separate but linked from /about). |
| `/pulse` | ✅ | Deep weather + civic snapshot. Reachable from WeatherHero tap. |
| `/discover` (retired) | ✅ | 301 redirects to /now. Per PR #259. |

## Meta + onboarding

| Route | Status | Notes |
|---|---|---|
| `/` | ✅ | Server redirect. New visitor → `/about`. Returning (cookie set) → `/now`. |
| `/welcome` | ✅ | 2-step onboarding: mood pick + live-here yes/no. PR #258. |
| `/about` | ✅ | 30-second pitch + 1 CTA + quiet /trust + /from-above links. PR #257. |
| `/trust` | ✅ | Data sources + verification commitments. |
| `/settings` | 🟡 | Mode toggle, home muni picker, interests editor, push opt-in. Some controls work; others (e.g. push enable) untested in prod. |
| `/search` | ✅ | One ranked list, type-chipped rows. PR #256. |

## Business / submit

| Route | Status | Notes |
|---|---|---|
| `/business/claim` | 🟡 | Claim form exists. Has the inputs. The submit handler writes to Postgres. **Untested end-to-end on prod** — claims aren't being reviewed yet. |
| `/business/manage/[token]` | 🔴 | Tokenized edit page. Wired but the email-the-token flow isn't actually firing (no SMTP integration). |
| `/submit/place` | 🟡 | Submit-a-place form. Same story: writes to DB, no review queue surfaced. |
| `/submit/event` | 🟡 | Same as /submit/place. |
| `/admin/*` | 🟡 | Admin dashboards exist (claims · data-health · drift-review · dedup-review · copy-review · discovered-review). Gated by Basic Auth via middleware. ADMIN_USER / ADMIN_PASSWORD env vars are the only gate — set them or `/admin` returns 401. |

## Live feeds

| Feed | Status | Coverage |
|---|---|---|
| Celebrate Frederick (iCal) | ✅ | Live, returning rows. |
| Frederick County RSS | ✅ | Live, but most rows are civic meetings → filtered out by default (PR #250). |
| Hood College Trumba | ✅ | Live. |
| Weinberg Center | 🔴 | Scaffolded (PR #265). Inert until `WEINBERG_CALENDAR_URL` env is set to a real iCal URL. Their site doesn't expose one at the obvious paths. |
| Delaplaine Arts Center | 🔴 | Same as Weinberg. Needs `DELAPLAINE_CALENDAR_URL`. |
| Ticketmaster | 🔴 | Inert. Needs `TICKETMASTER_API_KEY` (free key from developer.ticketmaster.com). |
| Bandsintown | 🔴 | Inert. Needs `BANDSINTOWN_APP_ID` **and** a curated artist list to query (not built). |
| NWS weather | ✅ | Forecasts + alerts. |
| Google Places enrichment | ✅ | 3,442 enriched records — 3,015 with photos, 2,598 with hours, 3,103 with ratings. |
| Mapbox isochrone | ✅ | Reach polygons on /radius. |

## Data sets in repo

| File | Size | Status |
|---|---|---|
| `places-enrichment.json` | 12 MB | ✅ Google Places data |
| `places-client.json` | 2.1 MB | ✅ Slim client-safe set used by SearchOverlay + CMDK |
| `places-discovered.json` | 625 KB | ✅ Discovered places from Google nearby search |
| `places-dfp.json` | 741 KB | ✅ Downtown Frederick Partnership scrape |
| `amenities.json` | 60 KB | ✅ 442 OSM amenities |
| `discovered-enriched.json` | 4.7 MB | 🟡 Candidates pending review |
| `places-dedup.json` | 14 KB | ✅ Active dedup decisions |
| `closures.json` | 613 B | ✅ Known-closed venues to suppress |

## Place coverage by category

```
wellness     281    shopping     244    restaurant   201    worship      172
park         146    civic         85    market        69    brewery       50
coffee        48    bakery        44    lodging       43    family        38
bar           34    gallery       32    services      32    music         29
museum        27    government    21    trail         20    library       18
```

1,725 places total across the public set.

## Components in active use

Server: WeatherHero · RightNowStrip · MoodTiles · TimeToggle · EventsExplorer · EventCard · PlaceCard · PlaceSheet · CategoryGraphic · AnimatedSkyGlyph · WeatherHourlyChart · WeeklyForecast · BottomNav · TopBar · ServiceWorkerRegister · CommandPalette · BottomDrawer · CivicAlerts · SkyHero · AdaptiveGreeting · ReasonChip · Saved/SavedList · SearchOverlay.

🟡 **Card variant sprawl** — PlaceCard alone has variants for tile · row · grid · feature. Two `Sheet` primitives exist (custom `Sheet.tsx` and `BottomDrawer.tsx` Vaul wrapper). Consolidation deferred to Phase 3.

## Known performance issues

| Issue | Impact |
|---|---|
| `/now` ranks 1,725 places at request time inside `RightNowStrip` picks | Cold first-byte ~600–800ms |
| Service worker caches aggressively | Stale UI between deploys until hard refresh |
| `/places/[slug]` ships the full 12 MB enrichment JSON via static import in some loaders | Big initial download on cold cache |
| `.next/static/css` not yet split per route | Whole CSS file loads on every page |
| Image `next/image` not used everywhere | Some `<img>` tags ship original-resolution photos |

## Known broken / nagging things

| Issue | Where | Status |
|---|---|---|
| `/m/[slug]` URLs include the legacy `[municipality]` param folder name | route works; folder rename pending | low priority |
| `feed-snapshots` table missing in dev DB | warns once per source per process (PR #248) | dev-only |
| `iki-extension` Chrome extension causes hydration warnings | `suppressHydrationWarning` mitigates (PR #248) | non-issue |
| Some `<a>` tags use raw `<img>` for Google photos | needs the domain allowlist dance for `next/image` | image perf hit |
| `/business/manage/[token]` token-via-email not sent | SMTP not configured | not yet built |

## What's NOT broken

- The data pipeline. ~$150 Google Places API spend is loaded and live.
- The map. Clusters, layers, popups all work.
- The civic alert system. NWS + NPS surface on /now top.
- Search (⌘K palette + /search results page).
- Photo handling for /places (loads from Google's CDN via the photo_names array).
- The brand book — color tokens, typography, motion vocab.
- The 4-tab IA. The architecture overhaul is complete; the polish work remains.

---

## What this audit says about the next 4 phases

- **Phase 2 (trust pass):** the loading / empty / error states are inconsistent. That's the lowest-hanging fruit for "feels reliable."
- **Phase 3 (premium cards & buttons):** the card variant sprawl + ad-hoc buttons need a real system. This is "feels premium."
- **Phase 4 (connectedness):** the editorial routes (parks, trails, transit, water, history) exist but aren't surfaced from /now or /browse. Linking them in is what makes the app feel like one connected field guide instead of a scattered set of pages.
- **Phase 5 (snappiness):** real Web Vitals measurement, image audit, RSC streaming. Performance work backed by numbers.
