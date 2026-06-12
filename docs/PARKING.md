# Parking Lot

Out-of-scope observations logged during sessions, per the standing instructions. Each entry names the session that noticed it.

## From Session 0 (instrumentation)

1. **Privacy posture decision needed.** The repo's house style is deliberately cookieless analytics with no consent banner (see the comment block in `src/app/layout.tsx` and `src/lib/analytics.ts`). PostHog as wired uses `persistence: "localStorage+cookie"` and mobile session replay with all inputs masked. If the no-cookie stance should hold, switch persistence to `"localStorage"` or `"memory"` in `src/lib/posthog.ts` and decide whether replay needs a consent surface. One line to change; decide before the key goes live.
2. **A second custom-event stream already exists.** `src/components/guide/FunnelFlow.tsx` fires five `find_*` events through `@vercel/analytics` (`track('find_intent')` etc.). Once PostHog is live these should either migrate to it or be retired with the /guide surface in Session 1, so there is one event system, not two.
3. **No PostHog key exists anywhere** (checked local env files and `vercel env ls`). The Session 0 gate (events visible in the PostHog debugger from a real phone) requires creating the PostHog project and setting `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) in Vercel, then redeploying.
4. **Vercel preview deployments are auth-protected** (401 to anonymous requests), so `budget.sh` and the Playwright suite cannot run against preview URLs from a script without a protection-bypass token. Session 0's gate numbers were captured against a local production build instead; Sessions 1+ should either set `VERCEL_AUTOMATION_BYPASS_SECRET` or keep using local production builds for gates.
