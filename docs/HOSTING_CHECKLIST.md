# Hosting & Environment Checklist

> Mike's question: "Am I missing something in the containers I use to host
> and run the app?" This is the answer — every env var the app reads,
> WHICH host it belongs in, and why. Walk your dashboards against this.
> Checked against the active workflows and `process.env.*` reads on
> 2026-08-24.
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
| `ANTHROPIC_BUSINESS_INFO_API_KEY`             | **GitHub Data Enrichment secret** | Powers reviewed business-information extraction          | Business-information refreshes fail before model calls.  |
| `ANTHROPIC_CIVIC_API_KEY`                     | **GitHub Data Enrichment secret** | Powers reviewed municipal civic extraction               | Civic source refreshes fail before model calls.          |
| `ANTHROPIC_VENUE_EVENTS_API_KEY`              | **GitHub Data Enrichment secret** | Powers reviewed venue-event extraction                   | Venue refreshes fail before model calls.                 |
| Vercel Firewall rules                         | **Vercel**                        | Edge limits for Ask, paid APIs, signup, and public forms | Paid endpoints lose their shared production guardrail.   |
| `DATABASE_URL` (or `POSTGRES_URL`)            | **Vercel**                        | Postgres (follows, claims, submissions, push)            | Those features no-op                                     |
| RLS migration (`drizzle/0007_enable_rls.sql`) | **Supabase → SQL editor**         | Locks the public anon-key door                           | Anyone with the public key can read your tables          |
| DB backups / PITR                             | **Supabase → Database → Backups** | Disaster recovery                                        | No recovery if data is wiped                             |

## 🟠 IMPORTANT — features degrade without these

| Var                                                        | Host   | Powers                                                                                                                                                                        |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                 | Vercel | Auth (magic link)                                                                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`)    | Vercel | Auth client                                                                                                                                                                   |
| `GOOGLE_PLACES_API_KEY`                                    | Vercel | Preserves the existing attributed place-photo proxy. Google place maintenance remains separately blocked behind reviewed platform approval and explicit runtime switches.     |
| `GOOGLE_PHOTO_DAILY_CAP=1500`                              | Vercel | Bounds the existing private/no-store photo proxy above measured normal use. Same-origin checks, per-minute abuse protection, and the shared daily counter remain in force.     |
| `HOURS_REFRESH_CRON=1`                                     | Vercel | Runs the paid, six-day rolling hours refresh into Postgres. The seven-day publication boundary remains unchanged; without the cron, stale schedules remain safely withheld.   |
| `RADIUS_SEARCH_CRON=1`                                     | Vercel | Runs the bounded, idempotent full-text place-index refresh used by Ask Radius.                                                                                                |
| `RADIUS_SEARCH_SEMANTIC_ENABLED=1` + `RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT` | Vercel | Optionally adds scheduled direct-OpenAI vectors behind the shared atomic counter. Leave both off/zero until migration `0017` and its unique index are verified. |
| `ASK_AI_RUNTIME_ENABLED=1` + `ASK_AI_DAILY_CALL_LIMIT`     | Vercel | Deliberately enables public Ask model calls behind the shared atomic Eastern-day ceiling. Leave off until migration `0017` and its unique index are verified.                 |
| `ASK_AI_PROVIDER` + its one matching credential            | Vercel | Selects exactly one text provider (`gateway`, `anthropic`, or `openai`). Only an omitted setting defaults to Gateway; blank or unsupported values fail closed, and Radius never waterfalls into another paid provider. |
| `ASK_RADIUS_AGENT=1`                                       | Vercel | Explicitly enables the multi-step Gateway tool agent for complex requests. Leave at `0` unless its measured answer-quality gain justifies up to five separately reserved turns. |
| `RADIUS_POSTGIS_SYNC=1`                                    | Vercel | Refreshes the private PostGIS place mirror after migration `0037` is applied and verified. Keep off before then.                                                              |
| `RADIUS_POSTGIS_NEARBY=shadow`                             | Vercel | Compares PostGIS nearby results after the response without changing user-visible ordering. Promote to `on` only after the mirror audit is current and shadow parity is clean. |
| `DATA_RETENTION_PRUNE=1`                                   | Vercel | Allows an authenticated operator-only bounded 90-day retention run. It is deliberately absent from `vercel.json`; leave unset until a recent Supabase backup is confirmed. |
| `TICKETMASTER_API_KEY`                                     | Vercel | Concert + Keys-game events                                                                                                                                                    |
| `BANDSINTOWN_APP_ID`                                       | Vercel | Venue lineups (Bentztown etc.)                                                                                                                                                |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Vercel | Web push notifications                                                                                                                                                        |
| `CRON_SECRET`                                              | Vercel | Authorizes the cron API routes                                                                                                                                                |
| `NEXT_PUBLIC_BASE_URL`                                     | Vercel | OG images, absolute links, share previews                                                                                                                                     |

## 🟡 OPTIONAL — nice-to-have data layers (app degrades gracefully)

| Var                                           | Host           | Powers                                                                                                                                                   |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIRNOW_API_KEY`                              | Vercel         | Air-quality data                                                                                                                                         |
| `OPENAI_API_KEY`                              | Vercel         | Can power text only when `ASK_AI_PROVIDER=openai` and optional vectors only behind their dedicated runtime or scheduled switches and nonzero caps. A key alone activates nothing. |
| `ASK_AI_RUNTIME_EMBEDDINGS_ENABLED=1`          | Vercel         | Opts visitor-time semantic recall into its own atomic daily embedding cap. Leave off unless measured recall gains justify the spend.                                          |
| `NPS_API_KEY`                                 | Vercel         | National Park info                                                                                                                                       |
| `MAPILLARY_TOKEN`                             | Vercel         | Street-level imagery / trash-can layer                                                                                                                   |
| `PULSEPOINT_ENABLED` + `PULSEPOINT_AGENCY_ID` | Vercel         | Restricted incident feed; enable only after the review recorded in `data/sources.yaml`                                                                   |
| `FCPS_FEED_URL`, `HOOD_CALENDAR_URL`          | Vercel         | School + Hood College calendars                                                                                                                          |
| `SLACK_WEBHOOK_URL`                           | GitHub Actions | Agent failure notifications                                                                                                                              |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN`       | Vercel         | Adds durable per-bucket application limits. Without it, the app uses a per-instance fallback while Vercel Firewall remains the shared edge guard.        |

Mapbox browser rendering requires `NEXT_PUBLIC_MAPBOX_TOKEN` at build time.
There is no source-controlled fallback. The token must be publishable (`pk.`),
restricted to Radius production and one exact stable preview origin (never all
of `*.vercel.app`), and verified with
`npm run verify:credentials -- --probe` before deployment. Server APIs require a separate
`MAPBOX_SERVER_TOKEN`, an API-specific runtime switch, a nonzero bounded daily
cap, and an available atomic `usage_counters` index before a cache miss can
reach Mapbox.

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
| `GOOGLE_PLACES_API_KEY`                | Secret                                         | Runs deliberately confirmed, cost-capped enrichment and the manually dispatched photo-attribution backfill. The scheduled hours writer uses the Vercel Production copy.                                                                                                                 |
| `ANTHROPIC_BUSINESS_INFO_API_KEY`      | Secret in the GitHub `Data Enrichment` environment | Runs the business-information extraction workflow.                                                                                                                                                                                                                                   |
| `ANTHROPIC_CIVIC_API_KEY`              | Secret in the GitHub `Data Enrichment` environment | Runs the municipal civic extraction workflow.                                                                                                                                                                                                                                        |
| `ANTHROPIC_VENUE_EVENTS_API_KEY`       | Secret in the GitHub `Data Enrichment` environment | Runs the venue-event extraction workflow.                                                                                                                                                                                                                                            |
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
