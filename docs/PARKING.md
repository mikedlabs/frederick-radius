# Parking Lot

Out-of-scope observations logged during sessions, per the standing instructions. Each entry names the session that noticed it.

## From Session 0 (instrumentation)

1. **Privacy posture — DECIDED June 12, 2026.** The cookieless, no-consent-banner stance holds: PostHog persistence is `"localStorage"` (no cookie), replay stays mobile-only with all inputs masked. If replay quota or consent thinking changes later, `src/lib/posthog.ts` is the one file to revisit.
2. **A second custom-event stream already exists.** `src/components/guide/FunnelFlow.tsx` fires five `find_*` events through `@vercel/analytics` (`track('find_intent')` etc.). Once PostHog is live these should either migrate to it or be retired with the /guide surface in Session 1, so there is one event system, not two.
3. **No PostHog key exists anywhere** (checked local env files and `vercel env ls`). The Session 0 gate (events visible in the PostHog debugger from a real phone) requires creating the PostHog project and setting `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) in Vercel, then redeploying.
4. **Vercel preview deployments are auth-protected** (401 to anonymous requests), so `budget.sh` and the Playwright suite cannot run against preview URLs from a script without a protection-bypass token. Session 0's gate numbers were captured against a local production build instead; Sessions 1+ should either set `VERCEL_AUTOMATION_BYPASS_SECRET` or keep using local production builds for gates.
5. **PR #490 (ResultBlock, closed in the pre-Session-1 triage)** carried a 4-tier result-presentation idea for Ask answers. If Session 3 wants tiered results inside the P5 search sheet, that closed PR is the reference.

## From Session 1 (routes and navigation)

6. **The root has no h1.** The Today page (now the root) renders its date line as a styled paragraph and has no h1 element; the old funnel root's h1 ("What are you after?") retired with it. Session 2 rebuilds the Today surface and should give the page a real h1 in the process.

## From Session 2 (Today subtraction)

7. **Orphaned components after the Today rebuild.** TodayMoves, HourlyForecast/HourlyDisclosure/HourlySummary, WeeklyForecast/WeeklyCard/WeeklySummary, WeatherMore/WeatherMoreGrid, WeatherHero, NowDayStrip, BetaIntroCard, and LocalNewsRail are no longer mounted on the root. They still compile and may have other callers; a later cleanup session should grep for zero-caller components and delete them (and AnswerCard/buildTodayAnswers' open-now branch + getOpenNowCount's Today usage). Left in place this session to keep the diff scoped to /today.
8. **The scrubber segment badge is a navigation count, not a rendered count.** TimeToggle shows the window total (e.g. "Tonight · 4") while the canvas renders a capped preview (hero + 2 tiles) with "See all → /events". This is the rule-3-blessed "tab navigation count," distinct from the killed stat card, and the count-integrity test only runs on /events. If a future pass wants count==rendered on /today, either remove the badge number or render the full window (watch the byte budget).
9. **ParkMobile/OpenTable demotion is half-done.** The explainer paragraph was deleted (kill-list), and PartnerAppsRow is no longer on /today. The brief wants those handoffs demoted "to the place detail page where reserving and parking are actual next steps" — that move hasn't been made yet.

## From Session 3 (Events single system)

10. **The ingested municipal-series calendar lost its home.** The MunicipalEvents module (recurring municipal series from the daily-ingest table — board meetings, trash/yard-waste schedules) was dropped from /events because it carried the second search input (Rule 4) and was a major byte driver. Civic *meetings* remain reachable via the Civic chip (classifyEvent civic_meeting), but the recurring municipal SERIES (e.g. "curbside pickup every other Friday") is no longer surfaced. It may belong on /events/calendar or a dedicated /civic surface. getIngestedSeries/getIngestedSummary are now unused by the page.
11. **More orphaned event components.** EventsExplorer, EventsMap, EventAgenda, WeekendVibes, TonightRail, EventWeekRibbon, EventsCompartmented, MunicipalEvents are no longer mounted by any route (verify with a zero-caller grep). They still compile. Combine with PARKING 7's Today orphans into one deletion sweep. Note EventsCompartmented references TonightRail and EventWeekRibbon references EventsExplorer — delete as a connected set.
12. **The agenda is capped at 32 events.** /events shows whole day-groups up to 32 events, then links to the Month calendar. This is the byte-budget bound; the "complete list" the brief assigns to Events now lives on /events/calendar. If a future pass wants the full list inline, the calendar route must carry it (and stay under budget on its own).
