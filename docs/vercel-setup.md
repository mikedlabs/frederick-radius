# Vercel platform configuration

Last inspected on 2026-09-20 for the `frederick-radius` project in the
`mikedlab` team. These are observed settings, not a guarantee of ongoing
runtime health. Recheck the project before changing configuration.

## Verified configuration

- Production deploys from `mikedlabs/frederick-radius`, branch `main`.
- The project uses Next.js, Node.js `22.x`, and the `iad1` function region.
- Fluid Compute is enabled. No activation or extra provisioning is needed.
- `bash scripts/vercel-ignore-preview.sh` remains the configured ignored-build
  command. It intentionally skips routine preview builds.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured for Production,
  Preview, and Development. Redis provisioning is already complete. The audit
  checked their presence, not a live Redis write or rate-limit load test.
- Production has the database, Supabase, Mapbox, Google photo, and cron
  credentials needed by the existing integrations. Presence alone does not
  establish that a provider accepts a credential.
- Sentry integration settings are configured. Runtime logs still need to be
  checked after each release.

## Release checks

GitHub verifies the change; Vercel builds production after the merge to
`main`. Do not run `vercel --prod` after a normal merge or redeploy the same
commit merely to check it.

1. Confirm required GitHub checks have passed.
2. Confirm the production deployment is Ready and owns `frederickradius.app`.
3. Compare the deployment commit with the intended release, then run
   `scripts/prod-audit.mjs` with `EXPECTED_SHA` and
   `REQUIRE_EXPECTED_SHA=1`.
4. Verify the changed user journey and inspect production runtime errors.
   A successful HTTP response or Ready deployment does not rule out a
   timed-out background render.

Environment changes apply to a new deployment. Coordinate necessary changes
with the next normal release rather than creating duplicate builds.

## Cost and access controls

The application uses KV rate limits and separate database-backed daily
allowances for billed provider work. A configured key does not enable every
paid feature. Preserve each feature's explicit switch and cap in
`.env.example`, and follow `docs/CREDENTIAL_SETUP.md` for credential probes.

Firewall rules were not inspected in this audit. Verify the existing rules in
the Vercel dashboard before changing them; do not claim their current state
from this document. Do not load-test a billed public endpoint to prove a
configuration setting.

Edge Config is optional and is not required by the current release. Do not
provision an additional flag service unless a concrete runtime requirement
calls for it.

## Findings from the 2026-09-20 inspection

The production deployment was Ready at commit `aa88c9e0`. Its preceding
24-hour runtime logs contained one error for `/today` and one for
`/events/[slug]`, both reporting a 300-second timeout. These require bounded
request investigation, not a longer platform timeout or a new hosting
service. Treat this as historical evidence after a newer deployment ships.

Both timeout entries were labeled `serverless-middleware`. The session proxy
now bounds Auth verification to four seconds, aborts provider requests, and
rejects late cookie mutations. Public pages remain available on an Auth
timeout; protected routes fail closed. This addresses a verified unbounded
wait in the code, but the logs do not establish that Auth caused those two
historical timeouts. A future Auth deadline is identified by the private
`[auth] Session verification deadline exceeded.` runtime warning.

The separate Supabase audit found migration `0045_mapbox_search_sessions.sql`
missing. It was applied and verified on 2026-09-20; `drizzle/applied.json`
records the exact migration and checked effects.
