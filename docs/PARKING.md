# Parking Lot

Out-of-scope observations logged during sessions, per the standing instructions. Each entry names the session that noticed it.

## From Session 0 (instrumentation)

1. **Privacy posture — DECIDED June 12, 2026.** The cookieless, no-consent-banner stance holds: PostHog persistence is `"localStorage"` (no cookie), replay stays mobile-only with all inputs masked. If replay quota or consent thinking changes later, `src/lib/posthog.ts` is the one file to revisit.
2. **A second custom-event stream already exists.** `src/components/guide/FunnelFlow.tsx` fires five `find_*` events through `@vercel/analytics` (`track('find_intent')` etc.). Once PostHog is live these should either migrate to it or be retired with the /guide surface in Session 1, so there is one event system, not two.
3. **No PostHog key exists anywhere** (checked local env files and `vercel env ls`). The Session 0 gate (events visible in the PostHog debugger from a real phone) requires creating the PostHog project and setting `NEXT_PUBLIC_POSTHOG_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) in Vercel, then redeploying.
4. **Vercel preview deployments are auth-protected** (401 to anonymous requests), so `budget.sh` and the Playwright suite cannot run against preview URLs from a script without a protection-bypass token. Session 0's gate numbers were captured against a local production build instead; Sessions 1+ should either set `VERCEL_AUTOMATION_BYPASS_SECRET` or keep using local production builds for gates.
5. **PR #490 (ResultBlock, closed in the pre-Session-1 triage)** carried a 4-tier result-presentation idea for Ask answers. If Session 3 wants tiered results inside the P5 search sheet, that closed PR is the reference.
