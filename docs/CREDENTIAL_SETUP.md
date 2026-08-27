# Credential setup

Four credentials are release prerequisites. Their current production state
must be verified before each release; this document does not assume that an
older environment snapshot is still accurate.

Check the current state at any time:

```
npm run verify:credentials            # presence + "is it actually different"
npm run verify:credentials -- --probe # also calls Mapbox and GitHub read-only
```

It never prints a secret; tokens appear as an 8-character fingerprint. It
exits 1 when a required credential is missing, so it can gate a deploy.

All four go in the same place: **Vercel > the frederick-radius project >
Settings > Environment Variables**. Add each to **Production** (and Preview
where noted). Vercel does not apply new values to a running deployment, so
redeploy afterward.

---

## 1. `NEXT_PUBLIC_MAPBOX_TOKEN` — Production + Preview

**Why:** unset, interactive maps fail visibly. Radius no longer carries a live
fallback in source control. The former fallback remains compromised because it
is in git history and accepted unrelated origins when checked; revoke it after
the current production deployment is moved to the replacement token.

1. **Mapbox** (account.mapbox.com/access-tokens) — create a new public token.
   Name it something like `frederick-radius-browser`.
2. Scopes: the defaults for a public token are correct. Do not add secret
   scopes; this one ships to browsers by design.
3. Open the new token and set **URL restrictions**:
   ```
   https://frederickradius.app
   https://www.frederickradius.app
   https://<your-exact-stable-preview-alias>.vercel.app
   ```
   Mapbox does not support wildcard characters in URL restrictions. An origin
   entry already authorizes its subpaths.
   Do not allow all of `*.vercel.app`; that gives every Vercel project an
   accepted origin. Use the one stable preview alias you actually test. A
   `pk.` token is always visible; exact origin restrictions are the control.
4. Paste the `pk.…` value into Vercel as `NEXT_PUBLIC_MAPBOX_TOKEN`.
5. Redeploy, then run `npm run verify:credentials -- --probe`. The probe must
   accept Frederick Radius and reject both an unrelated Referer and a request
   with no Referer. `NEXT_PUBLIC_*` is inlined at build time, so the running
   deployment does not change until a new build runs.
6. **Only after that check passes**, delete the old token in the Mapbox
   dashboard. It is in git history, so it can never be considered safe again.
   Revoking it before production uses the replacement can black out the map.

## 2. `MAPBOX_SERVER_TOKEN` — Production only

**Why:** server routes never fall back to the browser token. When this value is
unset, a cache miss fails closed. Separating the credentials means a leaked
browser token cannot spend the server routing, search, or image budget.

1. **Mapbox** — create a separate, non-default public token (`pk.…`), named
   e.g. `frederick-radius-server`. It stays only in the Vercel server
   environment even though its scopes are public.
2. Do not add a secret account scope merely to manufacture an `sk.` token.
   Directions, Matrix, Isochrone, Search Box, and geocoding accept a valid
   access token without a secret scope. Add public `styles:tiles` only when
   Static Images is enabled.
3. No URL restriction. These calls originate on the server without a browser
   referrer contract. The credential is protected by Vercel environment
   storage, separation from the browser bundle, code-owned switches, and
   atomic daily caps.
4. Paste into Vercel as `MAPBOX_SERVER_TOKEN`. Production only. Never expose
   this dedicated credential to client-side code or reuse it as
   `NEXT_PUBLIC_MAPBOX_TOKEN`.
5. Keep every paid server switch at `0` until the shared `usage_counters`
   unique index is verified. Enable only the feature needed:
   `MAPBOX_STATIC_MAPS_ENABLED`, `MAPBOX_DIRECTIONS_ENABLED`,
   `MAPBOX_ISOCHRONE_ENABLED`, `MAPBOX_MATRIX_ENABLED`,
   `MAPBOX_SEARCH_BOX_ENABLED`, or `MAPBOX_GEOCODING_ENABLED`.
6. Static Images, Directions, Isochrone, and Matrix also accept a zero daily
   cap as an immediate breaker. Their code-owned maxima cannot be raised from
   Vercel. Cached images, walking legs, and reach polygons continue serving
   while their switch is off; no new provider request is made.

## 3. `SLACK_WEBHOOK_URL` — optional Production channel

**Why:** this can mirror live anomalies into Slack, but it is not a release
credential. GitHub's production-health workflow remains the required alert
path when Slack is absent. Configure Slack only if someone will actively read
that channel.

1. **api.slack.com/apps** — create an app (or open an existing one) for the
   workspace you want alerts in.
2. **Incoming Webhooks** > toggle on > **Add New Webhook to Workspace** >
   choose the channel.
3. Copy the `https://hooks.slack.com/services/…` URL into Vercel.

Repeat alerts carrying the same fingerprint are suppressed. Leaving this
unset is a valid configuration and must not block a release.

## 4. `GITHUB_ALERTS_TOKEN` — Production only

**Why:** creates the weekly digest. The nightly production-health issue does
not depend on this personal token anymore. The `Production health alert`
workflow reads `/api/health` with GitHub's automatic `GITHUB_TOKEN`, which does
not need to be copied into Vercel and does not expire like a personal token.

The richer Vercel-side health report remains available as an optional second
channel. Do not enable it until the probe below accepts the token. After a
successful probe, set `VERCEL_GITHUB_ALERTS_ENABLED=1`. If the token is absent,
revoked, or unprobed, leave that flag unset and the Actions health channel
continues to operate.

1. **github.com/settings/personal-access-tokens** — new **fine-grained** token.
2. Repository access: **only** `mikedlabs/frederick-radius`.
3. Repository permissions: **Issues: Read and write**. Nothing else.
4. Paste into Vercel as `GITHUB_ALERTS_TOKEN`.
5. `GITHUB_ALERTS_REPO` can stay unset; it defaults to
   `mikedlabs/frederick-radius`.

---

## Google place-photo delivery — preserve this path

The existing business photos are part of the live visual experience. Do not
add a browser photo flag or lower the daily allowance to zero: neither matches
the current implementation, and either change would make cards appear to lose
their photography.

With `GOOGLE_PLACES_API_KEY` configured, photo resource names are sent through
Radius's same-origin server proxy so the key never enters page HTML. The route
requires an attributed, same-origin request, applies its per-minute abuse
limit, reserves one unit from the shared Eastern-day counter, and returns the
Google media as `private, no-store`. Each visible photo keeps the exact credit
stored with that resource; a failed image request degrades to Radius artwork
instead of silently substituting another author's image.

`GOOGLE_PHOTO_DAILY_CAP=1500` is the measured spike breaker, not a photo target.
Missing or malformed values also resolve to 1,500, numeric values are clamped
to 1-2,000, and a database-counter failure stops the upstream request. The
Google written-policy/runtime gate is for maintenance, Routes, and durable
event-address geocoding. It does not switch off this existing attributed photo
transport.

## After setting them

1. Redeploy production.
2. Run `npm run verify:credentials -- --probe` against the production
   environment values to confirm every required credential and any configured
   optional channel.
3. Visually verify the interactive map before revoking the former browser
   token. The source-controlled fallback has already been removed; production
   now depends on the restricted build-time token.

## Not a credential, but the same shape

`KV_REST_API_URL` / `KV_REST_API_TOKEN` are unset, so the application rate
limiters fall back to a per-instance counter. The effective limit is therefore
multiplied by however many Lambda instances happen to be warm. Vercel Firewall
covers the public endpoints, so this is a warning rather than a failure, but
the paid-upstream limits (`/api/place-photo` and friends) are weaker than they
read.

Public Ask model work has a stricter independent boundary. Leave
`ASK_AI_RUNTIME_ENABLED=0` until `drizzle/0017_usage_counters.sql` and its
unique day/upstream index are verified. Then choose exactly one
`ASK_AI_PROVIDER`, add only that provider's credential, and enable the switch.
Every cache-miss model turn reserves one shared Eastern-day unit before the
provider call. `ASK_AI_DAILY_CALL_LIMIT=0` is the immediate kill switch; code
will not accept more than 1,000 calls per day. SDK retries are disabled and a
provider failure returns the local Frederick answer instead of billing a
fallback provider.

Visitor-time semantic embeddings are a separate, optional direct-OpenAI path.
They remain off unless `ASK_AI_RUNTIME_EMBEDDINGS_ENABLED=1`; their independent
daily cap cannot exceed 500. Postgres full-text search remains available when
that switch is off, the allowance is exhausted, or the shared counter is down.
