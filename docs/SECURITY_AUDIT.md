# Security & Architecture Audit — Frederick Radius

> You asked me to push you on anything glaring in the backend / system
> architecture / security — the foundation, so a launch doesn't expose an
> amateur mistake. This is the honest report. **Lead finding: the
> foundation is genuinely solid.** There was one real hole (the public
> database door) and a few hardening gaps. The hole is closed in code in
> this branch; two items need a click from you in the Supabase/Vercel
> dashboards because I can't reach them from here.

_Last reviewed: 2026-05-29._

---

## TL;DR — what to do

| # | Item | Severity | Status |
|---|------|----------|--------|
| 1 | **Enable RLS on every Supabase table** | 🔴 Critical | SQL written (`drizzle/0007_enable_rls.sql`) — **you run it once** |
| 2 | **Confirm DB backups / Point-in-Time-Recovery is ON** | 🟠 High | Dashboard check (you) |
| 3 | **Confirm Upstash KV env vars are set in prod** | 🟠 High | Dashboard check (you) |
| 4 | Security headers (HSTS, frame, sniff, permissions) | 🟡 Medium | **Done** (`next.config.ts`) |
| 5 | Content-Security-Policy | 🟡 Medium | Documented, ready to enable after a preview test |
| 6 | npm audit (10 moderate) | 🟢 Low | Reviewed — dev/build-time only, no action |

---

## ✅ What's already solid (the reassurance, and it's real)

I went looking for the classic "creative-turned-founder" mistakes. The
ones that sink people aren't here:

- **The database is server-only.** Every query runs through Drizzle on
  the server (`src/lib/db`), over a direct connection string. There is
  **no** client-side database access — no `.from().select()` shipped to
  the browser. I grepped every `"use client"` file: none import the DB.
- **No secrets leak to the client.** API keys (Google, Anthropic, VAPID
  private key, DB URL) are all server-side env vars. The only public env
  vars are the ones that are *supposed* to be public (Supabase URL +
  anon key, which are public by design).
- **Writes are authenticated and validated.** `/api/follows` requires a
  signed-in user (`getServerUserId`); push subscribe/test validate the
  payload shape; the cron endpoints check a secret; `/admin/*` is behind
  Basic Auth that **fails closed** (unreachable if creds aren't set).
- **Paid APIs are shielded.** Google-proxy routes are behind an
  origin-check **and** a durable per-IP rate limiter (Upstash Redis).
- **`.env*` is gitignored**; no secret committed to the repo.
- **Error capture without source-map leakage** (Sentry, sourcemaps off).

That's a better starting posture than most funded startups have. So the
rest of this is hardening, not firefighting — with one exception.

---

## 🔴 1. CRITICAL — Row Level Security was not enabled (now fixed in code)

**This is the one I'm pushing you on.** It's the exact kind of invisible
mistake you were worried about.

**The mechanic:** the app reaches Postgres through Drizzle over a
*direct connection* using a privileged role — that path is fine and
bypasses everything below. But Supabase **also** publishes every table
in the `public` schema through a second door: its PostgREST API at
`https://<project>.supabase.co/rest/v1/<table>`, authenticated with the
**anon key** — and the anon key is *public* (it ships in your client
bundle as `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it's meant to be).

Without Row Level Security, that public key can read and write your
tables directly, bypassing the app entirely. Exposed:

- `user_profiles` — your users' auth IDs + profile data
- `push_subscriptions` — endpoints **plus** the `p256dh`/`auth` keys
  needed to *forge push notifications* to your users
- `follows` — who-saved-what behavioral data
- `submissions`, `place_claims`, `business_updates` — user/business input
- `places.email` — business contact emails (scrape bait)

**The fix (`drizzle/0007_enable_rls.sql`):** enable RLS on all 17 tables
with **no policies** = deny-by-default for the public roles, and revoke
the blanket grants Supabase hands `anon`/`authenticated`. The app keeps
working untouched because its privileged connection bypasses RLS. **It
breaks nothing.** I wrote it but can't run it — it needs your database.

**You run it once:** Supabase Dashboard → SQL Editor → paste the file →
Run. (Or wire it into your Drizzle migrate step.) It's idempotent.

Then verify it worked — this should return **zero rows / an error**, not
your data:
```bash
curl "https://<your-project>.supabase.co/rest/v1/user_profiles?select=*" \
  -H "apikey: <your-anon-key>"
```

---

## 🟠 2. HIGH — Confirm backups / PITR ("if this blows up")

You said "if this thing blows up I want the foundation correct." Part of
that is: **can you recover the data if a bad migration or a bad actor
wipes it?** I can't see your Supabase plan from here.

**Check:** Supabase Dashboard → Database → Backups. Free tier gives
daily backups with limited retention; **Point-in-Time-Recovery** (Pro
add-on) lets you rewind to any second. For anything you'd be sad to
lose, turn on PITR. This is cheap insurance and the #1 thing founders
forget until the day they need it.

---

## 🟠 3. HIGH — Confirm the rate limiter is actually armed in prod

The per-IP rate limiter on the paid Google-proxy routes
(`src/lib/origin-check.ts`) is good code, but it **fails open by
design**: if `KV_REST_API_URL` / `KV_REST_API_TOKEN` aren't set, it
becomes a no-op and allows everything (so pre-KV deploys don't break).

That's the right default — but it means **if those env vars aren't set
in production, you have origin-checking only and no real rate limiting**,
and someone forging a `Referer` header could run up your Google bill.

**Check:** Vercel → Project → Settings → Environment Variables. Confirm
`KV_REST_API_URL` and `KV_REST_API_TOKEN` exist for Production (adding
the Upstash/Vercel KV integration injects them automatically). Belt: add
a Vercel Firewall / spend-cap rule too.

---

## 🟡 4. MEDIUM — Security headers (DONE in this branch)

Added to `next.config.ts`, applied to every response:

- **`Strict-Transport-Security`** — force HTTPS (no `preload`, so it's
  reversible).
- **`X-Content-Type-Options: nosniff`** — no MIME sniffing.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — don't leak
  full URLs to other sites.
- **`X-Frame-Options: SAMEORIGIN`** — anti-clickjacking.
- **`Permissions-Policy`** — denies camera/mic/payment/etc.; **allows
  geolocation for our own origin** (the Radius "near me" feature needs
  it).

These are the zero-risk ones — they don't depend on third-party origins,
so they can't break Mapbox / Supabase / analytics.

---

## 🟡 5. MEDIUM — Content-Security-Policy (ready, not shipped blind)

A CSP is the highest-value remaining header — it neuters most XSS. But
it's also the one that **breaks a live app if you ship it wrong**,
because it has to enumerate every third-party origin you actually load:
Mapbox (scripts + workers + blob: + its tile/style hosts), Supabase,
Sentry, Vercel analytics/speed-insights, Google Places photo CDNs, the
image optimizer, and Next's inline styles/scripts.

I **deliberately did not ship this blind**, because I can't load the real
app here (no Mapbox token in the sandbox) to verify it doesn't white-screen
the map. The non-amateur move is to enable it **Report-Only** on a
preview deploy, watch the browser console for violations for a day, widen
the allowlist to cover the legit ones, then flip to enforcing. Starting
point to drop into `headers()` when you want to do that pass together:

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://*.vercel-insights.com https://*.sentry.io;
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.public.blob.vercel-storage.com
    https://*.googleusercontent.com https://*.mapbox.com
    https://images.unsplash.com https://res.cloudinary.com
    https://upload.wikimedia.org https://commons.wikimedia.org;
  connect-src 'self' https://*.supabase.co https://api.mapbox.com
    https://events.mapbox.com https://*.sentry.io https://*.vercel-insights.com;
  font-src 'self' data:;
  frame-ancestors 'none';
  base-uri 'self';
```

Tell me when you want to run that pass — it's a 20-minute job once we
have a preview deploy with the Mapbox token.

---

## 🟢 6. LOW — npm audit (10 moderate) — reviewed, no action needed

All ten trace to two transitive packages, neither a runtime exposure:

- **esbuild ≤0.24.2** — dev-server-only advisory, pulled in by
  `drizzle-kit` (a **devDependency**, never in the production bundle).
  The only fix downgrades drizzle-kit (breaking) — not worth it for a
  tool that never runs in prod.
- **postcss <8.5.10** — a build-time CSS-stringify XSS, **pinned inside
  Next** ("no fix available" until Next bumps it). Build-time, not a
  user-facing runtime path.

`npm audit fix` (non-breaking) is a confirmed no-op here. Re-check after
the next Next.js minor; don't run `--force`.

---

## Things to keep an eye on later (not now)

- **`user_profiles.id` has no FK to `auth.users`** (documented as
  intentional — the API asserts the session before writing). Fine for
  MVP; revisit if you ever write profiles from a second path.
- **A real WAF / bot rule** (Vercel Firewall) once traffic justifies it.
- **Dependency auto-updates** (Dependabot/Renovate) so the postcss/esbuild
  advisories close themselves when upstream ships.
