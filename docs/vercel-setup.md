# Vercel platform setup — owner actions

Code-side Vercel features are wired in the app; these are the **dashboard /
provisioning** steps only the account owner can do. Ordered by priority.

## 1. Provision Vercel KV (Redis) — URGENT, activates rate limiting

The app already has full rate-limiting code (`src/lib/origin-check.ts`,
`isRateLimited`) guarding the billed endpoints: `/api/ask` (Anthropic),
`/api/search`, `/api/discover/*`, `/api/isochrone`, `/api/travel-time`,
`/api/place-photo` (Google/Mapbox). **It is a silent no-op until KV is
provisioned** — right now those endpoints have no effective limit, so a scraper
or runaway client bills against your AI/Maps quota unbounded.

Steps:
1. Vercel dashboard → your project → **Storage** → **Create Database** →
   **Upstash for Redis** (Marketplace; "Vercel KV" is now Upstash Redis).
2. Connect it to the project for **Production** (and Preview if you want).
3. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. The code
   keys off exactly those two env vars — nothing else to change.
4. Redeploy. Rate limiting (and any future KV caching/dedupe) is now live.

Verify: hammer `/api/discover/autocomplete?q=a` ~70× in a minute → you should
start getting HTTP 429 (limit is 60/60s per IP for that bucket).

## 2. Vercel Firewall — block scrapers/bots on the costly routes

Defense-in-depth on top of the KV rate limits.
1. Project → **Firewall**.
2. Add **Custom Rules**: rate-limit or challenge requests to `/api/ask`,
   `/api/search`, `/api/discover/*` beyond a sane per-IP threshold.
3. Optionally enable **Bot Management** / set **Attack Challenge Mode** to
   one-click on during a traffic spike.

## 3. Fluid Compute — cheaper, faster I/O-bound functions

The feed-fetch / AI / ingest routes spend most of their time awaiting external
APIs (NWS, Socrata, Ticketmaster, Anthropic). Fluid's in-function concurrency
reuses a warm instance across overlapping requests → lower cost + fewer cold
starts.
1. Project → **Settings** → **Functions** → enable **Fluid Compute**.
2. No code change required; redeploy.

## 4. Edge Config — dashboard feature flags / kill switches (optional, pairs with code)

Lets you flip features or kill a misbehaving feed **without a redeploy**.
1. Project → **Storage** → **Edge Config** → create a store, connect to project
   (injects `EDGE_CONFIG`).
2. Tell me once it exists and I'll wire the flags helper to read it (with the
   current env vars as fallback) — e.g. flip the live parking feed, seasonal
   beats, or an emergency kill switch from the dashboard.

## Already done in code (no dashboard action)

- **Edge IP geolocation** on `/nearby` — ranks "near you" from the visitor's
  approximate city before they grant precise location (Vercel edge headers; free).
- `@vercel/analytics`, `@vercel/speed-insights`, `@vercel/blob`, `@vercel/og`,
  Vercel Cron (`vercel.json`), ISR, and edge middleware (admin auth + session)
  are all in use.
