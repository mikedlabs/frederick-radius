# Hosting & Environment Checklist

> Mike's question: "Am I missing something in the containers I use to host
> and run the app?" This is the answer — every env var the app reads,
> WHICH host it belongs in, and why. Walk your dashboards against this.
> Checked against the active workflows and `process.env.*` reads on
> 2026-08-02.
>
> **The #1 gotcha:** there are THREE separate systems, and a key in the
> wrong one silently does nothing. They do NOT share variables:
>
> - **Vercel** — runs the live website (has Production / Preview / Dev scopes)
> - **GitHub Actions** — runs the scheduled data agents (has repo Secrets and Variables)
> - **Supabase** — the database (dashboard settings, not env vars)

---

## 🔴 CRITICAL — set these or core features are broken/insecure

| Var                                           | Host                              | Why it matters                                           | Symptom if missing                                       |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                           | **GitHub Actions secret**         | Powers the three scheduled website-extraction workflows  | Venue, civic, and business information stops refreshing. |
| Vercel Firewall rules                         | **Vercel**                        | Edge limits for Ask, paid APIs, signup, and public forms | Paid endpoints lose their shared production guardrail.   |
| `DATABASE_URL` (or `POSTGRES_URL`)            | **Vercel**                        | Postgres (follows, claims, submissions, push)            | Those features no-op                                     |
| RLS migration (`drizzle/0007_enable_rls.sql`) | **Supabase → SQL editor**         | Locks the public anon-key door                           | Anyone with the public key can read your tables          |
| DB backups / PITR                             | **Supabase → Database → Backups** | Disaster recovery                                        | No recovery if data is wiped                             |

## 🟠 IMPORTANT — features degrade without these

| Var                                                        | Host   | Powers                                                                                                                                                                        |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                 | Vercel | Auth (magic link)                                                                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`)    | Vercel | Auth client                                                                                                                                                                   |
| `GOOGLE_PLACES_API_KEY`                                    | Vercel | Place photos + enrichment                                                                                                                                                     |
| `HOURS_REFRESH_CRON=1`                                     | Vercel | Runs the paid, six-day rolling hours refresh into Postgres. The seven-day publication boundary remains unchanged; without the cron, stale schedules remain safely withheld.   |
| `RADIUS_SEARCH_CRON=1`                                     | Vercel | Runs the bounded, idempotent full-text place-index refresh used by Ask Radius.                                                                                                |
| `RADIUS_POSTGIS_SYNC=1`                                    | Vercel | Refreshes the private PostGIS place mirror after migration `0037` is applied and verified. Keep off before then.                                                              |
| `RADIUS_POSTGIS_NEARBY=shadow`                             | Vercel | Compares PostGIS nearby results after the response without changing user-visible ordering. Promote to `on` only after the mirror audit is current and shadow parity is clean. |
| `DATA_RETENTION_PRUNE=1`                                   | Vercel | Enables the separately scheduled, bounded 90-day retention worker. Leave unset until a recent Supabase backup is confirmed; the scheduled route is inert without it.          |
| `BUSINESS_STATUS_CRON=1`                                   | Vercel | Runs the paid rotating closure-status check. The Vercel route reports mismatches; the GitHub data-steward job creates the reviewable snapshot.                                |
| `TICKETMASTER_API_KEY`                                     | Vercel | Concert + Keys-game events                                                                                                                                                    |
| `BANDSINTOWN_APP_ID`                                       | Vercel | Venue lineups (Bentztown etc.)                                                                                                                                                |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Vercel | Web push notifications                                                                                                                                                        |
| `CRON_SECRET`                                              | Vercel | Authorizes the cron API routes                                                                                                                                                |
| `NEXT_PUBLIC_BASE_URL`                                     | Vercel | OG images, absolute links, share previews                                                                                                                                     |

## 🟡 OPTIONAL — nice-to-have data layers (app degrades gracefully)

| Var                                           | Host           | Powers                                                                                                                                                   |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIRNOW_API_KEY`                              | Vercel         | Air-quality data                                                                                                                                         |
| `OPENAI_API_KEY`                              | Vercel         | Adds semantic vectors to the required full-text Ask Radius index and provides a direct text-generation fallback. The local index still works without it. |
| `NPS_API_KEY`                                 | Vercel         | National Park info                                                                                                                                       |
| `MAPILLARY_TOKEN`                             | Vercel         | Street-level imagery / trash-can layer                                                                                                                   |
| `PULSEPOINT_ENABLED` + `PULSEPOINT_AGENCY_ID` | Vercel         | Restricted incident feed; enable only after the review recorded in `data/sources.yaml`                                                                   |
| `FCPS_FEED_URL`, `HOOD_CALENDAR_URL`          | Vercel         | School + Hood College calendars                                                                                                                          |
| `NWS_USER_AGENT`                              | Vercel         | Weather API courtesy header                                                                                                                              |
| `SLACK_WEBHOOK_URL`                           | GitHub Actions | Agent failure notifications                                                                                                                              |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN`       | Vercel         | Adds durable per-bucket application limits. Without it, the app uses a per-instance fallback while Vercel Firewall remains the shared edge guard.        |

Mapbox is temporarily an intentional exception to the environment-variable
table: `src/lib/mapbox.ts` uses a validated publishable token and ignores the
dead Vercel value that previously blanked the map. Do not restore
`NEXT_PUBLIC_MAPBOX_TOKEN` precedence until a replacement is verified against
map tiles, Static Images, and Isochrone requests.

## Feature flags (set to "1"/"on" in Vercel to toggle behavior)

`HOURS_GATE`, `RADIUS_DEDUPE`, `RADIUS_PRUNE_THIN`, `RADIUS_RELEVANCE`,
`RADIUS_EVENT_NOISE_FILTER`, `RADIUS_EVENTS_BY_TOWN`, `RADIUS_OBDB`,
`COF_PARCELS` — these gate data-cleaning passes.
Safe defaults are baked in; leave unset unless tuning.

`HOURS_FRESHNESS_ENFORCED` is different: strict freshness is on by default.
Set it to `0` only as an emergency rollback. Doing so permits stale schedules
to support open/closed claims and should not be normal production
configuration.

## GitHub data-workflow configuration

| Name                                   | Kind                                           | Why it matters                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`                | Secret                                         | Runs the rotating business-status snapshot, cost-capped enrichment, and manually dispatched photo-attribution backfill.                                                                                                                                                                  |
| `ANTHROPIC_API_KEY`                    | Secret                                         | Runs the venue, civic, and business-information extraction workflows.                                                                                                                                                                                                                    |
| `FIRECRAWL_API_KEY`                    | Secret in the GitHub `Production` environment  | Runs manual exact-page Source Watch checks. Its weekly schedule is deferred pending the County Connector unchanged-repeat proof. A separate Vercel copy is used only if the documented extraction fallback is deliberately enabled; keep all fallback flags off during the review pilot. |
| `TAVILY_API_KEY`                       | Secret in the GitHub `Production` environment  | Runs domain-constrained Source Scout discovery profiles. It does not belong in Vercel or browser code.                                                                                                                                                                                   |
| `APIFY_TOKEN`                          | Secret in the GitHub `APIFY_TOKEN` environment | Runs the exact-page, review-only source-change radar. It does not belong in browser code, and the radar does not use the Vercel copy.                                                                                                                                                    |
| `NEXT_PUBLIC_SUPABASE_URL`             | Variable                                       | Identifies the Supabase project for the read-only hours snapshot pull.                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variable                                       | Lets the data steward read only the public hours columns exposed by migration `0034_expose_place_hours_refresh_read_only.sql`.                                                                                                                                                           |

Do not put `DATABASE_URL` in GitHub for the hours pull. The privileged database
connection stays in Vercel; GitHub reads the reviewed public snapshot fields
through Supabase's anon Data API.

The manual photo-attribution workflow is request-capped and opens a PR. It
does not run on a schedule or publish legacy photo references without exact
attribution.

## Operational health monitoring

`/api/health` is the public liveness and component-status endpoint. It always
returns HTTP 200 when the Next.js route answers, even if the database or data
ledger is degraded. An uptime monitor must parse the JSON body rather than
treating any 200 as fully healthy:

- Alert when `database.status` is not `reachable`.
- Alert when `data.status` is `unavailable`.
- Track `data.status: "degraded"` with the `stale`, `attention`, and `unknown`
  counts so a single optional source does not look like a site outage.

The response carries `Cache-Control: no-store`, but the server coalesces
concurrent probes and reuses the compact snapshot for no more than 30 seconds.
This keeps a predictable public probe from becoming a database-amplification
path without letting browsers or a CDN serve an old status response.

## Production canary and automatic recovery

`.github/workflows/production-canary.yml` checks the real
`https://frederickradius.app` alias after every successful Vercel production
promotion. It retries three times before treating the release as unhealthy.
When all three checks fail, it finds the immediately preceding READY deployment
from `main`, verifies that immutable deployment with the same canary, and only
then asks Vercel to restore it.

Configure this once under GitHub → Settings → Secrets and variables → Actions:

| Name             | Kind               | Value                                                           |
| ---------------- | ------------------ | --------------------------------------------------------------- |
| `VERCEL_TOKEN`   | Secret             | A Vercel access token that can list and roll back this project. |
| `VERCEL_SCOPE`   | Variable, optional | `mikedlab`                                                      |
| `VERCEL_PROJECT` | Variable, optional | `frederick-radius`                                              |
| `PRODUCTION_URL` | Variable, optional | `https://frederickradius.app`                                   |

If `VERCEL_TOKEN` is absent, the workflow stays red and leaves production
unchanged; it never guesses at a rollback target. Vercel Instant Rollback pins
the restored deployment and pauses automatic production-domain assignment.
After correcting the bad release, explicitly promote a known-good deployment
to resume the normal production flow.

---

## How to set each (the exact path)

**Vercel:** Project → Settings → Environment Variables → add for
Production AND Preview (and Development if you run `vercel dev`).
`NEXT_PUBLIC_*` vars are exposed to the browser by design — fine, they're
meant to be public. Everything else stays server-only.

**GitHub Actions:** Repo → Settings → Secrets and variables → **Actions**.
Use **Secrets** for protected API keys and **Variables** for the browser-safe
Supabase URL and publishable key. Do not put either in Dependabot or Codespaces
settings.

**Supabase:** Dashboard → SQL Editor (run the RLS migration) and
Database → Backups (enable PITR). These aren't env vars.

---

## Modern Next 16 features — what's on, what's deferred

**ON:** React Compiler, View Transitions, `optimizePackageImports`,
`staleTimes` (instant tab back/forth), Skew Protection (`deploymentId`),
full `next/image`, ISR with tagged revalidation, Suspense streaming.

**Deferred (own PR, with build verification — not free toggles):**

- **PPR (Partial Prerendering)** — static shell paints instantly, live
  modules stream in. Recognized on 16.2.6 but changes rendering app-wide;
  enable + measure in isolation.

**Staged:** PostGIS now has a reversible migration, an exact public-catalog
mirror, a daily sync route, and a checksum-gated `/api/nearby` path. Rollout is:
apply `0037`, run `npm run db:spatial:sync`, require `current=true`, enable
`RADIUS_POSTGIS_SYNC=1`, observe `RADIUS_POSTGIS_NEARBY=shadow`, then promote
to `on`. A stale hash, timeout, or database error automatically preserves the
existing in-memory result path.

You are already using more of modern Next than most production apps. The
gaps are deliberate, sequenced, and documented — not oversights.
