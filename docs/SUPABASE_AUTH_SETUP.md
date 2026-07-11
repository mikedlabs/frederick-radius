# Supabase Auth handoff

Frederick Radius treats an account as continuity, not admission. Browsing,
saving, My Radius, and Settings work without sign-in. Only Sync & privacy and
the account-backed follows APIs require a verified Supabase session.

## Vercel environment

Set these in Development, Preview, and Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

The first two values are intentionally publishable. Database connection
strings remain server-only. A blank template is committed in `.env.example`.

## Supabase URL configuration

In Authentication → URL Configuration:

- Site URL: `https://frederickradius.app`
- Production redirect: `https://frederickradius.app/auth/callback`
- Local redirect: `http://localhost:3000/auth/callback`
- If a Vercel Preview needs email-link testing, temporarily allow its exact
  callback URL. Supabase also supports
  `https://*-mikedlab.vercel.app/auth/callback`, but an exact host is safer.

The application validates every `next` value again before redirecting, so an
email cannot turn the callback into an external redirect.

## Recommended production email

The interface supports the existing sign-in button and a six-digit email code.
For the most reliable cross-device flow—and to avoid email security scanners
consuming a sign-in link—use a code-only Magic Link template.

Subject:

```text
Your Frederick Radius sign-in code
```

HTML body:

```html
<h2 style="margin:0 0 16px;color:#17201b;">Keep your Frederick with you</h2>
<p style="margin:0 0 12px;color:#4d5852;line-height:1.6;">
  Enter this one-time code in Frederick Radius:
</p>
<p style="margin:20px 0;font-size:32px;font-weight:700;letter-spacing:0.18em;color:#17201b;">
  {{ .Token }}
</p>
<p style="margin:0 0 12px;color:#4d5852;line-height:1.6;">
  The code expires soon and can be used once. If you did not request it, you
  can ignore this email.
</p>
<p style="margin:20px 0 0;color:#77807b;font-size:13px;line-height:1.5;">
  Signing in keeps places from My Radius across devices. It does not subscribe
  you to newsletters or alerts.
</p>
```

Do not include `{{ .ConfirmationURL }}` in the code-only version. Configure
custom SMTP from the Frederick Radius domain for production deliverability and
turn off link tracking for auth mail.

## Release check

1. While signed out, save one place. It must appear immediately in My Radius.
2. Request a sign-in email and enter the six-digit code.
3. Confirm the app returns to the original destination and the saved place is
   shown as account-backed only after the server confirms it.
4. Open My Radius in a second browser and confirm the place appears.
5. Stop syncing. Confirm the first browser is signed out, local events/routes
   remain, and the second browser session remains active.
