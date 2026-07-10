# Infra audit — Vercel + Supabase (2026-07-10)

Executed the banked playbook (docs/MOBILE_AUDIT_2026-07.md §"Infra audit playbook")
with the Vercel + Supabase connectors live. This doc records what was found, what
was FIXED during the audit, and the ranked backlog. Findings are grounded in live
platform state (advisors, env listing, pg_stat_statements, runtime error groups),
not repo assumptions.

## Fixed during the audit (no action needed)

1. **Admin area was locked out of production.** `ADMIN_PASSWORD` had been stored
   as an EMPTY string (Vercel CLI v54 silently stores "" when the value is piped
   via stdin — use `--value` instead), and `ADMIN_USER` was never set. Middleware
   fails closed on either, so every `/admin/*` request 401'd regardless of input.
   Both re-created with real values (`--value --no-sensitive`), production
   redeployed. Preview env still lacks the pair (CLI errored; retry later).
2. **Three drizzle migrations had never been applied** (hand-apply drift the
   playbook predicted): `0010_drop_duplicate_slug_indexes` (the four duplicate
   slug indexes the Supabase advisor flags), `0011_index_ingested_events_raw_event_id`
   (the one unindexed FK), `0017_usage_counters` (/admin/costs read errors:
   "relation usage_counters does not exist" in Postgres logs; paid-upstream
   metering was silently off). All three applied via MCP `apply_migration`;
   verified live. Supabase's `supabase_migrations` history now records them.
3. **Beta dashboard** (/admin/beta, PR #1024) merged + deployed earlier tonight.

## Healthy / by design — do not churn

- **RLS**: every public table enabled + zero policies = intentional deny-all;
  all writes go through the BYPASSRLS server role (postgres-js via Supavisor).
  The advisor INFO notices are the design working.
- **Caching**: SHA-keyed `unstable_cache` + tag invalidation from ingest +
  boot-warm self-call + 5-min `warm-events` cron; map dataset deliberately held
  in module memo (2MB Data Cache limit). Sophisticated and correct.
- **Security headers** (HSTS, XFO, Permissions-Policy…), canonical redirects,
  image optimization (avif/webp, allowlists, 31-day TTL), Skew Protection,
  React Compiler, per-cron `maxDuration`s: all in place.
- **13 crons** authed via `CRON_SECRET` constant-time Bearer check.
- **Fail-soft posture** on every integration (missing key → feature dark, never
  a crash). Sentry (capture-only) + Vercel Analytics + Speed Insights (prod-only)
  + Plausible (cookieless) mounted.

## Platform facts (live, 2026-07-10)

- DB 90 MB total; **feed_snapshots = 66 MB / ~212k rows (73% of the DB)**,
  unbounded growth, its reader averages 464 ms/call (pg_stat_statements).
- statement_timeout = 2min (role default). The Jul-9 evening statement-timeout
  burst on /beta + /events correlates with local-dev experiments pipelining
  queries into the shared prod pooler (see memory: supavisor-promise-all-deadlock);
  one earlier occurrence (00:04Z) predates it — the max:1 pool is systemically
  sensitive to any wedged statement.
- Top query by total time: the ingested-events full read (14.4k calls × ~4k rows).
  Healthy mean (16 ms) — cache layers are doing the real work.
- Node 24, region iad1, Turbopack builds ~3–6 min. CI `verify`/`style-lint` reds
  are the known account-level Actions limits, not code.

## Ranked backlog

### Tier 1 — wire what already exists (cheap, immediate)

1. **KV rate limiting + metering is OFF in prod.** `KV_REST_API_URL`/`_TOKEN`
   unset → `isRateLimited()` is a warned no-op → /api/feedback's 12/h cap,
   photo-proxy, Ask-LLM and Mapbox limits are all theater. Install Upstash Redis
   via Vercel Marketplace (free tier fine); ensure the env names land as
   `KV_REST_API_URL`/`KV_REST_API_TOKEN` (alias if the integration provisions
   `UPSTASH_REDIS_REST_*`). Highest leverage single action on the list.
2. **Sentry source maps**: uploads disabled → prod stack traces are minified.
   Add `SENTRY_AUTH_TOKEN` + org/project and flip `sourcemaps.disable` off.
3. **Env hygiene**: delete junk var `Air` (empty/typo, 43d old); decide on
   `NEXT_PUBLIC_POSTHOG_KEY` (set 26d ago but NO PostHog code exists — either
   wire it or delete it; Plausible + Vercel Analytics already cover the need);
   Reddit keys are vestigial (integration reads no env).
4. **Preview environment is degraded**: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`,
   `NEXT_PUBLIC_MAPBOX_TOKEN`, `ADMIN_*` are Production-only, so preview deploys
   have no DB/auth/map/admin. Add Preview copies if PR-preview QA matters.
5. **Supabase Auth connection allocation**: switch absolute (10) → percentage
   (dashboard toggle; advisor `auth_db_connections_absolute`).

### Tier 2 — protect the beta (ops safety)

6. **Separate dev database.** Local dev pointing at the prod pooler caused real
   tester-facing timeouts on Jul 9. Cheapest: a second free Supabase project for
   dev with the schema applied from drizzle/; better: Supabase branching.
   Update .env.local; never point local tooling at prod again.
7. **feed_snapshots retention.** Add a prune (e.g. keep 60 days) to the daily
   `data-health` cron; 73% of the DB is telemetry snapshots nobody reads past
   the anomaly window. Also fixes the 464 ms reader.
8. **Backups**: confirm plan-level backup/PITR posture in the Supabase dashboard
   before the beta grows (owner action; not visible via MCP).
9. **Orphan dep cleanup**: `@supabase/supabase-js`, `cmdk` (0 imports each).

### Tier 3 — best-in-class additions (strategic)

10. **Vercel WAF / BotID** on the open POST endpoints (/api/feedback,
    /api/beta/email, /api/reports) — custom rules are available on all plans;
    complements the KV rate limit rather than replacing it.
11. **Feature flags via Edge Config** — the cron kill-switches
    (`BUSINESS_STATUS_CRON`, `LINK_HEALTH_CRON`, `SAVED_REMINDERS_ENABLED`) are
    env vars today, so every flip costs a redeploy. Edge Config flips instantly.
12. **pg_trgm is installed but unused for search** — typo-tolerant place/event
    search endpoint (similarity()) would upgrade the finder cheaply. PostGIS is
    available (not installed) if server-side geo queries are ever wanted.
13. **Supabase Realtime** (unused): live community-reports/bus layer without
    polling, if the live wedge deepens.
14. **AI Gateway**: Ask already routes through it (OIDC/`AI_GATEWAY_API_KEY`
    via the `ai` SDK) — add provider fallbacks + budgets in the Gateway console
    for resilience; usage shows in one dashboard.
15. **Vercel CLI v54 → v55** globally (`npm i -g vercel@latest`) — v54's stdin
    env-add bug is what caused the admin lockout.

## Env keys shipped-but-dark (fail-soft, enable when wanted)

`YELP_API_KEY`, `NPS_API_KEY`, `TICKETMASTER_API_KEY`, `EVENTBRITE_TOKEN`,
`SEATGEEK_CLIENT_ID`, `BANDSINTOWN_APP_ID`, `TOAST_CLIENT_ID/SECRET`,
`RESEND_API_KEY` (submit notifications), `SLACK_WEBHOOK_URL` (data-health
alerts), `PULSEPOINT_AGENCY_ID`, `PARKING_OCCUPANCY_URL/KEY` (parking-alerts
cron is dormant without it). Each lights up an existing code path.
