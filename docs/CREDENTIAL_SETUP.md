# Credential setup

Four credentials are unset in production. None of them breaks anything
visibly, which is why they stayed unset: the app keeps rendering and the
nightly jobs keep running. What is actually off is the protection.

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

**Why:** unset, the app falls back to a token hardcoded in
`src/lib/mapbox.ts`. That token is live in the production bundle right now, it
is in git history, and it carries no URL restriction, so anyone who reads it
out of the JavaScript can bill this account for geocoding, directions, matrix,
isochrone, and static images.

1. **Mapbox** (account.mapbox.com/access-tokens) — create a new public token.
   Name it something like `frederick-radius-browser`.
2. Scopes: the defaults for a public token are correct. Do not add secret
   scopes; this one ships to browsers by design.
3. Open the new token and set **URL restrictions**:
   ```
   https://frederickradius.app/*
   https://*.vercel.app/*
   ```
   This is the control that matters. A `pk.` token is always visible; the
   restriction is what makes it useless to anyone else.
4. Paste the `pk.…` value into Vercel as `NEXT_PUBLIC_MAPBOX_TOKEN`.
5. Redeploy, then confirm the bundle actually serves the new value:
   `npm run verify:credentials -- --probe`. `NEXT_PUBLIC_*` is inlined at
   build time, so until a build runs, production is still on the fallback.
6. **Only after that check passes**, delete the old token in the Mapbox
   dashboard. It is in git history, so it can never be considered private
   again — rotation is not optional. Revoking it any earlier blacks out every
   map, because the running deployment is still authenticating with it.

## 2. `MAPBOX_SERVER_TOKEN` — Production only

**Why:** unset, `src/lib/mapbox-server.ts` falls back to the browser token, so
the public token and the server routing budget are the same credential.
Separating them means a leaked browser token cannot spend the routing budget.

1. **Mapbox** — create a **secret** token (`sk.…`), named e.g.
   `frederick-radius-server`.
2. Scopes needed by the six server routes: `styles:tiles`, `styles:read`
   (static images), `directions:read` (walk-time, matrix), `geocoding:read`
   (geocode, search box). Isochrone rides the directions scope.
3. No URL restriction. It never reaches a browser, and a restriction would
   break the server calls.
4. Paste into Vercel as `MAPBOX_SERVER_TOKEN`. Production only — never expose
   a secret token to Preview builds that render client-side.

## 3. `SLACK_WEBHOOK_URL` — Production only

**Why:** this is the live anomaly stream. It works and it has been correct.
During the week open-now was dark, it reported
`places-hours-refresh.json:snapshot_expired` every night into a server log
with no reader. Detection has never been the problem.

1. **api.slack.com/apps** — create an app (or open an existing one) for the
   workspace you want alerts in.
2. **Incoming Webhooks** > toggle on > **Add New Webhook to Workspace** >
   choose the channel.
3. Copy the `https://hooks.slack.com/services/…` URL into Vercel.

Repeat alerts carrying the same fingerprint are suppressed, so this will not
turn into noise.

## 4. `GITHUB_ALERTS_TOKEN` — Production only

**Why:** opens and updates the nightly `[data-health] Red checks on the
nightly board` issue and the weekly digest. It is independent of Slack, and it
is the channel that leaves a durable record in the repo.

1. **github.com/settings/personal-access-tokens** — new **fine-grained** token.
2. Repository access: **only** `mikedlabs/frederick-radius`.
3. Repository permissions: **Issues: Read and write**. Nothing else.
4. Paste into Vercel as `GITHUB_ALERTS_TOKEN`.
5. `GITHUB_ALERTS_REPO` can stay unset; it defaults to
   `mikedlabs/frederick-radius`.

---

## After setting them

1. Redeploy production.
2. Run `npm run verify:credentials -- --probe` against the production
   environment values to confirm all four pass.
3. Tell the agent to delete the bundled fallback. It is a two-line change in
   `src/lib/mapbox.ts` plus the now-dead branch in `src/lib/mapbox-server.ts`,
   and it is deliberately NOT done yet: production currently depends on that
   fallback, so removing it before step 1 would black out every map on the
   site.

## Not a credential, but the same shape

`KV_REST_API_URL` / `KV_REST_API_TOKEN` are unset, so the application rate
limiters fall back to a per-instance counter. The effective limit is therefore
multiplied by however many Lambda instances happen to be warm. Vercel Firewall
covers the public endpoints, so this is a warning rather than a failure, but
the paid-upstream limits (`/api/place-photo` and friends) are weaker than they
read.
