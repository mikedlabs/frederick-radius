# Hosting & Environment Checklist

> Mike's question: "Am I missing something in the containers I use to host
> and run the app?" This is the answer — every env var the app reads,
> WHICH host it belongs in, and why. Walk your dashboards against this.
> Generated from the actual `process.env.*` reads in the code (2026-05-30).
>
> **The #1 gotcha:** there are THREE separate systems, and a key in the
> wrong one silently does nothing. They do NOT share variables:
> - **Vercel** — runs the live website (has Production / Preview / Dev scopes)
> - **GitHub Actions** — runs the scheduled data agents (has repo "Secrets")
> - **Supabase** — the database (dashboard settings, not env vars)

---

## 🔴 CRITICAL — set these or core features are broken/insecure

| Var | Host | Why it matters | Symptom if missing |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **GitHub Actions secret** | Powers all 4 data agents | Venue/civic/business data stays empty. **← the one you put in Vercel by mistake.** |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | **Vercel** (all scopes) | The map canvas | Map renders blank / falls back |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | **Vercel** | The per-IP rate limiter | **Rate limiting silently OFF** — fails open. Paid Google routes unprotected. |
| `DATABASE_URL` (or `POSTGRES_URL`) | **Vercel** | Postgres (follows, claims, submissions, push) | Those features no-op |
| RLS migration (`drizzle/0007_enable_rls.sql`) | **Supabase → SQL editor** | Locks the public anon-key door | Anyone with the public key can read your tables |
| DB backups / PITR | **Supabase → Database → Backups** | Disaster recovery | No recovery if data is wiped |

## 🟠 IMPORTANT — features degrade without these

| Var | Host | Powers |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Auth (magic link) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`) | Vercel | Auth client |
| `GOOGLE_PLACES_API_KEY` | Vercel | Place photos + enrichment |
| `TICKETMASTER_API_KEY` | Vercel | Concert + Keys-game events |
| `BANDSINTOWN_APP_ID` | Vercel | Venue lineups (Bentztown etc.) |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | Vercel | Web push notifications |
| `CRON_SECRET` | Vercel | Authorizes the cron API routes |
| `NEXT_PUBLIC_BASE_URL` | Vercel | OG images, absolute links, share previews |

## 🟡 OPTIONAL — nice-to-have data layers (app degrades gracefully)

| Var | Host | Powers |
|---|---|---|
| `AIRNOW_API_KEY` | Vercel | Air-quality data |
| `NPS_API_KEY` | Vercel | National Park info |
| `MAPILLARY_TOKEN` | Vercel | Street-level imagery / trash-can layer |
| `PULSEPOINT_AGENCY_ID` | Vercel | Live incident feed |
| `FCPS_FEED_URL`, `HOOD_CALENDAR_URL` | Vercel | School + Hood College calendars |
| `NWS_USER_AGENT` | Vercel | Weather API courtesy header |
| `SLACK_WEBHOOK_URL` | GitHub Actions | Agent failure notifications |

## Feature flags (set to "1"/"on" in Vercel to toggle behavior)
`HOURS_GATE`, `RADIUS_DEDUPE`, `RADIUS_PRUNE_THIN`, `RADIUS_RELEVANCE`,
`RADIUS_EVENT_NOISE_FILTER`, `RADIUS_EVENTS_BY_TOWN`, `RADIUS_OBDB`,
`COF_PARCELS`, `BUSINESS_STATUS_CRON` — these gate data-cleaning passes.
Safe defaults are baked in; leave unset unless tuning.

---

## How to set each (the exact path)

**Vercel:** Project → Settings → Environment Variables → add for
Production AND Preview (and Development if you run `vercel dev`).
`NEXT_PUBLIC_*` vars are exposed to the browser by design — fine, they're
meant to be public. Everything else stays server-only.

**GitHub Actions:** Repo → Settings → Secrets and variables → **Actions**
tab → **Secrets** (NOT Variables, NOT Dependabot/Codespaces) → New
repository secret. This is the ONLY place `ANTHROPIC_API_KEY` does anything.

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
- **Postgres/PostGIS population** — the schema exists but the catalog is
  still a JSON file; moving spatial queries to `ST_DWithin` makes "near
  me" an indexed query instead of a JS loop. The keystone perf upgrade.

You are already using more of modern Next than most production apps. The
gaps are deliberate, sequenced, and documented — not oversights.
